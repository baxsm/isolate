from __future__ import annotations

from dataclasses import dataclass

from isolate.types import Operation, OpKind, Schedule

INITIAL: dict[str, int] = {"1": 10, "2": 20}


def begin(t: int) -> Operation:
    return Operation(txn=t, kind=OpKind.BEGIN)


def read(t: int, key: str) -> Operation:
    return Operation(txn=t, kind=OpKind.READ, key=key)


def write(t: int, key: str, value: int) -> Operation:
    return Operation(txn=t, kind=OpKind.WRITE, key=key, value=value)


def insert(t: int, key: str, value: int) -> Operation:
    return Operation(txn=t, kind=OpKind.INSERT, key=key, value=value)


def pread(t: int, predicate: str) -> Operation:
    return Operation(txn=t, kind=OpKind.PREDICATE_READ, predicate=predicate)


def pdelete(t: int, predicate: str) -> Operation:
    return Operation(txn=t, kind=OpKind.PREDICATE_DELETE, predicate=predicate)


def commit(t: int) -> Operation:
    return Operation(txn=t, kind=OpKind.COMMIT)


def abort(t: int) -> Operation:
    return Operation(txn=t, kind=OpKind.ABORT)


@dataclass(frozen=True)
class Scenario:
    id: str
    title: str
    anomaly: str
    operations: Schedule
    source: str
    note: str = ""
    initial: dict[str, int] | None = None


SCENARIOS: list[Scenario] = [
    Scenario(
        id="G0",
        title="Write cycles",
        anomaly="G0",
        source="hermitage/postgres.md",
        operations=[
            begin(1), begin(2),
            write(1, "1", 11),
            write(2, "1", 12),
            write(1, "2", 21),
            commit(1),
            write(2, "2", 22),
            commit(2),
        ],
    ),
    Scenario(
        id="G1a",
        title="Aborted reads",
        anomaly="G1a",
        source="hermitage/postgres.md",
        operations=[
            begin(1), begin(2),
            write(1, "1", 101),
            read(2, "1"),
            abort(1),
            read(2, "1"),
            commit(2),
        ],
    ),
    Scenario(
        id="G1b",
        title="Intermediate reads",
        anomaly="G1b",
        source="hermitage/postgres.md",
        operations=[
            begin(1), begin(2),
            write(1, "1", 101),
            read(2, "1"),
            write(1, "1", 11),
            commit(1),
            read(2, "1"),
            commit(2),
        ],
    ),
    Scenario(
        id="G1c",
        title="Circular information flow",
        anomaly="G1c",
        source="hermitage/postgres.md",
        operations=[
            begin(1), begin(2),
            write(1, "1", 11),
            write(2, "2", 22),
            read(1, "2"),
            read(2, "1"),
            commit(1), commit(2),
        ],
    ),
    Scenario(
        id="OTV",
        title="Observed transaction vanishes",
        anomaly="OTV",
        source="hermitage/postgres.md",
        operations=[
            begin(1), begin(2), begin(3),
            write(1, "1", 11),
            write(1, "2", 19),
            write(2, "1", 12),
            commit(1),
            read(3, "1"),
            write(2, "2", 18),
            read(3, "2"),
            commit(2),
            read(3, "2"),
            read(3, "1"),
            commit(3),
        ],
    ),
    Scenario(
        id="OTV-mysql",
        title="Observed transaction vanishes, read uncommitted",
        anomaly="OTV",
        source="hermitage/mysql.md",
        note="T3 reads T2's uncommitted 12 beside T1's 19, so it sees half of each",
        operations=[
            begin(1), begin(2), begin(3),
            write(1, "1", 11),
            write(1, "2", 19),
            write(2, "1", 12),
            commit(1),
            pread(3, "1 = 1"),
            write(2, "2", 18),
            pread(3, "1 = 1"),
            commit(2), commit(3),
        ],
    ),
    Scenario(
        id="PMP",
        title="Predicate many preceders",
        anomaly="PMP",
        source="hermitage/postgres.md",
        operations=[
            begin(1), begin(2),
            pread(1, "value = 30"),
            insert(2, "3", 30),
            commit(2),
            pread(1, "value % 3 = 0"),
            commit(1),
        ],
    ),
    Scenario(
        id="PMP-write",
        title="Predicate many preceders, write predicate",
        anomaly="PMP",
        source="hermitage/postgres.md",
        note="postgres documentation example. read committed sees the deleted row",
        operations=[
            begin(1), begin(2),
            write(1, "1", 20),
            write(1, "2", 30),
            pdelete(2, "value = 20"),
            commit(1),
            pread(2, "value = 20"),
            commit(2),
        ],
    ),
    Scenario(
        id="P4",
        title="Lost update",
        anomaly="P4",
        source="hermitage/postgres.md",
        operations=[
            begin(1), begin(2),
            read(1, "1"),
            read(2, "1"),
            write(1, "1", 11),
            write(2, "1", 11),
            commit(1),
            commit(2),
        ],
    ),
    Scenario(
        id="G-single",
        title="Read skew",
        anomaly="G-single",
        source="hermitage/postgres.md",
        operations=[
            begin(1), begin(2),
            read(1, "1"),
            read(2, "1"),
            read(2, "2"),
            write(2, "1", 12),
            write(2, "2", 18),
            commit(2),
            read(1, "2"),
            commit(1),
        ],
    ),
    Scenario(
        id="G-single-predicate",
        title="Read skew, predicate dependencies",
        anomaly="G-single",
        source="hermitage/postgres.md",
        operations=[
            begin(1), begin(2),
            pread(1, "value % 5 = 0"),
            write(2, "1", 12),
            commit(2),
            pread(1, "value % 3 = 0"),
            commit(1),
        ],
    ),
    Scenario(
        id="G-single-write",
        title="Read skew, write predicate",
        anomaly="G-single",
        source="hermitage/postgres.md",
        operations=[
            begin(1), begin(2),
            read(1, "1"),
            pread(2, "1 = 1"),
            write(2, "1", 12),
            write(2, "2", 18),
            commit(2),
            pdelete(1, "value = 20"),
            abort(1),
        ],
    ),
    Scenario(
        id="G2-item",
        title="Write skew",
        anomaly="G2-item",
        source="hermitage/postgres.md",
        operations=[
            begin(1), begin(2),
            read(1, "1"), read(1, "2"),
            read(2, "1"), read(2, "2"),
            write(1, "1", 11),
            write(2, "2", 21),
            commit(1), commit(2),
        ],
    ),
    Scenario(
        id="G2",
        title="Anti dependency cycles",
        anomaly="G2",
        source="hermitage/postgres.md",
        operations=[
            begin(1), begin(2),
            pread(1, "value % 3 = 0"),
            pread(2, "value % 3 = 0"),
            insert(1, "3", 30),
            insert(2, "4", 42),
            commit(1), commit(2),
        ],
    ),
    Scenario(
        id="G2-fekete",
        title="Fekete's example, two anti dependency edges",
        anomaly="G2",
        source="hermitage/postgres.md",
        note="needs real SSI. the pivot is T1, between two rw edges",
        operations=[
            begin(1),
            read(1, "1"), read(1, "2"),
            begin(2),
            write(2, "2", 25),
            commit(2),
            begin(3),
            read(3, "1"), read(3, "2"),
            commit(3),
            write(1, "1", 0),
            abort(1),
        ],
    ),
]

BY_ID: dict[str, Scenario] = {s.id: s for s in SCENARIOS}
