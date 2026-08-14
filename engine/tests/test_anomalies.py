"""Every detector must be shown firing and not firing.

A detector that returns nothing for everything passes any test that only checks true
positives, so each class here carries both directions.
"""
from __future__ import annotations

from conftest import run_schedule
from isolate.scenarios import BY_ID, abort, begin, commit, pread, read, write
from isolate.types import IsolationLevel

RU = IsolationLevel.READ_UNCOMMITTED
RC = IsolationLevel.READ_COMMITTED
RR = IsolationLevel.REPEATABLE_READ
SER = IsolationLevel.SERIALIZABLE


class TestG1a:
    """aborted reads. only reachable at read uncommitted"""

    def test_fires_when_a_committed_txn_read_an_aborted_write(self):
        result = run_schedule(BY_ID["G1a"].operations, RU)
        assert "G1a" in result.anomalies

    def test_the_reader_actually_saw_the_doomed_value(self):
        result = run_schedule(BY_ID["G1a"].operations, RU)
        reads = [s.op.value for s in result.steps if s.op.txn == 2 and s.op.kind.value == "read"]
        assert 101 in reads

    def test_does_not_fire_at_read_committed(self):
        assert "G1a" not in run_schedule(BY_ID["G1a"].operations, RC).anomalies

    def test_does_not_fire_when_the_writer_commits(self):
        clean = [
            begin(1), begin(2),
            write(1, "1", 101),
            read(2, "1"),
            commit(1),
            read(2, "1"),
            commit(2),
        ]
        assert "G1a" not in run_schedule(clean, RU).anomalies

    def test_does_not_fire_when_the_reader_aborts_too(self):
        """G1a is about a committed transaction observing rolled back work"""
        both_abort = [
            begin(1), begin(2),
            write(1, "1", 101),
            read(2, "1"),
            abort(1),
            abort(2),
        ]
        assert "G1a" not in run_schedule(both_abort, RU).anomalies


class TestG1b:
    """intermediate reads. the reader saw a value the writer later replaced"""

    def test_fires_when_a_non_final_value_was_read(self):
        result = run_schedule(BY_ID["G1b"].operations, RU)
        assert "G1b" in result.anomalies

    def test_the_reader_saw_the_intermediate_value(self):
        result = run_schedule(BY_ID["G1b"].operations, RU)
        reads = [s.op.value for s in result.steps if s.op.txn == 2 and s.op.kind.value == "read"]
        assert 101 in reads

    def test_does_not_fire_at_read_committed(self):
        assert "G1b" not in run_schedule(BY_ID["G1b"].operations, RC).anomalies

    def test_does_not_fire_when_the_value_read_was_final(self):
        final_only = [
            begin(1), begin(2),
            write(1, "1", 11),
            commit(1),
            read(2, "1"),
            commit(2),
        ]
        assert "G1b" not in run_schedule(final_only, RU).anomalies


class TestG0:
    def test_fires_when_write_locking_is_absent(self):
        """a ww cycle needs two transactions interleaving writes on two keys"""
        result = run_schedule(BY_ID["G0"].operations, RU)
        assert result.final == {"1": 12, "2": 22}

    def test_does_not_fire_on_a_single_writer(self):
        one = [begin(1), write(1, "1", 11), write(1, "2", 21), commit(1)]
        assert run_schedule(one, RC).anomalies == []


class TestG2Item:
    def test_fires_on_write_skew(self):
        assert "G2-item" in run_schedule(BY_ID["G2-item"].operations, RR).anomalies

    def test_does_not_fire_at_serializable(self):
        assert "G2-item" not in run_schedule(BY_ID["G2-item"].operations, SER).anomalies

    def test_does_not_fire_when_the_writes_overlap_the_reads(self):
        """both write the same key, so the second is blocked and there is no skew"""
        same_key = [
            begin(1), begin(2),
            read(1, "1"), read(2, "1"),
            write(1, "1", 11),
            commit(1),
            commit(2),
        ]
        assert "G2-item" not in run_schedule(same_key, RR).anomalies


class TestG2:
    def test_fires_on_predicate_write_skew(self):
        assert "G2" in run_schedule(BY_ID["G2"].operations, RR).anomalies

    def test_does_not_fire_at_serializable(self):
        assert "G2" not in run_schedule(BY_ID["G2"].operations, SER).anomalies

    def test_does_not_fire_for_a_lone_predicate_read(self):
        alone = [begin(1), pread(1, "value % 3 = 0"), commit(1)]
        assert run_schedule(alone, RR).anomalies == []


# T3 accepts T1 by reading its write to key 1, then reads key 2 before T1 writes it
TORN_READ = [
    begin(1), begin(3),
    write(1, "1", 11),
    read(3, "1"),
    read(3, "2"),
    write(1, "2", 19),
    commit(1), commit(3),
]


class TestOTV:
    """T1 appears to T3 through one key, then the rest of it is not there"""

    def test_fires_when_a_transaction_appears_partially(self):
        result = run_schedule(TORN_READ, RU)
        assert "OTV" in result.anomalies

    def test_the_observer_saw_one_key_new_and_the_other_old(self):
        result = run_schedule(TORN_READ, RU)
        reads = [
            (s.op.key, s.op.value)
            for s in result.steps
            if s.op.txn == 3 and s.op.kind.value == "read"
        ]
        assert reads == [("1", 11), ("2", 20)]

    def test_snapshot_levels_prevent_it(self):
        for level in (RC, RR, SER):
            assert "OTV" not in run_schedule(TORN_READ, level).anomalies

    def test_postgres_read_committed_prevents_the_hermitage_case(self):
        """the published OTV schedule, which postgres blocks its way out of"""
        for level in (RC, RR, SER):
            assert "OTV" not in run_schedule(BY_ID["OTV"].operations, level).anomalies

    def test_does_not_fire_with_a_single_writer_and_reader(self):
        simple = [
            begin(1), begin(2),
            write(1, "1", 11), write(1, "2", 19),
            commit(1),
            read(2, "1"), read(2, "2"),
            commit(2),
        ]
        assert "OTV" not in run_schedule(simple, RC).anomalies


class TestNoFalsePositives:
    """a clean serial schedule must report nothing at any level"""

    def test_serial_execution_is_clean(self):
        serial = [
            begin(1), read(1, "1"), write(1, "1", 11), commit(1),
            begin(2), read(2, "1"), write(2, "1", 12), commit(2),
        ]
        for level in (RU, RC, RR, SER):
            assert run_schedule(serial, level).anomalies == []

    def test_read_only_transactions_are_clean(self):
        readonly = [
            begin(1), begin(2),
            read(1, "1"), read(2, "1"),
            read(1, "2"), read(2, "2"),
            commit(1), commit(2),
        ]
        for level in (RU, RC, RR, SER):
            assert run_schedule(readonly, level).anomalies == []

    def test_disjoint_keys_are_clean(self):
        disjoint = [
            begin(1), begin(2),
            write(1, "1", 11),
            write(2, "2", 22),
            commit(1), commit(2),
        ]
        assert run_schedule(disjoint, SER).anomalies == []
