from __future__ import annotations

from dataclasses import dataclass

from isolate.predicates import matches
from isolate.store import VersionStore
from isolate.types import Edge, EdgeKind, Transaction, TxnState, Version


@dataclass(frozen=True)
class ReadRecord:
    txn: int
    key: str
    version: Version | None
    at_step: int
    item_level: bool


@dataclass(frozen=True)
class WriteRecord:
    txn: int
    key: str
    previous: Version | None
    created: Version
    at_step: int


@dataclass(frozen=True)
class PredicateScan:
    txn: int
    key: str
    predicate: str
    at_step: int


class DependencyGraph:
    """Builds the DSG as operations execute, per Adya definitions 3, 5 and 6.

    Edges are recorded for every transaction, committed or not. The DSG proper only
    contains committed transactions, so cycle detection filters at read time. That split
    is what lets G1a and G1b be detected at all: an aborted writer has no node.
    """

    def __init__(self) -> None:
        self.reads: list[ReadRecord] = []
        self.writes: list[WriteRecord] = []
        self.scans: list[PredicateScan] = []
        self._edges: list[Edge] = []
        self._committed: set[int] = set()
        self._aborted: set[int] = set()

    # recording -------------------------------------------------------------------

    def record_read(
        self, txn: int, key: str, version: Version | None, step: int, item_level: bool
    ) -> None:
        self.reads.append(ReadRecord(txn, key, version, step, item_level))
        if version is not None and version.xmin != txn and version.xmin != 0:
            # wr: this transaction read a version another installed
            self._add(Edge(version.xmin, txn, EdgeKind.WR, key, item_level, step))
        # a read anti-depends on every writer that already overwrote what we read
        if version is not None:
            for later in self.writes:
                if later.key == key and later.txn != txn and _same(later.previous, version):
                    self._add(Edge(txn, later.txn, EdgeKind.RW, key, item_level, step))

    def record_empty_read(self, txn: int, key: str, step: int) -> None:
        self.reads.append(ReadRecord(txn, key, None, step, True))

    def record_predicate_scan(self, txn: int, key: str, predicate: str, step: int) -> None:
        self.scans.append(PredicateScan(txn, key, predicate, step))

    def record_write(
        self, txn: int, key: str, previous: Version | None, created: Version, step: int
    ) -> None:
        self.writes.append(WriteRecord(txn, key, previous, created, step))

        if previous is not None and previous.xmin != txn and previous.xmin != 0:
            # ww: this version was installed immediately after one another txn installed
            self._add(Edge(previous.xmin, txn, EdgeKind.WW, key, True, step))

        # rw: a reader of the version we just overwrote anti-depends on us
        for read in self.reads:
            if read.key != key or read.txn == txn:
                continue
            if _same(read.version, previous):
                self._add(Edge(read.txn, txn, EdgeKind.RW, key, read.item_level, step))

        # rw from a predicate scan this write brings into or out of range. every scan is
        # checked against every key, because a scan also covers rows that did not exist
        # when it ran, and that is exactly how a phantom shows up
        for scan in self.scans:
            if scan.txn == txn:
                continue
            if _scan_affected(scan, key, previous, created):
                self._add(Edge(scan.txn, txn, EdgeKind.RW, key, False, step))

    def mark_committed(self, txn: int) -> None:
        self._committed.add(txn)

    def mark_aborted(self, txn: int) -> None:
        self._aborted.add(txn)

    def _add(self, edge: Edge) -> None:
        if edge.frm == edge.to:
            return
        for existing in self._edges:
            if (
                existing.frm == edge.frm
                and existing.to == edge.to
                and existing.kind == edge.kind
                and existing.key == edge.key
            ):
                return
        self._edges.append(edge)

    # reading ---------------------------------------------------------------------

    def edges(self) -> list[Edge]:
        return list(self._edges)

    def committed_edges(self) -> list[Edge]:
        return [
            e
            for e in self._edges
            if e.frm in self._committed and e.to in self._committed
        ]

    def cycles(self) -> list[list[Edge]]:
        """Cycles over committed transactions only. Adya's DSG has no aborted nodes."""
        edges = self.committed_edges()
        adjacency: dict[int, list[Edge]] = {}
        for edge in edges:
            adjacency.setdefault(edge.frm, []).append(edge)

        found: list[list[Edge]] = []
        seen: set[tuple[int, ...]] = set()

        def walk(start: int, node: int, path: list[Edge], visited: set[int]) -> None:
            for edge in adjacency.get(node, []):
                if edge.to == start:
                    cycle = [*path, edge]
                    signature = _canonical(cycle)
                    if signature not in seen:
                        seen.add(signature)
                        found.append(cycle)
                elif edge.to not in visited and edge.to > start:
                    walk(start, edge.to, [*path, edge], visited | {edge.to})

        for node in sorted({e.frm for e in edges}):
            walk(node, node, [], {node})
        return found

    def anomalies(self, txns: dict[int, Transaction], store: VersionStore) -> list[str]:
        """Every G-code detectable as of now. Cycles plus the two history patterns."""
        found: set[str] = set()

        for cycle in self.cycles():
            found.add(_classify(cycle))

        if self._detect_g1a(txns):
            found.add("G1a")
        if self._detect_g1b(txns, store):
            found.add("G1b")
        if self._detect_otv(txns):
            found.add("OTV")

        order = ["G0", "G1a", "G1b", "G1c", "OTV", "PMP", "P4", "G-single", "G2-item", "G2"]
        return [code for code in order if code in found]

    def _detect_g1a(self, txns: dict[int, Transaction]) -> bool:
        """A committed transaction read a version whose writer later aborted."""
        for read in self.reads:
            if read.version is None or read.txn not in self._committed:
                continue
            writer = read.version.xmin
            if writer in (0, read.txn) or txns.get(writer) is None:
                continue
            if txns[writer].state is TxnState.ABORTED:
                return True
        return False

    def _detect_g1b(self, txns: dict[int, Transaction], store: VersionStore) -> bool:
        """A committed transaction read a version that was not the writer's final one."""
        for read in self.reads:
            if read.version is None or read.txn not in self._committed:
                continue
            writer = read.version.xmin
            if writer in (0, read.txn) or txns.get(writer) is None:
                continue
            if txns[writer].state is not TxnState.COMMITTED:
                continue
            read_at = read.version.created_at_step
            later = [
                w
                for w in self.writes
                if w.txn == writer and w.key == read.key and w.at_step > read_at
            ]
            if later:
                return True
        return False

    def _detect_otv(self, txns: dict[int, Transaction]) -> bool:
        """Observed Transaction Vanishes, on the unfolded serialization graph.

        A transaction saw one key's write from T but an earlier version of another key
        that T also wrote. T's effects appeared partially, then the rest vanished.
        """
        for observer in txns:
            for seen in self.reads:
                if seen.txn != observer or seen.version is None:
                    continue
                writer = seen.version.xmin
                if writer in (0, observer):
                    continue
                # every later read by the same observer, of another key the writer wrote
                for later in self.reads:
                    if (
                        later.txn != observer
                        or later.at_step <= seen.at_step
                        or later.key == seen.key
                        or later.version is None
                    ):
                        continue
                    wrote_later_key = [
                        w for w in self.writes if w.txn == writer and w.key == later.key
                    ]
                    if not wrote_later_key:
                        continue
                    # the observer already accepted this writer, so seeing a version of
                    # another of its keys that predates its write means it vanished
                    if all(
                        later.version.created_at_step < w.created.created_at_step
                        for w in wrote_later_key
                    ):
                        return True
        return False


def _same(a: Version | None, b: Version | None) -> bool:
    """Identity by creator and creation step.

    Expiring a version replaces it in the chain, so two copies of the same logical version
    stop comparing equal as soon as anything overwrites it.
    """
    if a is None or b is None:
        return False
    return a.xmin == b.xmin and a.created_at_step == b.created_at_step and a.key == b.key


def _scan_affected(
    scan: PredicateScan, key: str, previous: Version | None, created: Version
) -> bool:
    """Whether a write changes what the scan's predicate would have returned."""
    before = previous.value if previous is not None else None
    after = created.value
    try:
        was_in = before is not None and matches(scan.predicate, key, before)
        now_in = after is not None and matches(scan.predicate, key, after)
    except Exception:
        return False
    return was_in != now_in or (was_in and now_in and before != after)


def _canonical(cycle: list[Edge]) -> tuple[int, ...]:
    nodes = [e.frm for e in cycle]
    if not nodes:
        return ()
    lowest = nodes.index(min(nodes))
    return tuple(nodes[lowest:] + nodes[:lowest])


def _classify(cycle: list[Edge]) -> str:
    kinds = [e.kind for e in cycle]
    rw = [e for e in cycle if e.kind is EdgeKind.RW]
    if not rw:
        if all(k is EdgeKind.WW for k in kinds):
            return "G0"
        return "G1c"
    if any(not e.item_level for e in rw):
        return "G2"
    if len(rw) == 1:
        return "G-single"
    return "G2-item"
