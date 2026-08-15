from __future__ import annotations

from isolate.levels import LEVELS
from isolate.types import IsolationLevel, Snapshot, TxnState, Version


def take_snapshot(
    xids: dict[int, TxnState], next_xid: int, unstarted: frozenset[int] = frozenset()
) -> Snapshot:
    """Snapshot of who is in flight right now.

    `unstarted` names transactions the schedule mentions but that have not begun yet.
    Their labels are used as xids, so a transaction that begins later can still carry a
    lower number, and without listing it here an earlier snapshot would wrongly admit its
    commit. Real xids are handed out in begin order and never need this.
    """
    active = frozenset(x for x, s in xids.items() if s in (TxnState.ACTIVE, TxnState.BLOCKED))
    invisible = active | unstarted
    return Snapshot(xmin=min(invisible, default=next_xid), xmax=next_xid, xip=invisible)


def committed_at_snapshot(xid: int, snapshot: Snapshot, states: dict[int, TxnState]) -> bool:
    """Whether xid's work counts as committed from this snapshot's point of view.

    Four tests in order, and the order matters. Xid 0 is the initial load, which every
    snapshot sees. An xid at or above xmax started after the snapshot was taken and is
    invisible whatever it did. An xid in xip was in flight at snapshot time, so its later
    commit is still invisible. Only then does the real state decide.
    """
    if xid == 0:
        return True
    if xid >= snapshot.xmax:
        return False
    if xid in snapshot.xip:
        return False
    return states.get(xid) is TxnState.COMMITTED


def is_visible(
    version: Version,
    viewer: int,
    snapshot: Snapshot,
    states: dict[int, TxnState],
    level: IsolationLevel,
) -> bool:
    """The one visibility predicate. Every read in the engine goes through here.

    The isolation level does not select a different algorithm. It only decides whether
    uncommitted work is admitted, and (via the caller) when the snapshot was taken.
    """
    sees_uncommitted = LEVELS[level].sees_uncommitted

    if version.xmin == viewer:
        # a transaction always sees its own writes, and its own deletes hide the row
        creator_visible = True
    elif sees_uncommitted:
        # no snapshot filtering, so even an aborted writer's value is readable. that is G1a
        creator_visible = True
    else:
        creator_visible = committed_at_snapshot(version.xmin, snapshot, states)

    if not creator_visible:
        return False

    if version.xmax is None:
        return True
    if version.xmax == viewer:
        return False
    if sees_uncommitted:
        return states.get(version.xmax) is not TxnState.ABORTED

    # the row is live for this viewer unless the expiring transaction counts as committed
    return not committed_at_snapshot(version.xmax, snapshot, states)


def visible_value(
    chain: list[Version],
    viewer: int,
    snapshot: Snapshot,
    states: dict[int, TxnState],
    level: IsolationLevel,
) -> tuple[int | None, Version | None]:
    """Newest visible version in a chain, and its value. None value means absent."""
    for version in reversed(chain):
        if is_visible(version, viewer, snapshot, states, level):
            return version.value, version
    return None, None
