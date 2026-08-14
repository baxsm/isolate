from __future__ import annotations

from isolate.executor import Executor, RunResult
from isolate.scenarios import INITIAL, Scenario
from isolate.types import EngineProfile, IsolationLevel, Schedule


def run_schedule(
    operations: Schedule,
    level: IsolationLevel,
    profile: EngineProfile = EngineProfile.POSTGRES,
    initial: dict[str, int] | None = None,
) -> RunResult:
    txns = sorted({op.txn for op in operations})
    executor = Executor(
        isolation=dict.fromkeys(txns, level),
        profile=profile,
        initial=dict(initial if initial is not None else INITIAL),
    )
    return executor.run(list(operations))


def run_scenario(
    scenario: Scenario,
    level: IsolationLevel,
    profile: EngineProfile = EngineProfile.POSTGRES,
) -> RunResult:
    return run_schedule(
        scenario.operations, level, profile, scenario.initial or dict(INITIAL)
    )
