"""The engine's own results beside Kleppmann's published table.

The published side is parsed from the downloaded Hermitage README, not retyped here, so if
that file changes upstream the tests fail loudly rather than drifting in silence.
"""
from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from isolate.executor import Executor
from isolate.scenarios import INITIAL, SCENARIOS, Scenario
from isolate.types import EngineProfile, IsolationLevel

FIXTURES = Path(__file__).resolve().parents[2] / "tests" / "fixtures" / "hermitage"

ANOMALIES = ["G0", "G1a", "G1b", "G1c", "OTV", "PMP", "P4", "G-single", "G2-item", "G2"]

# which scenario demonstrates each anomaly. the write-predicate variants are separate
# scenarios and are checked on their own, not folded into these cells
DEMONSTRATES = {
    "G0": "G0",
    "G1a": "G1a",
    "G1b": "G1b",
    "G1c": "G1c",
    "OTV": "OTV",
    "PMP": "PMP",
    "P4": "P4",
    "G-single": "G-single",
    "G2-item": "G2-item",
    "G2": "G2",
}

# hermitage does not use one schedule per anomaly across all engines. where the published
# file for an engine probes with a different interleaving, that schedule is used for that
# engine's row, otherwise the comparison is against a test the vendor was never given
PER_ENGINE = {
    (EngineProfile.MYSQL, "OTV"): "OTV-mysql",
}

PG = EngineProfile.POSTGRES
MY = EngineProfile.MYSQL
MAV = "monotonic atomic view"

ROWS: list[tuple[EngineProfile, IsolationLevel, str, str]] = [
    (PG, IsolationLevel.READ_COMMITTED, "read committed", MAV),
    (PG, IsolationLevel.REPEATABLE_READ, "repeatable read", "snapshot isolation"),
    (PG, IsolationLevel.SERIALIZABLE, "serializable", "serializable"),
    (MY, IsolationLevel.READ_UNCOMMITTED, "read uncommitted", "read uncommitted"),
    (MY, IsolationLevel.READ_COMMITTED, "read committed", MAV),
    (MY, IsolationLevel.REPEATABLE_READ, "repeatable read", MAV),
    (MY, IsolationLevel.SERIALIZABLE, "serializable", "serializable"),
]


@dataclass(frozen=True)
class Cell:
    anomaly: str
    computed: bool
    """True means this level prevented the anomaly."""
    published: bool | None
    """None where Kleppmann recorded R/O or 'some' rather than a plain yes or no."""
    agrees: bool
    scenario_id: str


@dataclass(frozen=True)
class Row:
    engine: str
    level: str
    label: str
    actual: str
    cells: list[Cell]


def _parse_published() -> dict[tuple[str, str], dict[str, bool | None]]:
    """Read the summary table out of the downloaded README."""
    text = (FIXTURES / "README.md").read_text(encoding="utf-8")
    out: dict[tuple[str, str], dict[str, bool | None]] = {}
    engine = ""
    for line in text.splitlines():
        if not line.startswith("|"):
            continue
        cols = [c.strip() for c in line.strip("|").split("|")]
        if len(cols) < 13 or cols[0].startswith(":") or cols[1] == "So-called isolation level":
            continue
        if cols[0]:
            engine = cols[0]
        level = cols[1].replace("★", "").replace('"', "").strip()
        if not level:
            continue
        marks = cols[3:13]
        if len(marks) != len(ANOMALIES):
            continue
        row: dict[str, bool | None] = {}
        for anomaly, mark in zip(ANOMALIES, marks, strict=True):
            if mark == "✓":
                row[anomaly] = True
            elif mark == "—":
                row[anomaly] = False
            else:
                # R/O and "some" are conditional, so there is no single truth value
                row[anomaly] = None
        out[(engine, level)] = row
    return out


PUBLISHED = _parse_published()

ENGINE_NAMES = {EngineProfile.POSTGRES: "PostgreSQL", EngineProfile.MYSQL: "MySQL/InnoDB"}


def prevents(scenario: Scenario, level: IsolationLevel, profile: EngineProfile) -> bool:
    """Whether this level stops the scenario's anomaly from happening.

    Prevention is not only an abort. Repeatable read stops read skew by handing back the
    old value and letting both transactions commit, so the test is whether the anomaly is
    detected in the resulting history, not whether anything failed.
    """
    txns = sorted({op.txn for op in scenario.operations})
    executor = Executor(
        isolation=dict.fromkeys(txns, level),
        profile=profile,
        initial=dict(scenario.initial or INITIAL),
    )
    result = executor.run(list(scenario.operations))
    return scenario.anomaly not in result.anomalies


def compute_matrix() -> list[Row]:
    by_id = {s.id: s for s in SCENARIOS}
    rows: list[Row] = []
    for profile, level, label, actual in ROWS:
        published = PUBLISHED.get((ENGINE_NAMES[profile], label), {})
        cells: list[Cell] = []
        for anomaly in ANOMALIES:
            chosen = PER_ENGINE.get((profile, anomaly), DEMONSTRATES[anomaly])
            scenario = by_id[chosen]
            computed = prevents(scenario, level, profile)
            expected = published.get(anomaly)
            cells.append(
                Cell(
                    anomaly=anomaly,
                    computed=computed,
                    published=expected,
                    agrees=expected is None or expected == computed,
                    scenario_id=scenario.id,
                )
            )
        rows.append(
            Row(
                engine=ENGINE_NAMES[profile],
                level=level.value,
                label=label,
                actual=actual,
                cells=cells,
            )
        )
    return rows


def disagreements() -> list[tuple[str, str, str, bool, bool | None]]:
    """Every cell where the engine and the published table differ."""
    out = []
    for row in compute_matrix():
        for cell in row.cells:
            if not cell.agrees:
                out.append((row.engine, row.label, cell.anomaly, cell.computed, cell.published))
    return out
