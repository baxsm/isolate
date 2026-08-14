from __future__ import annotations

from typing import Literal

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, ConfigDict, Field

from isolate.executor import Executor
from isolate.matrix import PUBLISHED, compute_matrix
from isolate.parser import ParseError, parse_sql
from isolate.scenarios import INITIAL, SCENARIOS
from isolate.types import (
    Edge,
    EngineProfile,
    IsolationLevel,
    Operation,
    OpKind,
    Step,
    Transaction,
    Version,
)

app = FastAPI(title="isolate", docs_url="/api/docs", openapi_url="/api/openapi.json")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_methods=["GET", "POST"],
    allow_headers=["content-type"],
)


class Strict(BaseModel):
    """Unknown fields are an error. A typo must not run as a silently dropped no-op."""

    model_config = ConfigDict(extra="forbid")


class OperationIn(Strict):
    txn: int = Field(ge=1, le=9)
    kind: OpKind
    key: str | None = None
    value: int | None = None
    predicate: str | None = None


class InitialRow(Strict):
    key: str
    value: int


class RunRequest(Strict):
    engine: EngineProfile = EngineProfile.POSTGRES
    isolation: dict[int, IsolationLevel]
    initial: list[InitialRow] | None = None
    operations: list[OperationIn] = Field(min_length=1, max_length=60)


class VersionOut(Strict):
    key: str
    value: int | None
    xmin: int
    xmax: int | None
    created_at_step: int
    expired_at_step: int | None


class TransactionOut(Strict):
    xid: int
    state: str
    isolation: str
    began_at_step: int
    ended_at_step: int | None
    in_conflict: bool
    out_conflict: bool
    snapshot_xmin: int | None
    snapshot_xmax: int | None
    snapshot_xip: list[int]


class EdgeOut(Strict):
    frm: int
    to: int
    kind: str
    key: str
    item_level: bool
    at_step: int


class OperationOut(Strict):
    txn: int
    kind: str
    key: str | None
    value: int | None
    predicate: str | None


class StepOut(Strict):
    index: int
    op: OperationOut
    outcome: Literal["ok", "blocked", "aborted", "error"]
    error: str | None
    versions: dict[str, list[VersionOut]]
    visible: dict[int, dict[str, int | None]]
    txns: dict[int, TransactionOut]
    edges: list[EdgeOut]
    cycles: list[list[EdgeOut]]
    anomalies: list[str]


class Summary(Strict):
    anomalies: list[str]
    committed: list[int]
    aborted: list[int]
    final: dict[str, int | None]
    notes: list[str]


class RunResponse(Strict):
    steps: list[StepOut]
    summary: Summary


def _version_out(version: Version) -> VersionOut:
    return VersionOut(
        key=version.key,
        value=version.value,
        xmin=version.xmin,
        xmax=version.xmax,
        created_at_step=version.created_at_step,
        expired_at_step=version.expired_at_step,
    )


def _txn_out(txn: Transaction) -> TransactionOut:
    snap = txn.snapshot
    return TransactionOut(
        xid=txn.xid,
        state=txn.state.value,
        isolation=txn.isolation.value,
        began_at_step=txn.began_at_step,
        ended_at_step=txn.ended_at_step,
        in_conflict=txn.in_conflict,
        out_conflict=txn.out_conflict,
        snapshot_xmin=snap.xmin if snap else None,
        snapshot_xmax=snap.xmax if snap else None,
        snapshot_xip=sorted(snap.xip) if snap else [],
    )


def _edge_out(edge: Edge) -> EdgeOut:
    return EdgeOut(
        frm=edge.frm,
        to=edge.to,
        kind=edge.kind.value,
        key=edge.key,
        item_level=edge.item_level,
        at_step=edge.at_step,
    )


def _step_out(step: Step) -> StepOut:
    return StepOut(
        index=step.index,
        op=OperationOut(
            txn=step.op.txn,
            kind=step.op.kind.value,
            key=step.op.key,
            value=step.op.value,
            predicate=step.op.predicate,
        ),
        outcome=step.outcome,
        error=step.error,
        versions={k: [_version_out(v) for v in vs] for k, vs in step.versions.items()},
        visible=step.visible,
        txns={x: _txn_out(t) for x, t in step.txns.items()},
        edges=[_edge_out(e) for e in step.edges],
        cycles=[[_edge_out(e) for e in c] for c in step.cycles],
        anomalies=step.anomalies,
    )


@app.post("/api/run", response_model=RunResponse)
def run(request: RunRequest) -> RunResponse:
    operations = [
        Operation(txn=o.txn, kind=o.kind, key=o.key, value=o.value, predicate=o.predicate)
        for o in request.operations
    ]
    missing = {o.txn for o in operations} - set(request.isolation)
    if missing:
        raise HTTPException(
            status_code=422,
            detail=f"no isolation level given for transaction {sorted(missing)[0]}",
        )
    initial = (
        {row.key: row.value for row in request.initial}
        if request.initial is not None
        else dict(INITIAL)
    )
    executor = Executor(isolation=request.isolation, profile=request.engine, initial=initial)
    try:
        result = executor.run(operations)
    except ValueError as err:
        raise HTTPException(status_code=422, detail=str(err)) from err
    return RunResponse(
        steps=[_step_out(s) for s in result.steps],
        summary=Summary(
            anomalies=result.anomalies,
            committed=result.committed,
            aborted=result.aborted,
            final=result.final,
            notes=result.notes,
        ),
    )


class ParseRequest(Strict):
    txn: int = Field(ge=1, le=9)
    sql: str = Field(min_length=1, max_length=2000)


class ParseResponse(Strict):
    operations: list[OperationOut]


@app.post("/api/parse", response_model=ParseResponse)
def parse(request: ParseRequest) -> ParseResponse:
    try:
        operations = parse_sql(request.txn, request.sql)
    except ParseError as err:
        raise HTTPException(status_code=422, detail=str(err)) from err
    return ParseResponse(
        operations=[
            OperationOut(
                txn=o.txn,
                kind=o.kind.value,
                key=o.key,
                value=o.value,
                predicate=o.predicate,
            )
            for o in operations
        ]
    )


class ScenarioOut(Strict):
    id: str
    title: str
    anomaly: str
    operations: list[OperationOut]
    source: str
    note: str
    initial: dict[str, int]


@app.get("/api/scenarios", response_model=list[ScenarioOut])
def scenarios() -> list[ScenarioOut]:
    return [
        ScenarioOut(
            id=s.id,
            title=s.title,
            anomaly=s.anomaly,
            operations=[
                OperationOut(
                    txn=o.txn,
                    kind=o.kind.value,
                    key=o.key,
                    value=o.value,
                    predicate=o.predicate,
                )
                for o in s.operations
            ],
            source=s.source,
            note=s.note,
            initial=s.initial or dict(INITIAL),
        )
        for s in SCENARIOS
    ]


class MatrixCell(Strict):
    anomaly: str
    computed: bool
    published: bool | None
    agrees: bool
    scenario_id: str


class MatrixRow(Strict):
    engine: str
    level: str
    label: str
    actual: str
    cells: list[MatrixCell]


@app.get("/api/matrix", response_model=list[MatrixRow])
def matrix() -> list[MatrixRow]:
    rows = []
    for row in compute_matrix():
        rows.append(
            MatrixRow(
                engine=row.engine,
                level=row.level,
                label=row.label,
                actual=row.actual,
                cells=[
                    MatrixCell(
                        anomaly=c.anomaly,
                        computed=c.computed,
                        published=c.published,
                        agrees=c.agrees,
                        scenario_id=c.scenario_id,
                    )
                    for c in row.cells
                ],
            )
        )
    return rows


@app.get("/api/health")
def health() -> dict[str, str | int]:
    return {"status": "ok", "scenarios": len(SCENARIOS), "published_rows": len(PUBLISHED)}
