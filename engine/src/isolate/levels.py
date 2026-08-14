from __future__ import annotations

from dataclasses import dataclass

from isolate.types import EngineProfile, IsolationLevel


@dataclass(frozen=True)
class LevelBehaviour:
    """Isolation level as data. The executor reads these flags, it does not branch on level."""

    snapshot_per_statement: bool
    sees_uncommitted: bool
    first_updater_wins: bool
    """Whether a write onto a row another transaction changed since our snapshot aborts us."""
    tracks_siread: bool


LEVELS: dict[IsolationLevel, LevelBehaviour] = {
    IsolationLevel.READ_UNCOMMITTED: LevelBehaviour(
        snapshot_per_statement=True,
        sees_uncommitted=True,
        first_updater_wins=False,
        tracks_siread=False,
    ),
    IsolationLevel.READ_COMMITTED: LevelBehaviour(
        snapshot_per_statement=True,
        sees_uncommitted=False,
        first_updater_wins=False,
        tracks_siread=False,
    ),
    IsolationLevel.REPEATABLE_READ: LevelBehaviour(
        snapshot_per_statement=False,
        sees_uncommitted=False,
        first_updater_wins=True,
        tracks_siread=False,
    ),
    IsolationLevel.SERIALIZABLE: LevelBehaviour(
        snapshot_per_statement=False,
        sees_uncommitted=False,
        first_updater_wins=True,
        tracks_siread=True,
    ),
}


@dataclass(frozen=True)
class ProfileBehaviour:
    """How a vendor deviates from the textbook. Every field here is a documented divergence."""

    serialization_error: str
    read_write_error: str
    lost_update_at_repeatable_read: bool
    """MySQL repeatable read is monotonic atomic view, not snapshot isolation. Its reads
    look the same, but writes skip the first-updater-wins abort, so P4 is lost in silence."""
    serializable_uses_ssi: bool
    """MySQL prevents G2 by locking and deadlock, error 1213, not by SSI."""
    deadlock_error: str


PROFILES: dict[EngineProfile, ProfileBehaviour] = {
    EngineProfile.POSTGRES: ProfileBehaviour(
        serialization_error="could not serialize access due to concurrent update",
        read_write_error=(
            "could not serialize access due to read/write dependencies among transactions"
        ),
        lost_update_at_repeatable_read=False,
        serializable_uses_ssi=True,
        deadlock_error="deadlock detected",
    ),
    EngineProfile.MYSQL: ProfileBehaviour(
        serialization_error="",
        read_write_error="",
        lost_update_at_repeatable_read=True,
        serializable_uses_ssi=False,
        deadlock_error="Deadlock found when trying to get lock; try restarting transaction",
    ),
    EngineProfile.GENERIC: ProfileBehaviour(
        serialization_error="serialization failure",
        read_write_error="serialization failure: read/write dependencies",
        lost_update_at_repeatable_read=False,
        serializable_uses_ssi=True,
        deadlock_error="deadlock detected",
    ),
}
