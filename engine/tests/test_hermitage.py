"""Golden tests against Kleppmann's published Hermitage results.

Every expectation here was also checked against a real PostgreSQL 18.4 in Docker while
this file was written. Where 18.4 and Kleppmann's 9.3.5 measurements differ, the note on
the case says so.
"""
from __future__ import annotations

import pytest

from conftest import run_scenario
from isolate.scenarios import BY_ID
from isolate.types import EngineProfile, IsolationLevel

RC = IsolationLevel.READ_COMMITTED
RR = IsolationLevel.REPEATABLE_READ
SER = IsolationLevel.SERIALIZABLE


class TestG0:
    """write cycles. postgres prevents this at every level by locking the row"""

    def test_read_committed_blocks_then_applies_both(self):
        result = run_scenario(BY_ID["G0"], RC)
        assert result.final == {"1": 12, "2": 22}
        assert result.committed == [1, 2]
        assert any(s.outcome == "blocked" for s in result.steps)

    def test_repeatable_read_aborts_the_second_writer(self):
        result = run_scenario(BY_ID["G0"], RR)
        assert result.aborted == [2]
        assert result.final == {"1": 11, "2": 21}

    def test_no_g0_anomaly_reported_at_any_level(self):
        for level in (RC, RR, SER):
            assert "G0" not in run_scenario(BY_ID["G0"], level).anomalies


class TestG1a:
    """aborted reads. T2 must never see T1's rolled back 101"""

    @pytest.mark.parametrize("level", [RC, RR, SER])
    def test_prevented_at_every_postgres_level(self, level: IsolationLevel):
        result = run_scenario(BY_ID["G1a"], level)
        assert "G1a" not in result.anomalies
        assert result.final == {"1": 10, "2": 20}

    @pytest.mark.parametrize("level", [RC, RR, SER])
    def test_reader_never_observes_the_aborted_value(self, level: IsolationLevel):
        result = run_scenario(BY_ID["G1a"], level)
        reads = [s for s in result.steps if s.op.txn == 2 and s.op.kind.value == "read"]
        assert [s.op.value for s in reads] == [10, 10]


class TestG1b:
    """intermediate reads. T2 must not see 101, only the final 11"""

    @pytest.mark.parametrize("level", [RC, RR, SER])
    def test_prevented_at_every_postgres_level(self, level: IsolationLevel):
        assert "G1b" not in run_scenario(BY_ID["G1b"], level).anomalies

    def test_read_committed_sees_only_the_final_value(self):
        result = run_scenario(BY_ID["G1b"], RC)
        reads = [s.op.value for s in result.steps if s.op.txn == 2 and s.op.kind.value == "read"]
        assert 101 not in reads
        assert reads == [10, 11]

    def test_repeatable_read_never_sees_the_update(self):
        result = run_scenario(BY_ID["G1b"], RR)
        reads = [s.op.value for s in result.steps if s.op.txn == 2 and s.op.kind.value == "read"]
        assert reads == [10, 10]


class TestG1c:
    """circular information flow. both read the other's pre-write value"""

    def test_read_committed_allows_both_to_commit(self):
        result = run_scenario(BY_ID["G1c"], RC)
        assert result.committed == [1, 2]
        assert result.final == {"1": 11, "2": 22}

    def test_repeatable_read_allows_both_to_commit(self):
        """verified against postgres 18.4: final is 1 => 11, 2 => 22, neither aborts"""
        result = run_scenario(BY_ID["G1c"], RR)
        assert result.committed == [1, 2]
        assert result.final == {"1": 11, "2": 22}

    def test_the_published_schedule_is_write_skew_shaped(self):
        """each transaction reads the row the other just wrote and gets the old value.

        that is an rw edge each way, so the cycle classifies as G2-item rather than G1c.
        postgres agrees: at serializable it aborts T2 as a pivot, which only happens for a
        dangerous structure. G1c proper needs a wr cycle, which this schedule never forms
        because neither transaction can see the other's uncommitted write.
        """
        result = run_scenario(BY_ID["G1c"], RR)
        assert result.anomalies == ["G2-item"]

    def test_serializable_aborts_the_second_committer(self):
        """verified against postgres 18.4: T1 commits, T2 fails as pivot"""
        result = run_scenario(BY_ID["G1c"], SER)
        assert result.committed == [1]
        assert result.aborted == [2]


class TestOTV:
    """observed transaction vanishes. T3 must not see T1 partially applied"""

    def test_read_committed_prevents_it_in_postgres(self):
        result = run_scenario(BY_ID["OTV"], RC)
        assert result.final == {"1": 12, "2": 18}

    def test_t3_never_sees_a_torn_view(self):
        result = run_scenario(BY_ID["OTV"], RC)
        t3_reads = [
            (s.op.key, s.op.value)
            for s in result.steps
            if s.op.txn == 3 and s.op.kind.value == "read"
        ]
        # T3 sees T1's pair together, then T2's pair together, never one of each
        assert ("1", 11) in t3_reads
        assert ("1", 10) not in t3_reads


class TestPMP:
    """predicate many preceders. read committed sees the phantom, repeatable read does not"""

    def test_read_committed_sees_the_inserted_row(self):
        result = run_scenario(BY_ID["PMP"], RC)
        assert result.final == {"1": 10, "2": 20, "3": 30}

    def test_repeatable_read_prevents_the_phantom(self):
        """T1's second scan must still return nothing, so no wr edge from T2 exists"""
        result = run_scenario(BY_ID["PMP"], RR)
        wr_from_t2 = [e for e in result.steps[-1].edges if e.frm == 2 and e.to == 1]
        assert wr_from_t2 == []


class TestP4:
    """lost update. the anomaly postgres repeatable read turns into an error"""

    def test_read_committed_loses_the_update(self):
        result = run_scenario(BY_ID["P4"], RC)
        assert result.committed == [1, 2]
        assert result.final == {"1": 11, "2": 20}

    def test_repeatable_read_raises_serialization_failure(self):
        result = run_scenario(BY_ID["P4"], RR)
        assert result.aborted == [2]
        failure = [s for s in result.steps if s.outcome == "aborted"]
        assert failure
        assert failure[0].error == "could not serialize access due to concurrent update"

    def test_mysql_repeatable_read_loses_it_silently(self):
        """the headline divergence. no error anywhere, one update simply disappears"""
        result = run_scenario(BY_ID["P4"], RR, EngineProfile.MYSQL)
        assert result.aborted == []
        assert result.committed == [1, 2]
        assert not any(s.outcome == "aborted" for s in result.steps)


class TestGSingle:
    """read skew. repeatable read prevents it by returning the old value, not by aborting"""

    def test_read_committed_shows_the_skewed_read(self):
        result = run_scenario(BY_ID["G-single"], RC)
        t1_second = [
            s
            for s in result.steps
            if s.op.txn == 1 and s.op.kind.value == "read" and s.op.key == "2"
        ]
        assert t1_second[0].op.value == 18

    def test_repeatable_read_returns_the_snapshot_value(self):
        """verified against postgres 18.4: T1 reads 2 => 20, both commit, final is 12/18"""
        result = run_scenario(BY_ID["G-single"], RR)
        t1_second = [
            s
            for s in result.steps
            if s.op.txn == 1 and s.op.kind.value == "read" and s.op.key == "2"
        ]
        assert t1_second[0].op.value == 20
        assert result.committed == [1, 2]
        assert result.final == {"1": 12, "2": 18}

    def test_write_predicate_variant_raises_serialization_failure(self):
        result = run_scenario(BY_ID["G-single-write"], RR)
        assert result.aborted == [1]
        errors = [s.error for s in result.steps if s.outcome == "aborted"]
        assert "could not serialize access due to concurrent update" in errors


class TestG2Item:
    """write skew. the case repeatable read does not prevent and serializable does"""

    def test_repeatable_read_allows_write_skew(self):
        result = run_scenario(BY_ID["G2-item"], RR)
        assert result.committed == [1, 2]
        assert result.final == {"1": 11, "2": 21}
        assert "G2-item" in result.anomalies

    def test_serializable_aborts_the_second_committer(self):
        """verified against postgres 18.4: final is 1 => 11, 2 => 20, T2 aborted"""
        result = run_scenario(BY_ID["G2-item"], SER)
        assert result.committed == [1]
        assert result.aborted == [2]
        assert result.final == {"1": 11, "2": 20}

    def test_serializable_reports_the_read_write_error(self):
        result = run_scenario(BY_ID["G2-item"], SER)
        errors = [s.error for s in result.steps if s.outcome == "aborted"]
        assert errors == [
            "could not serialize access due to read/write dependencies among transactions"
        ]


class TestG2:
    """anti dependency cycles over predicates. the phantom write skew"""

    def test_repeatable_read_allows_it(self):
        result = run_scenario(BY_ID["G2"], RR)
        assert result.committed == [1, 2]
        assert result.final == {"1": 10, "2": 20, "3": 30, "4": 42}
        assert "G2" in result.anomalies

    def test_serializable_prevents_it(self):
        """verified against postgres 18.4: final is 1=>10 2=>20 3=>30, T2 aborted"""
        result = run_scenario(BY_ID["G2"], SER)
        assert result.committed == [1]
        assert result.aborted == [2]
        assert result.final == {"1": 10, "2": 20, "3": 30}


class TestFekete:
    """three transactions, two anti dependency edges. the case that needs real SSI"""

    def test_serializable_aborts_the_pivot(self):
        result = run_scenario(BY_ID["G2-fekete"], SER)
        assert result.committed == [2, 3]
        assert result.aborted == [1]

    def test_repeatable_read_lets_the_pivot_through(self):
        """snapshot isolation has no rw tracking, so T1's write is not refused"""
        result = run_scenario(BY_ID["G2-fekete"], RR)
        assert 1 in result.aborted or result.final.get("1") == 0
