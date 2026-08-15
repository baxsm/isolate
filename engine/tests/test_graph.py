"""Edge construction and classification.

Direction is asserted explicitly everywhere. An rw edge pointing the wrong way still
produces a cycle and still looks right in a picture, so only the direction catches it.
"""
from __future__ import annotations

from conftest import run_schedule
from isolate.graph import DependencyGraph, _classify
from isolate.scenarios import BY_ID, begin, commit, read, write
from isolate.types import Edge, EdgeKind, IsolationLevel

RC = IsolationLevel.READ_COMMITTED
RR = IsolationLevel.REPEATABLE_READ
SER = IsolationLevel.SERIALIZABLE


def edge(frm: int, to: int, kind: EdgeKind, key: str = "1", item: bool = True) -> Edge:
    return Edge(frm=frm, to=to, kind=kind, key=key, item_level=item, at_step=0)


def find(edges: list[Edge], frm: int, to: int, kind: EdgeKind) -> Edge | None:
    for e in edges:
        if e.frm == frm and e.to == to and e.kind is kind:
            return e
    return None


class TestEdgeDirection:
    def test_wr_points_from_writer_to_reader(self):
        """T1 writes, T2 reads it. the edge runs T1 -> T2"""
        result = run_schedule(
            [begin(1), write(1, "1", 11), commit(1), begin(2), read(2, "1"), commit(2)], RC
        )
        edges = result.steps[-1].edges
        assert find(edges, 1, 2, EdgeKind.WR) is not None
        assert find(edges, 2, 1, EdgeKind.WR) is None

    def test_ww_points_from_first_writer_to_second(self):
        result = run_schedule(
            [begin(1), write(1, "1", 11), commit(1), begin(2), write(2, "1", 12), commit(2)], RC
        )
        edges = result.steps[-1].edges
        assert find(edges, 1, 2, EdgeKind.WW) is not None
        assert find(edges, 2, 1, EdgeKind.WW) is None

    def test_rw_points_from_reader_to_writer(self):
        """T1 reads, T2 overwrites. the reader anti-depends on the writer, so T1 -> T2"""
        result = run_schedule(
            [begin(1), begin(2), read(1, "1"), write(2, "1", 99), commit(2), commit(1)], RC
        )
        edges = result.steps[-1].edges
        assert find(edges, 1, 2, EdgeKind.RW) is not None
        assert find(edges, 2, 1, EdgeKind.RW) is None

    def test_rw_direction_in_write_skew(self):
        """both directions exist here, one per key, and each must point reader -> writer"""
        result = run_schedule(BY_ID["G2-item"].operations, RR)
        edges = result.steps[-1].edges
        forward = find(edges, 1, 2, EdgeKind.RW)
        backward = find(edges, 2, 1, EdgeKind.RW)
        assert forward is not None and forward.key == "2"
        assert backward is not None and backward.key == "1"


class TestSsiConflictDirection:
    """the flags must mirror the edge direction: reader out, writer in"""

    def test_reader_gets_out_conflict_and_writer_gets_in(self):
        result = run_schedule(
            [begin(1), begin(2), read(1, "1"), write(2, "1", 99), commit(2), commit(1)], SER
        )
        txns = result.steps[3].txns
        assert txns[1].out_conflict is True
        assert txns[1].in_conflict is False
        assert txns[2].in_conflict is True
        assert txns[2].out_conflict is False

    def test_pivot_has_both_flags(self):
        """the fekete pivot is the only transaction with an in and an out conflict"""
        result = run_schedule(BY_ID["G2-fekete"].operations, SER)
        final = result.steps[-1].txns
        assert final[1].in_conflict and final[1].out_conflict
        assert not (final[2].in_conflict and final[2].out_conflict)
        assert not (final[3].in_conflict and final[3].out_conflict)


class TestEdgeRecording:
    def test_wr_edge_exists_for_every_cross_transaction_read(self):
        result = run_schedule(BY_ID["G1c"].operations, RC)
        edges = result.steps[-1].edges
        assert find(edges, 2, 1, EdgeKind.RW) is not None
        assert find(edges, 1, 2, EdgeKind.RW) is not None

    def test_reading_own_write_makes_no_edge(self):
        result = run_schedule([begin(1), write(1, "1", 11), read(1, "1"), commit(1)], RC)
        assert result.steps[-1].edges == []

    def test_seed_versions_make_no_edge(self):
        """xid 0 is the bootstrap transaction and is not a node in the graph"""
        result = run_schedule([begin(1), read(1, "1"), commit(1)], RC)
        assert result.steps[-1].edges == []

    def test_ww_edge_present_in_write_cycle(self):
        result = run_schedule(BY_ID["G0"].operations, RC)
        edges = result.steps[-1].edges
        assert find(edges, 1, 2, EdgeKind.WW) is not None

    def test_predicate_write_records_a_predicate_level_edge(self):
        result = run_schedule(BY_ID["G2"].operations, RR)
        rw = [e for e in result.steps[-1].edges if e.kind is EdgeKind.RW]
        assert rw
        assert all(not e.item_level for e in rw)


class TestClassify:
    def test_all_ww_is_g0(self):
        cycle = [edge(1, 2, EdgeKind.WW), edge(2, 1, EdgeKind.WW)]
        assert _classify(cycle) == "G0"

    def test_ww_and_wr_is_g1c(self):
        cycle = [edge(1, 2, EdgeKind.WR), edge(2, 1, EdgeKind.WW)]
        assert _classify(cycle) == "G1c"

    def test_all_wr_is_g1c(self):
        cycle = [edge(1, 2, EdgeKind.WR), edge(2, 1, EdgeKind.WR)]
        assert _classify(cycle) == "G1c"

    def test_one_rw_is_g_single(self):
        cycle = [edge(1, 2, EdgeKind.RW), edge(2, 1, EdgeKind.WR)]
        assert _classify(cycle) == "G-single"

    def test_two_item_level_rw_is_g2_item(self):
        cycle = [edge(1, 2, EdgeKind.RW), edge(2, 1, EdgeKind.RW)]
        assert _classify(cycle) == "G2-item"

    def test_predicate_rw_is_g2(self):
        cycle = [edge(1, 2, EdgeKind.RW, item=False), edge(2, 1, EdgeKind.RW)]
        assert _classify(cycle) == "G2"


class TestCycles:
    def test_no_cycle_in_an_acyclic_graph(self):
        graph = DependencyGraph()
        graph.mark_committed(1)
        graph.mark_committed(2)
        graph._add(edge(1, 2, EdgeKind.WR))
        assert graph.cycles() == []

    def test_finds_a_two_node_cycle(self):
        graph = DependencyGraph()
        graph.mark_committed(1)
        graph.mark_committed(2)
        graph._add(edge(1, 2, EdgeKind.RW))
        graph._add(edge(2, 1, EdgeKind.RW, key="2"))
        assert len(graph.cycles()) == 1

    def test_uncommitted_transactions_are_not_nodes(self):
        """adya's DSG contains committed transactions only"""
        graph = DependencyGraph()
        graph.mark_committed(1)
        graph._add(edge(1, 2, EdgeKind.RW))
        graph._add(edge(2, 1, EdgeKind.RW, key="2"))
        assert graph.cycles() == []

    def test_a_cycle_is_reported_once_not_per_rotation(self):
        graph = DependencyGraph()
        for x in (1, 2, 3):
            graph.mark_committed(x)
        graph._add(edge(1, 2, EdgeKind.RW))
        graph._add(edge(2, 3, EdgeKind.RW, key="2"))
        graph._add(edge(3, 1, EdgeKind.RW, key="3"))
        assert len(graph.cycles()) == 1
