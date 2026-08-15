from __future__ import annotations

from dataclasses import replace

from isolate.types import Version


class VersionStore:
    """MVCC store. One chain per key, oldest first.

    A version is never removed from a chain. Its xmax is stamped in place when a writer
    expires it, which is what lets the UI show a dead row rather than dropping it.
    """

    def __init__(self) -> None:
        self._chains: dict[str, list[Version]] = {}

    def seed(self, key: str, value: int) -> None:
        """Install an initial version from xid 0, the bootstrap transaction."""
        self._chains.setdefault(key, []).append(
            Version(
                key=key,
                value=value,
                xmin=0,
                xmax=None,
                created_at_step=-1,
                expired_at_step=None,
            )
        )

    def chain(self, key: str) -> list[Version]:
        return list(self._chains.get(key, []))

    def all_keys(self) -> list[str]:
        return sorted(self._chains)

    def snapshot_chains(self) -> dict[str, list[Version]]:
        return {k: list(v) for k, v in sorted(self._chains.items())}

    def live_head(self, key: str) -> Version | None:
        """Newest unexpired version, ignoring visibility."""
        for version in reversed(self._chains.get(key, [])):
            if version.xmax is None:
                return version
        return None

    def append(self, key: str, value: int | None, xid: int, step: int) -> Version:
        """Expire the current head and append a new version created by xid."""
        chain = self._chains.setdefault(key, [])
        for i, version in enumerate(chain):
            if version.xmax is None:
                chain[i] = replace(version, xmax=xid, expired_at_step=step)
        created = Version(
            key=key, value=value, xmin=xid, xmax=None, created_at_step=step, expired_at_step=None
        )
        chain.append(created)
        return created

    def rollback(self, xid: int) -> None:
        """Undo an aborted transaction's expiry marks.

        The versions it created stay in the chain. They are filtered out by visibility
        because their creator aborted, and keeping them is what lets the UI show a dead
        version rather than silently dropping it.
        """
        for key, chain in self._chains.items():
            for i, version in enumerate(chain):
                if version.xmax == xid:
                    chain[i] = replace(version, xmax=None, expired_at_step=None)
            self._chains[key] = chain

    def versions_after(self, key: str, version: Version) -> list[Version]:
        """Versions of key installed after the given one. Drives rw edge detection.

        Matched on creator and creation step, not on equality. Appending expires the head
        in place, so the caller's copy is stale the moment anything is written and an
        equality lookup silently finds nothing.
        """
        chain = self._chains.get(key, [])
        for i, candidate in enumerate(chain):
            same_creator = candidate.xmin == version.xmin
            same_step = candidate.created_at_step == version.created_at_step
            if same_creator and same_step:
                return chain[i + 1 :]
        return []
