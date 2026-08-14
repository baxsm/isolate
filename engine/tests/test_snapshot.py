from __future__ import annotations

import pytest

from isolate.snapshot import committed_at_snapshot, is_visible, take_snapshot, visible_value
from isolate.types import IsolationLevel, Snapshot, TxnState, Version

RC = IsolationLevel.READ_COMMITTED
RR = IsolationLevel.REPEATABLE_READ
RU = IsolationLevel.READ_UNCOMMITTED


def version(xmin: int, xmax: int | None = None, value: int | None = 10) -> Version:
    return Version(
        key="1", value=value, xmin=xmin, xmax=xmax, created_at_step=0, expired_at_step=None
    )


def snap(xmin: int, xmax: int, xip: set[int] | None = None) -> Snapshot:
    return Snapshot(xmin=xmin, xmax=xmax, xip=frozenset(xip or set()))


class TestTakeSnapshot:
    def test_records_active_transactions(self):
        states = {1: TxnState.ACTIVE, 2: TxnState.COMMITTED, 3: TxnState.ACTIVE}
        result = take_snapshot(states, next_xid=4)
        assert result.xip == frozenset({1, 3})
        assert result.xmin == 1
        assert result.xmax == 4

    def test_blocked_counts_as_active(self):
        result = take_snapshot({1: TxnState.BLOCKED}, next_xid=2)
        assert result.xip == frozenset({1})

    def test_no_active_transactions_gives_xmin_of_xmax(self):
        result = take_snapshot({1: TxnState.COMMITTED}, next_xid=5)
        assert result.xip == frozenset()
        assert result.xmin == 5


class TestCommittedAtSnapshot:
    def test_bootstrap_xid_always_committed(self):
        assert committed_at_snapshot(0, snap(1, 1), {}) is True

    def test_xid_at_or_above_xmax_invisible(self):
        states = {5: TxnState.COMMITTED}
        assert committed_at_snapshot(5, snap(1, 5), states) is False

    def test_in_progress_at_snapshot_time_invisible_even_after_commit(self):
        states = {2: TxnState.COMMITTED}
        assert committed_at_snapshot(2, snap(2, 4, {2}), states) is False

    def test_committed_before_snapshot_visible(self):
        states = {2: TxnState.COMMITTED}
        assert committed_at_snapshot(2, snap(3, 4), states) is True

    def test_active_transaction_not_committed(self):
        states = {2: TxnState.ACTIVE}
        assert committed_at_snapshot(2, snap(3, 4), states) is False

    def test_aborted_transaction_not_committed(self):
        states = {2: TxnState.ABORTED}
        assert committed_at_snapshot(2, snap(3, 4), states) is False


class TestIsVisible:
    def test_own_write_always_visible(self):
        v = version(xmin=7)
        assert is_visible(v, 7, snap(7, 8, {7}), {7: TxnState.ACTIVE}, RR) is True

    def test_own_delete_hides_row(self):
        v = version(xmin=1, xmax=7)
        assert is_visible(v, 7, snap(7, 8, {7}), {7: TxnState.ACTIVE}, RR) is False

    def test_uncommitted_write_invisible_at_read_committed(self):
        v = version(xmin=2)
        assert is_visible(v, 3, snap(2, 4, {2}), {2: TxnState.ACTIVE}, RC) is False

    def test_uncommitted_write_visible_at_read_uncommitted(self):
        v = version(xmin=2)
        assert is_visible(v, 3, snap(2, 4, {2}), {2: TxnState.ACTIVE}, RU) is True

    def test_aborted_write_visible_at_read_uncommitted(self):
        """this is exactly G1a, and read uncommitted is defined by allowing it"""
        v = version(xmin=2)
        assert is_visible(v, 3, snap(2, 4, {2}), {2: TxnState.ABORTED}, RU) is True

    def test_aborted_write_invisible_at_read_committed(self):
        v = version(xmin=2)
        assert is_visible(v, 3, snap(3, 4), {2: TxnState.ABORTED}, RC) is False

    def test_committed_write_visible_when_outside_snapshot(self):
        v = version(xmin=2)
        assert is_visible(v, 3, snap(3, 4), {2: TxnState.COMMITTED}, RR) is True

    def test_expired_by_committed_transaction_invisible(self):
        v = version(xmin=1, xmax=2)
        states = {1: TxnState.COMMITTED, 2: TxnState.COMMITTED}
        assert is_visible(v, 3, snap(3, 4), states, RR) is False

    def test_expired_by_in_flight_transaction_still_visible(self):
        """the row is only gone once the deleter commits, and not for old snapshots"""
        v = version(xmin=1, xmax=2)
        states = {1: TxnState.COMMITTED, 2: TxnState.ACTIVE}
        assert is_visible(v, 3, snap(2, 4, {2}), states, RR) is True

    def test_expired_by_transaction_started_after_snapshot(self):
        v = version(xmin=0, xmax=5)
        states = {5: TxnState.COMMITTED}
        assert is_visible(v, 3, snap(3, 5), states, RR) is True


class TestVisibleValue:
    def test_newest_visible_version_wins(self):
        chain = [version(xmin=0, xmax=2, value=10), version(xmin=2, value=99)]
        states = {2: TxnState.COMMITTED}
        value, found = visible_value(chain, 3, snap(3, 4), states, RR)
        assert value == 99
        assert found is not None and found.xmin == 2

    def test_falls_back_to_older_version_when_newer_invisible(self):
        chain = [version(xmin=0, xmax=2, value=10), version(xmin=2, value=99)]
        states = {2: TxnState.ACTIVE}
        value, _ = visible_value(chain, 3, snap(2, 4, {2}), states, RR)
        assert value == 10

    def test_tombstone_reads_as_absent(self):
        chain = [version(xmin=0, xmax=2, value=10), version(xmin=2, value=None)]
        states = {2: TxnState.COMMITTED}
        value, found = visible_value(chain, 3, snap(3, 4), states, RR)
        assert value is None
        assert found is not None

    def test_empty_chain_returns_none(self):
        value, found = visible_value([], 1, snap(1, 2), {}, RR)
        assert value is None
        assert found is None


@pytest.mark.parametrize("level", [RC, RR])
def test_snapshot_isolation_hides_concurrent_commit(level: IsolationLevel):
    """a transaction in our xip list stays invisible however the snapshot is used"""
    v = version(xmin=2, value=42)
    states = {2: TxnState.COMMITTED}
    assert is_visible(v, 3, snap(2, 4, {2}), states, level) is False
