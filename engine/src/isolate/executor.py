from __future__ import annotations

from dataclasses import dataclass, field, replace

from isolate.graph import DependencyGraph
from isolate.levels import LEVELS, PROFILES
from isolate.predicates import PredicateError, matches
from isolate.snapshot import committed_at_snapshot, is_visible, take_snapshot, visible_value
from isolate.store import VersionStore
from isolate.types import (
    EngineProfile,
    IsolationLevel,
    Operation,
    OpKind,
    Outcome,
    Schedule,
    Snapshot,
    Step,
    Transaction,
    TxnState,
    Version,
)

WRITE_KINDS = {OpKind.WRITE, OpKind.INSERT, OpKind.DELETE}
PREDICATE_WRITE_KINDS = {OpKind.PREDICATE_WRITE, OpKind.PREDICATE_DELETE}


@dataclass
class _Blocked:
    """An operation parked because another transaction holds the row's write lock."""

    op: Operation
    waiting_for: int
    key: str


@dataclass
class RunResult:
    steps: list[Step]
    anomalies: list[str]
    committed: list[int]
    aborted: list[int]
    final: dict[str, int | None]
    notes: list[str] = field(default_factory=list)


class Executor:
    def __init__(
        self,
        isolation: dict[int, IsolationLevel],
        profile: EngineProfile = EngineProfile.POSTGRES,
        initial: dict[str, int] | None = None,
    ) -> None:
        self.isolation = isolation
        self.profile = profile
        self.behaviour = PROFILES[profile]
        self.store = VersionStore()
        for key, value in (initial or {}).items():
            self.store.seed(key, value)
        self.txns: dict[int, Transaction] = {}
        self.graph = DependencyGraph()
        self.steps: list[Step] = []
        self.notes: list[str] = []
        self._blocked: list[_Blocked] = []
        self._write_lock_owner: dict[str, int] = {}
        self._rw_out: dict[int, set[int]] = {}
        self._rw_in: dict[int, set[int]] = {}
        self._queued: dict[int, list[Operation]] = {}
        self._shared_locks: dict[str, set[int]] = {}
        self._gap_locks: dict[str, set[int]] = {}
        # the snapshot horizon sits above every transaction label in the schedule, because
        # `_do_begin` uses the label itself as the xid rather than allocating a new one
        self._next_xid = max([*isolation, 0]) + 1
        self._step = 0

    # snapshots ------------------------------------------------------------------

    def _states(self) -> dict[int, TxnState]:
        return {x: t.state for x, t in self.txns.items()}

    def _fresh_snapshot(self) -> Snapshot:
        unstarted = frozenset(x for x in self.isolation if x not in self.txns)
        return take_snapshot(self._states(), self._next_xid, unstarted)

    def _read_snapshot(self, txn: Transaction) -> Snapshot:
        """Read committed re-snapshots per statement, repeatable read keeps the one from begin.

        Getting this backwards makes several anomalies quietly stop reproducing, so it is
        the one place the level flag is consulted on the read path.
        """
        if LEVELS[txn.isolation].snapshot_per_statement:
            return self._fresh_snapshot()
        assert txn.snapshot is not None
        return txn.snapshot

    # reads ----------------------------------------------------------------------

    def _visible_map(self) -> dict[int, dict[str, int | None]]:
        out: dict[int, dict[str, int | None]] = {}
        states = self._states()
        for xid, txn in self.txns.items():
            if txn.state in (TxnState.COMMITTED, TxnState.ABORTED):
                continue
            snap = self._read_snapshot(txn)
            level = txn.isolation
            out[xid] = {
                key: visible_value(self.store.chain(key), xid, snap, states, level)[0]
                for key in self.store.all_keys()
            }
        return out

    # locking --------------------------------------------------------------------

    def _lock_holder(self, key: str) -> int | None:
        holder = self._write_lock_owner.get(key)
        if holder is None:
            return None
        if self.txns[holder].state in (TxnState.COMMITTED, TxnState.ABORTED):
            return None
        return holder

    def _release_locks(self, xid: int) -> None:
        for key, owner in list(self._write_lock_owner.items()):
            if owner == xid:
                del self._write_lock_owner[key]
        for holders in self._shared_locks.values():
            holders.discard(xid)
        for holders in self._gap_locks.values():
            holders.discard(xid)

    def _shared_holders(self, key: str, writer: int, value: int | None = None) -> set[int]:
        """Live transactions other than writer read-locking this row or the gap around it."""
        holders = set(self._shared_locks.get(key, set()))
        if value is not None:
            for predicate, owners in self._gap_locks.items():
                try:
                    if matches(predicate, key, value):
                        holders |= owners
                except PredicateError:
                    continue
        return {
            x
            for x in holders
            if x != writer
            and self.txns.get(x) is not None
            and self.txns[x].state not in (TxnState.COMMITTED, TxnState.ABORTED)
        }

    # execution ------------------------------------------------------------------

    def run(self, schedule: Schedule) -> RunResult:
        for op in schedule:
            self._execute(op)
            self._drain_blocked()
        self._finish_blocked()
        return self._result()

    def _finish_blocked(self) -> None:
        """Anything still blocked when the schedule runs out can never be woken.

        A lock is released on commit or abort, so a transaction that never reached either
        still holds it and the waiter would sit there forever. Recording that as an aborted
        step with the profile's deadlock error is the honest end state, rather than dropping
        the operation.
        """
        for parked in list(self._blocked):
            txn = self.txns.get(parked.op.txn)
            if txn is None or txn.state is not TxnState.BLOCKED:
                continue
            self._abort(parked.op.txn)
            self._emit(parked.op, "aborted", self.behaviour.deadlock_error)
            self._queued.pop(parked.op.txn, None)

    def _execute(self, op: Operation) -> None:
        txn = self.txns.get(op.txn)

        if txn is not None and txn.state is TxnState.BLOCKED and op.kind is not OpKind.ABORT:
            # a real client is stuck waiting on the connection, so the next statement is
            # not rejected, it simply has not been sent yet. queue it behind the block
            self._queued.setdefault(op.txn, []).append(op)
            return
        if txn is not None and txn.state in (TxnState.COMMITTED, TxnState.ABORTED):
            self._emit(op, "error", f"transaction {op.txn} has already ended")
            return
        # every handler below reads `self.txns[op.txn]`, so an operation before its own begin
        # used to raise KeyError out of the whole run. reordering is the point of the editor,
        # and dragging a read above its begin is one drag away at any time
        if txn is None and op.kind is not OpKind.BEGIN:
            self._emit(op, "error", f"transaction {op.txn} has not begun")
            return

        match op.kind:
            case OpKind.BEGIN:
                self._do_begin(op)
            case OpKind.READ:
                self._do_read(op)
            case OpKind.PREDICATE_READ:
                self._do_predicate_read(op)
            case OpKind.WRITE | OpKind.INSERT | OpKind.DELETE:
                self._do_write(op)
            case OpKind.PREDICATE_WRITE | OpKind.PREDICATE_DELETE:
                self._do_predicate_write(op)
            case OpKind.COMMIT:
                self._do_commit(op)
            case OpKind.ABORT:
                self._do_abort(op)

    def _do_begin(self, op: Operation) -> None:
        if op.txn in self.txns:
            self._emit(op, "error", f"transaction {op.txn} already began")
            return
        level = self.isolation.get(op.txn, IsolationLevel.READ_COMMITTED)
        self.txns[op.txn] = Transaction(
            xid=op.txn,
            state=TxnState.ACTIVE,
            isolation=level,
            snapshot=self._fresh_snapshot(),
            began_at_step=self._step,
        )
        self._emit(op, "ok", None)

    def _do_read(self, op: Operation) -> None:
        assert op.key is not None
        txn = self.txns[op.txn]
        snap = self._read_snapshot(txn)
        states = self._states()
        value, version = visible_value(
            self.store.chain(op.key), op.txn, snap, states, txn.isolation
        )
        if version is not None:
            self.graph.record_read(op.txn, op.key, version, self._step, item_level=True)
        else:
            self.graph.record_empty_read(op.txn, op.key, self._step)
        if LEVELS[txn.isolation].tracks_siread:
            txn.siread_locks.add(op.key)
            if self.behaviour.reads_take_shared_locks:
                self._shared_locks.setdefault(op.key, set()).add(op.txn)
            else:
                self._ssi_on_read(op.txn, op.key, version)
        self._emit(op, "ok", None, read_value=value)

    def _do_predicate_read(self, op: Operation) -> None:
        assert op.predicate is not None
        txn = self.txns[op.txn]
        snap = self._read_snapshot(txn)
        states = self._states()
        txn.predicate_reads.append(op.predicate)
        for key in self.store.all_keys():
            value, version = visible_value(
                self.store.chain(key), op.txn, snap, states, txn.isolation
            )
            if value is not None and matches(op.predicate, key, value):
                self.graph.record_read(op.txn, key, version, self._step, item_level=False)
            # a predicate read also depends on rows it did NOT match, which is how a later
            # insert into the predicate range becomes an rw edge
            self.graph.record_predicate_scan(op.txn, key, op.predicate, self._step)
            if LEVELS[txn.isolation].tracks_siread:
                txn.siread_locks.add(key)
                if self.behaviour.reads_take_shared_locks:
                    self._shared_locks.setdefault(key, set()).add(op.txn)
                else:
                    self._ssi_on_read(op.txn, key, version)
        if LEVELS[txn.isolation].tracks_siread:
            # phantom protection: the predicate itself is locked, not only existing rows
            txn.siread_locks.add(f"predicate:{op.predicate}")
            if self.behaviour.reads_take_shared_locks:
                # innodb takes a gap lock over the scanned range, so an insert into it by
                # another transaction deadlocks rather than appearing as a phantom
                self._gap_locks.setdefault(op.predicate, set()).add(op.txn)
        self._emit(op, "ok", None)

    def _do_write(self, op: Operation) -> None:
        assert op.key is not None
        txn = self.txns[op.txn]

        if self._shared_holders(op.key, op.txn, op.value):
            # mysql serializable: the row is read-locked by someone else, so this write
            # waits and the lock manager breaks the wait as a deadlock rather than a
            # serialization failure
            self._abort(op.txn)
            self._emit(op, "aborted", self.behaviour.deadlock_error)
            return

        holder = self._lock_holder(op.key)
        if holder is not None and holder != op.txn:
            txn.state = TxnState.BLOCKED
            self._blocked.append(_Blocked(op=op, waiting_for=holder, key=op.key))
            self._emit(op, "blocked", f"waiting for transaction {holder}")
            return

        self._apply_write(op)

    def _apply_write(self, op: Operation) -> None:
        assert op.key is not None
        txn = self.txns[op.txn]
        snap = self._read_snapshot(txn)
        states = self._states()

        head = self.store.live_head(op.key)
        if head is not None and self._first_updater_wins_conflict(txn, head, snap, states):
            self._abort(op.txn)
            self._emit(op, "aborted", self.behaviour.serialization_error)
            return

        if op.kind is OpKind.INSERT and head is not None and head.value is not None:
            self._emit(op, "error", f"duplicate key {op.key}")
            return

        value = None if op.kind is OpKind.DELETE else op.value
        previous = self.store.live_head(op.key)
        created = self.store.append(op.key, value, op.txn, self._step)
        self._write_lock_owner[op.key] = op.txn
        txn.write_locks.add(op.key)
        self.graph.record_write(op.txn, op.key, previous, created, self._step)
        if self.profile is EngineProfile.MYSQL or LEVELS[txn.isolation].tracks_siread:
            self._ssi_on_write(op.txn, op.key)
        self._emit(op, "ok", None)

    def _first_updater_wins_conflict(
        self,
        txn: Transaction,
        head: Version,
        snap: Snapshot,
        states: dict[int, TxnState],
    ) -> bool:
        """Whether writing over head must abort this transaction.

        The row changed after our snapshot was taken and the change is committed. Under
        snapshot isolation that is a serialization failure. MySQL repeatable read does not
        take this abort, which is the silent lost update.
        """
        if not LEVELS[txn.isolation].first_updater_wins:
            return False
        if txn.isolation is IsolationLevel.REPEATABLE_READ and (
            self.behaviour.lost_update_at_repeatable_read
        ):
            return False
        if head.xmin == txn.xid or head.xmin == 0:
            return False
        if is_visible(head, txn.xid, snap, states, txn.isolation):
            return False
        return committed_at_snapshot(head.xmin, self._fresh_snapshot(), states)

    def _do_predicate_write(self, op: Operation) -> None:
        """A write predicate re-evaluates against the newest committed rows, not the snapshot.

        This is the Postgres EvalPlanQual behaviour: the delete finds rows by the current
        value, then checks its own snapshot, which is where the serialization error comes
        from.
        """
        assert op.predicate is not None
        txn = self.txns[op.txn]
        snap = self._read_snapshot(txn)
        states = self._states()

        for key in self.store.all_keys():
            head = self.store.live_head(key)
            if head is None or head.value is None:
                continue
            visible_now, _ = visible_value(
                self.store.chain(key), op.txn, snap, states, txn.isolation
            )

            if self._shared_holders(key, op.txn):
                self._abort(op.txn)
                self._emit(op, "aborted", self.behaviour.deadlock_error)
                return

            holder = self._lock_holder(key)
            if holder is not None and holder != op.txn:
                txn.state = TxnState.BLOCKED
                self._blocked.append(_Blocked(op=op, waiting_for=holder, key=key))
                self._emit(op, "blocked", f"waiting for transaction {holder}")
                return

            head_matches = matches(op.predicate, key, head.value)
            snapshot_matches = visible_now is not None and matches(op.predicate, key, visible_now)

            # a row is targeted if either view selects it. the snapshot picks the row, then
            # postgres rechecks the current version, which is where EvalPlanQual bites
            if not head_matches and not snapshot_matches:
                continue

            if self._first_updater_wins_conflict(txn, head, snap, states):
                self._abort(op.txn)
                self._emit(op, "aborted", self.behaviour.serialization_error)
                return

            if not head_matches:
                # the snapshot selected a row whose current value no longer matches. mysql
                # silently skips it, postgres already aborted above
                self.notes.append(
                    f"{self.profile.value}: predicate selected {key} from the snapshot but the "
                    "current row no longer matches, so nothing was written"
                )
                continue

            value = None if op.kind is OpKind.PREDICATE_DELETE else op.value
            previous = self.store.live_head(key)
            created = self.store.append(key, value, op.txn, self._step)
            self._write_lock_owner[key] = op.txn
            txn.write_locks.add(key)
            self.graph.record_write(op.txn, key, previous, created, self._step)
            if LEVELS[txn.isolation].tracks_siread:
                self._ssi_on_write(op.txn, key)

        self._emit(op, "ok", None)

    def _do_commit(self, op: Operation) -> None:
        txn = self.txns[op.txn]
        uses_ssi = LEVELS[txn.isolation].tracks_siread and self.behaviour.serializable_uses_ssi
        if uses_ssi and self._is_pivot(op.txn):
            self._abort(op.txn)
            self._emit(op, "aborted", self.behaviour.read_write_error)
            return
        txn.state = TxnState.COMMITTED
        txn.ended_at_step = self._step
        self._release_locks(op.txn)
        self.graph.mark_committed(op.txn)
        self._emit(op, "ok", None)

    def _do_abort(self, op: Operation) -> None:
        self._abort(op.txn)
        self._emit(op, "ok", None)

    def _abort(self, xid: int) -> None:
        txn = self.txns[xid]
        txn.state = TxnState.ABORTED
        txn.ended_at_step = self._step
        self.store.rollback(xid)
        self._release_locks(xid)
        self.graph.mark_aborted(xid)
        self._blocked = [b for b in self._blocked if b.op.txn != xid]

    # blocked queue ---------------------------------------------------------------

    def _drain_blocked(self) -> None:
        """Retry parked operations whose blocker has ended. Commit unblocks the waiter."""
        progressed = True
        while progressed:
            progressed = False
            for parked in list(self._blocked):
                if self._lock_holder(parked.key) not in (None, parked.op.txn):
                    continue
                self._blocked.remove(parked)
                txn = self.txns[parked.op.txn]
                if txn.state is not TxnState.BLOCKED:
                    continue
                txn.state = TxnState.ACTIVE
                if parked.op.kind in PREDICATE_WRITE_KINDS:
                    self._do_predicate_write(parked.op)
                else:
                    self._apply_write(parked.op)
                self._replay_queued(parked.op.txn)
                progressed = True

    def _replay_queued(self, xid: int) -> None:
        """Run the statements that arrived while this transaction was stuck waiting."""
        pending = self._queued.pop(xid, [])
        for op in pending:
            if self.txns[xid].state is TxnState.BLOCKED:
                # blocked again on the next statement, so the rest keeps waiting
                self._queued.setdefault(xid, []).extend(pending[pending.index(op) :])
                return
            self._execute(op)

    # ssi --------------------------------------------------------------------------

    def _ssi_on_read(self, reader: int, key: str, version: Version | None) -> None:
        """A read anti-depends on any concurrent transaction that overwrote what it read.

        Both checks are required. The write lock catches a writer still in flight, and the
        newer-versions walk catches one that already committed. The thesis gives the
        interleaving where dropping either loses the conflict entirely.

        Concurrency is the part that is easy to get wrong. A writer that committed before
        this transaction began is not concurrent with it, so reading its value is a plain
        wr dependency and must not set a flag. Setting one there aborts G1c, which is a
        cycle of wr edges and perfectly serializable.
        """
        holder = self._lock_holder(key)
        if holder is not None and holder != reader and self._concurrent(reader, holder):
            self._set_conflict(writer=holder, reader=reader)
        if version is not None:
            for newer in self.store.versions_after(key, version):
                if newer.xmin != reader and self._concurrent(reader, newer.xmin):
                    self._set_conflict(writer=newer.xmin, reader=reader)

    def _ssi_on_write(self, writer: int, key: str) -> None:
        """A write conflicts with every concurrent transaction holding a SIREAD on the key.

        Predicate locks are matched too, so a row inserted after a scan ran still conflicts
        with that scan. Without this an insert into another transaction's predicate range
        sets no flag at all and G2 goes undetected.
        """
        head = self.store.live_head(key)
        for xid, other in self.txns.items():
            if xid == writer or other.state is TxnState.ABORTED:
                continue
            if not self._concurrent(writer, xid):
                continue
            if key in other.siread_locks:
                self._set_conflict(writer=writer, reader=xid)
                continue
            head_value = head.value if head is not None else None
            if head_value is not None and self._in_predicate(other, key, head_value):
                self._set_conflict(writer=writer, reader=xid)

    def _in_predicate(self, other: Transaction, key: str, value: int) -> bool:
        for predicate in other.predicate_reads:
            try:
                if matches(predicate, key, value):
                    return True
            except PredicateError:
                continue
        return False

    def _concurrent(self, a: int, b: int) -> bool:
        """Whether two transactions overlapped in time.

        They are concurrent unless one had already ended before the other began.
        """
        ta, tb = self.txns.get(a), self.txns.get(b)
        if ta is None or tb is None:
            return False
        a_ended_first = ta.ended_at_step is not None and ta.ended_at_step < tb.began_at_step
        b_ended_first = tb.ended_at_step is not None and tb.ended_at_step < ta.began_at_step
        return not (a_ended_first or b_ended_first)

    def _set_conflict(self, writer: int, reader: int) -> None:
        """rw edge from reader to writer: the reader anti-depends on the writer."""
        if writer not in self.txns or reader not in self.txns:
            return
        self.txns[reader].out_conflict = True
        self.txns[writer].in_conflict = True
        self._rw_out.setdefault(reader, set()).add(writer)
        self._rw_in.setdefault(writer, set()).add(reader)

    def _is_pivot(self, xid: int) -> bool:
        """Whether committing xid would close a dangerous structure.

        A pivot has an incoming and an outgoing rw edge. Cahill aborts the pivot, but a
        dangerous structure only becomes a real cycle once the transaction on the outgoing
        edge has committed. Until then this transaction may commit and the other one takes
        the abort instead.

        That ordering is the whole of first-committer-wins. Testing the two booleans alone
        aborts both sides of a write skew, where real PostgreSQL commits the first and
        fails the second with "canceled on identification as a pivot".
        """
        incoming = {t for t in self._rw_in.get(xid, set()) if self._alive(t)}
        committed_out = {
            t
            for t in self._rw_out.get(xid, set())
            if self.txns.get(t) is not None and self.txns[t].state is TxnState.COMMITTED
        }
        return bool(incoming and committed_out)

    def _alive(self, xid: int) -> bool:
        txn = self.txns.get(xid)
        return txn is not None and txn.state is not TxnState.ABORTED

    # steps -------------------------------------------------------------------------

    def _emit(
        self, op: Operation, outcome: Outcome, error: str | None, read_value: int | None = None
    ) -> None:
        edges = self.graph.edges()
        cycles = self.graph.cycles()
        anomalies = self.graph.anomalies(self.txns, self.store)
        self.steps.append(
            Step(
                index=self._step,
                op=op if read_value is None else replace(op, value=read_value),
                outcome=outcome,
                error=error,
                versions=self.store.snapshot_chains(),
                visible=self._visible_map(),
                txns={x: replace(t) for x, t in self.txns.items()},
                edges=edges,
                cycles=cycles,
                anomalies=anomalies,
            )
        )
        self._step += 1

    def _result(self) -> RunResult:
        anomalies = self.steps[-1].anomalies if self.steps else []
        committed = sorted(x for x, t in self.txns.items() if t.state is TxnState.COMMITTED)
        aborted = sorted(x for x, t in self.txns.items() if t.state is TxnState.ABORTED)
        final: dict[str, int | None] = {}
        states = self._states()
        # a snapshot after everything, so only committed work survives into the final state
        after_all = max([*self.txns, 0]) + 1
        god = Snapshot(xmin=after_all, xmax=after_all, xip=frozenset())
        for key in self.store.all_keys():
            value, _ = visible_value(
                self.store.chain(key), -1, god, states, IsolationLevel.READ_COMMITTED
            )
            if value is not None:
                final[key] = value
        return RunResult(
            steps=self.steps,
            anomalies=anomalies,
            committed=committed,
            aborted=aborted,
            final=final,
            notes=self.notes,
        )
