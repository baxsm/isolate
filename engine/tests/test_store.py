from __future__ import annotations

from conftest import run_schedule
from isolate.scenarios import begin, commit, read, write
from isolate.store import VersionStore
from isolate.types import IsolationLevel, Operation, OpKind

RC = IsolationLevel.READ_COMMITTED


class TestVersionStore:
    def test_seed_creates_a_version_from_the_bootstrap_xid(self):
        store = VersionStore()
        store.seed("1", 10)
        chain = store.chain("1")
        assert len(chain) == 1
        assert chain[0].xmin == 0
        assert chain[0].xmax is None
        assert chain[0].value == 10

    def test_chains_build_oldest_first(self):
        store = VersionStore()
        store.seed("1", 10)
        store.append("1", 11, xid=1, step=0)
        store.append("1", 12, xid=2, step=1)
        assert [v.value for v in store.chain("1")] == [10, 11, 12]

    def test_append_expires_the_previous_head(self):
        store = VersionStore()
        store.seed("1", 10)
        store.append("1", 11, xid=5, step=3)
        first = store.chain("1")[0]
        assert first.xmax == 5
        assert first.expired_at_step == 3

    def test_live_head_is_the_newest_unexpired_version(self):
        store = VersionStore()
        store.seed("1", 10)
        store.append("1", 11, xid=1, step=0)
        head = store.live_head("1")
        assert head is not None and head.value == 11

    def test_rollback_restores_the_expiry_mark(self):
        store = VersionStore()
        store.seed("1", 10)
        store.append("1", 11, xid=7, step=0)
        store.rollback(7)
        assert store.chain("1")[0].xmax is None

    def test_rollback_keeps_the_dead_version_in_the_chain(self):
        """the UI shows a dead version rather than silently dropping it"""
        store = VersionStore()
        store.seed("1", 10)
        store.append("1", 11, xid=7, step=0)
        store.rollback(7)
        assert len(store.chain("1")) == 2

    def test_versions_after_returns_only_newer_ones(self):
        store = VersionStore()
        store.seed("1", 10)
        target = store.chain("1")[0]
        store.append("1", 11, xid=1, step=0)
        store.append("1", 12, xid=2, step=1)
        assert [v.value for v in store.versions_after("1", target)] == [11, 12]

    def test_versions_after_an_unknown_version_is_empty(self):
        store = VersionStore()
        store.seed("1", 10)
        store.seed("2", 20)
        other = store.chain("2")[0]
        assert store.versions_after("1", other) == []

    def test_keys_are_sorted(self):
        store = VersionStore()
        store.seed("2", 20)
        store.seed("1", 10)
        assert store.all_keys() == ["1", "2"]


class TestDelete:
    def test_delete_writes_a_tombstone_not_a_value(self):
        result = run_schedule(
            [
                begin(1),
                Operation(txn=1, kind=OpKind.DELETE, key="1"),
                commit(1),
                begin(2),
                read(2, "1"),
                commit(2),
            ],
            RC,
        )
        head = result.steps[-1].versions["1"][-1]
        assert head.value is None

    def test_deleted_row_reads_as_absent(self):
        result = run_schedule(
            [
                begin(1),
                Operation(txn=1, kind=OpKind.DELETE, key="1"),
                commit(1),
                begin(2),
                read(2, "1"),
                commit(2),
            ],
            RC,
        )
        the_read = next(s for s in result.steps if s.op.txn == 2 and s.op.kind is OpKind.READ)
        assert the_read.op.value is None

    def test_deleted_row_is_gone_from_the_final_state(self):
        result = run_schedule(
            [begin(1), Operation(txn=1, kind=OpKind.DELETE, key="1"), commit(1)], RC
        )
        assert "1" not in result.final
        assert result.final == {"2": 20}

    def test_delete_ignores_a_value_it_was_given(self):
        """a delete carrying a stray value must still write a tombstone, not resurrect the row"""
        result = run_schedule(
            [
                begin(1),
                Operation(txn=1, kind=OpKind.DELETE, key="1", value=999),
                commit(1),
            ],
            RC,
        )
        assert result.steps[-1].versions["1"][-1].value is None
        assert "1" not in result.final

    def test_a_transaction_does_not_see_its_own_deleted_row(self):
        result = run_schedule(
            [begin(1), Operation(txn=1, kind=OpKind.DELETE, key="1"), read(1, "1"), commit(1)], RC
        )
        the_read = next(s for s in result.steps if s.op.kind is OpKind.READ)
        assert the_read.op.value is None


class TestInsert:
    def test_insert_adds_a_new_key(self):
        result = run_schedule(
            [begin(1), Operation(txn=1, kind=OpKind.INSERT, key="3", value=30), commit(1)], RC
        )
        assert result.final["3"] == 30

    def test_duplicate_insert_is_an_error(self):
        result = run_schedule(
            [begin(1), Operation(txn=1, kind=OpKind.INSERT, key="1", value=99), commit(1)], RC
        )
        assert result.steps[1].outcome == "error"
        assert result.final["1"] == 10

    def test_insert_after_delete_is_allowed(self):
        result = run_schedule(
            [
                begin(1),
                Operation(txn=1, kind=OpKind.DELETE, key="1"),
                Operation(txn=1, kind=OpKind.INSERT, key="1", value=77),
                commit(1),
            ],
            RC,
        )
        assert result.final["1"] == 77


class TestWriteVisibility:
    def test_a_transaction_reads_its_own_uncommitted_write(self):
        result = run_schedule([begin(1), write(1, "1", 42), read(1, "1"), commit(1)], RC)
        the_read = next(s for s in result.steps if s.op.kind is OpKind.READ)
        assert the_read.op.value == 42

    def test_another_transaction_does_not(self):
        result = run_schedule(
            [begin(1), begin(2), write(1, "1", 42), read(2, "1"), commit(1), commit(2)], RC
        )
        the_read = next(s for s in result.steps if s.op.kind is OpKind.READ)
        assert the_read.op.value == 10
