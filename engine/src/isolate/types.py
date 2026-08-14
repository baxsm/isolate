from __future__ import annotations

from dataclasses import dataclass, field
from enum import StrEnum
from typing import Literal


class IsolationLevel(StrEnum):
    READ_UNCOMMITTED = "read_uncommitted"
    READ_COMMITTED = "read_committed"
    REPEATABLE_READ = "repeatable_read"
    SERIALIZABLE = "serializable"


class EngineProfile(StrEnum):
    POSTGRES = "postgres"
    MYSQL = "mysql"
    GENERIC = "generic"


class TxnState(StrEnum):
    ACTIVE = "active"
    COMMITTED = "committed"
    ABORTED = "aborted"
    BLOCKED = "blocked"


class OpKind(StrEnum):
    BEGIN = "begin"
    READ = "read"
    WRITE = "write"
    INSERT = "insert"
    DELETE = "delete"
    PREDICATE_READ = "predicate_read"
    PREDICATE_WRITE = "predicate_write"
    PREDICATE_DELETE = "predicate_delete"
    COMMIT = "commit"
    ABORT = "abort"


class EdgeKind(StrEnum):
    WW = "ww"
    WR = "wr"
    RW = "rw"


Outcome = Literal["ok", "blocked", "aborted", "error"]


@dataclass(frozen=True)
class Version:
    key: str
    value: int | None
    xmin: int
    xmax: int | None
    created_at_step: int
    expired_at_step: int | None


@dataclass(frozen=True)
class Snapshot:
    xmin: int
    xmax: int
    xip: frozenset[int]


@dataclass(frozen=True)
class Operation:
    txn: int
    kind: OpKind
    key: str | None = None
    value: int | None = None
    predicate: str | None = None


Schedule = list[Operation]


@dataclass
class Transaction:
    xid: int
    state: TxnState
    isolation: IsolationLevel
    snapshot: Snapshot | None
    began_at_step: int
    ended_at_step: int | None = None
    in_conflict: bool = False
    out_conflict: bool = False
    siread_locks: set[str] = field(default_factory=set)
    write_locks: set[str] = field(default_factory=set)
    # predicates this txn read, kept for predicate rw edges and for OTV's USG
    predicate_reads: list[str] = field(default_factory=list)


@dataclass(frozen=True)
class Edge:
    frm: int
    to: int
    kind: EdgeKind
    key: str
    item_level: bool
    at_step: int


@dataclass(frozen=True)
class Step:
    index: int
    op: Operation
    outcome: Outcome
    error: str | None
    versions: dict[str, list[Version]]
    visible: dict[int, dict[str, int | None]]
    txns: dict[int, Transaction]
    edges: list[Edge]
    cycles: list[list[Edge]]
    anomalies: list[str]
