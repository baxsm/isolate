"""Invariants over generated schedules.

These catch the schedules nobody thought to hand-write, and in particular a detector that
silently never fires.
"""
from __future__ import annotations

from hypothesis import HealthCheck, given, settings
from hypothesis import strategies as st

from conftest import run_schedule
from isolate.types import EdgeKind, IsolationLevel, Operation, OpKind, TxnState

KEYS = ["1", "2"]
TXNS = [1, 2, 3]

slow = settings(
    max_examples=300,
    deadline=None,
    suppress_health_check=[HealthCheck.too_slow, HealthCheck.filter_too_much],
)


@st.composite
def schedules(draw: st.DrawFn, max_ops: int = 14) -> list[Operation]:
    """A well-formed schedule: every transaction begins once and ends at most once."""
    txns = draw(st.lists(st.sampled_from(TXNS), min_size=1, max_size=3, unique=True))
    began: set[int] = set()
    ended: set[int] = set()
    ops: list[Operation] = []
    count = draw(st.integers(min_value=len(txns), max_value=max_ops))

    for _ in range(count):
        live = [t for t in txns if t in began and t not in ended]
        unstarted = [t for t in txns if t not in began]
        choices: list[str] = []
        if unstarted:
            choices.append("begin")
        if live:
            choices += ["read", "write", "commit", "abort"]
        if not choices:
            break
        kind = draw(st.sampled_from(choices))

        if kind == "begin":
            txn = draw(st.sampled_from(unstarted))
            began.add(txn)
            ops.append(Operation(txn=txn, kind=OpKind.BEGIN))
        elif kind == "read":
            ops.append(
                Operation(
                    txn=draw(st.sampled_from(live)),
                    kind=OpKind.READ,
                    key=draw(st.sampled_from(KEYS)),
                )
            )
        elif kind == "write":
            ops.append(
                Operation(
                    txn=draw(st.sampled_from(live)),
                    kind=OpKind.WRITE,
                    key=draw(st.sampled_from(KEYS)),
                    value=draw(st.integers(min_value=0, max_value=99)),
                )
            )
        else:
            txn = draw(st.sampled_from(live))
            ended.add(txn)
            ops.append(
                Operation(txn=txn, kind=OpKind.COMMIT if kind == "commit" else OpKind.ABORT)
            )

    for txn in [t for t in txns if t in began and t not in ended]:
        ops.append(Operation(txn=txn, kind=OpKind.COMMIT))
    return ops


class TestReadCommitted:
    @slow
    @given(schedules())
    def test_never_reads_an_uncommitted_value(self, ops: list[Operation]) -> None:
        """the defining guarantee of read committed"""
        result = run_schedule(ops, IsolationLevel.READ_COMMITTED)
        for step in result.steps:
            if step.op.kind is not OpKind.READ or step.outcome != "ok":
                continue
            if step.op.value is None:
                continue
            chain = step.versions.get(step.op.key or "", [])
            source = [v for v in chain if v.value == step.op.value]
            if not source:
                continue
            # the value read must come from a version whose writer committed, or from self
            writers = {v.xmin for v in source}
            states = {x: t.state for x, t in step.txns.items()}
            assert any(
                w == 0 or w == step.op.txn or states.get(w) is not TxnState.ACTIVE
                for w in writers
            )

    @slow
    @given(schedules())
    def test_committed_writes_become_visible(self, ops: list[Operation]) -> None:
        result = run_schedule(ops, IsolationLevel.READ_COMMITTED)
        final = result.steps[-1]
        for key, chain in final.versions.items():
            live = [v for v in chain if v.xmax is None and v.value is not None]
            committed_live = [
                v
                for v in live
                if v.xmin == 0 or final.txns.get(v.xmin, None) is None
                or final.txns[v.xmin].state is TxnState.COMMITTED
            ]
            if committed_live:
                assert result.final.get(key) == committed_live[-1].value


class TestRepeatableRead:
    @slow
    @given(schedules())
    def test_a_transaction_reads_the_same_value_twice(self, ops: list[Operation]) -> None:
        """the defining guarantee of repeatable read, and the one snapshot bugs break"""
        result = run_schedule(ops, IsolationLevel.REPEATABLE_READ)
        seen: dict[tuple[int, str], int | None] = {}
        for step in result.steps:
            if step.op.kind is not OpKind.READ or step.outcome != "ok":
                continue
            txn = step.op.txn
            key = step.op.key or ""
            wrote_since = any(
                s.op.txn == txn
                and s.op.kind is OpKind.WRITE
                and s.op.key == key
                and s.index < step.index
                for s in result.steps
            )
            if wrote_since:
                continue
            if (txn, key) in seen:
                assert seen[(txn, key)] == step.op.value
            else:
                seen[(txn, key)] = step.op.value


class TestSerializable:
    @slow
    @given(schedules())
    def test_no_cycle_survives_to_commit(self, ops: list[Operation]) -> None:
        """the invariant SSI exists to maintain"""
        result = run_schedule(ops, IsolationLevel.SERIALIZABLE)
        assert result.steps[-1].cycles == []

    @slow
    @given(schedules())
    def test_no_anomaly_is_ever_reported(self, ops: list[Operation]) -> None:
        result = run_schedule(ops, IsolationLevel.SERIALIZABLE)
        assert result.anomalies == []

    @slow
    @given(schedules())
    def test_every_rw_cycle_is_broken_by_an_abort(self, ops: list[Operation]) -> None:
        result = run_schedule(ops, IsolationLevel.SERIALIZABLE)
        final = result.steps[-1]
        committed = {x for x, t in final.txns.items() if t.state is TxnState.COMMITTED}
        rw_between_committed = [
            e
            for e in final.edges
            if e.kind is EdgeKind.RW and e.frm in committed and e.to in committed
        ]
        for edge in rw_between_committed:
            reverse = [
                e
                for e in final.edges
                if e.frm == edge.to and e.to == edge.frm and e.kind is EdgeKind.RW
            ]
            assert not reverse, "two committed transactions anti-depend on each other"


class TestAllLevels:
    @slow
    @given(schedules(), st.sampled_from(list(IsolationLevel)))
    def test_the_engine_never_crashes(self, ops: list[Operation], level: IsolationLevel) -> None:
        result = run_schedule(ops, level)
        assert len(result.steps) >= len(ops) - 3

    @slow
    @given(schedules(), st.sampled_from(list(IsolationLevel)))
    def test_an_aborted_transaction_leaves_nothing_behind(
        self, ops: list[Operation], level: IsolationLevel
    ) -> None:
        result = run_schedule(ops, level)
        final = result.steps[-1]
        aborted = {x for x, t in final.txns.items() if t.state is TxnState.ABORTED}
        for key, value in result.final.items():
            # rollback leaves the dead version in the chain on purpose, so more than one
            # version can carry xmax=None. what matters is which value survived
            survivors = [
                v
                for v in final.versions[key]
                if v.xmax is None and v.value == value and v.xmin not in aborted
            ]
            assert survivors, f"final value for {key} came from an aborted transaction"

    @slow
    @given(schedules(), st.sampled_from(list(IsolationLevel)))
    def test_every_step_carries_a_consistent_view(
        self, ops: list[Operation], level: IsolationLevel
    ) -> None:
        """the three panels are built from this, so it must never be internally ragged"""
        result = run_schedule(ops, level)
        for step in result.steps:
            for txn, view in step.visible.items():
                assert step.txns[txn].state in (TxnState.ACTIVE, TxnState.BLOCKED)
                assert set(view) <= set(step.versions)
