"use client";

import type { FC } from "react";
import { useMemo, useRef, useState } from "react";
import FigureCard from "@/components/figure-card";
import GraphPanel from "@/components/graph-panel";
import StepTransport from "@/components/step-transport";
import TimelinePanel from "@/components/timeline-panel";
import TxnBadge from "@/components/txn-badge";
import VersionPanel from "@/components/version-panel";
import type { EngineProfile, IsolationLevel, Operation, RunRequest } from "@/lib/types";
import { useRun } from "@/lib/use-run";
import { describeOp } from "@/lib/utils";

interface WorkbenchProps {
  operations: Operation[];
  isolation: Record<number, IsolationLevel>;
  engine: EngineProfile;
  initial?: Record<string, number>;
  onIsolationChange?: (txn: number, level: IsolationLevel) => void;
  onEngineChange?: (engine: EngineProfile) => void;
}

const LEVELS: { value: IsolationLevel; label: string }[] = [
  { value: "read_uncommitted", label: "read uncommitted" },
  { value: "read_committed", label: "read committed" },
  { value: "repeatable_read", label: "repeatable read" },
  { value: "serializable", label: "serializable" },
];

const ENGINES: { value: EngineProfile; label: string }[] = [
  { value: "postgres", label: "PostgreSQL" },
  { value: "mysql", label: "MySQL" },
  { value: "generic", label: "Generic" },
];

const select =
  "cursor-pointer rounded border border-[var(--color-line)] bg-[var(--color-card)] px-2 py-1 " +
  "text-xs text-[var(--color-ink)] transition-colors hover:bg-[var(--color-inset)]";

/**
 * The three panels and the transport, all driven by one step index.
 *
 * Every panel receives the same `Step`. None of them fetches, and none keeps its own
 * index, so they cannot drift apart.
 */
const Workbench: FC<WorkbenchProps> = ({
  operations,
  isolation,
  engine,
  initial,
  onIsolationChange,
  onEngineChange,
}) => {
  const [viewer, setViewer] = useState<number | null>(null);
  const rigRef = useRef<HTMLDivElement | null>(null);

  const request = useMemo<RunRequest | null>(() => {
    if (operations.length === 0) return null;
    return {
      engine,
      isolation,
      operations,
      ...(initial
        ? { initial: Object.entries(initial).map(([key, value]) => ({ key, value })) }
        : {}),
    };
  }, [operations, isolation, engine, initial]);

  const { steps, step, summary, index, setIndex, loading, error, retry } = useRun(request);
  const txns = useMemo(
    () =>
      Object.keys(isolation)
        .map(Number)
        .sort((a, b) => a - b),
    [isolation],
  );
  const activeViewer = viewer ?? (step ? Number(Object.keys(step.txns)[0] ?? 0) || null : null);

  if (error) {
    return (
      <FigureCard title="Schedule">
        <div className="flex flex-col items-start gap-3">
          <p className="text-[var(--color-danger)] text-sm">{error}</p>
          <button
            type="button"
            onClick={retry}
            className="cursor-pointer rounded border border-[var(--color-line)] px-3 py-1.5 text-sm transition-colors hover:bg-[var(--color-inset)] active:bg-[var(--color-line)]"
          >
            Try again
          </button>
        </div>
      </FigureCard>
    );
  }

  return (
    <div ref={rigRef} tabIndex={-1} className="flex flex-col gap-6 outline-none">
      <FigureCard
        title="Schedule"
        aside={
          <div className="flex flex-wrap items-center gap-3">
            {onEngineChange && (
              <label className="flex items-center gap-1.5 text-[var(--color-ink-soft)] text-xs">
                engine
                <select
                  className={select}
                  value={engine}
                  onChange={(event) => onEngineChange(event.target.value as EngineProfile)}
                >
                  {ENGINES.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {onIsolationChange &&
              txns.map((txn) => (
                <label
                  key={txn}
                  className="flex items-center gap-1.5 text-[var(--color-ink-soft)] text-xs"
                >
                  <TxnBadge txn={txn} />
                  <select
                    className={select}
                    aria-label={`Isolation level for transaction ${txn}`}
                    value={isolation[txn]}
                    onChange={(event) =>
                      onIsolationChange(txn, event.target.value as IsolationLevel)
                    }
                  >
                    {LEVELS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
          </div>
        }
      >
        <div className="flex flex-col gap-3">
          <TimelinePanel steps={steps} index={index} onScrub={setIndex} />
          <StepTransport
            index={index}
            count={steps.length}
            onChange={setIndex}
            keyboardTarget={rigRef.current}
          />
          {step && (
            <p className="text-[var(--color-ink-soft)] text-sm" aria-live="polite">
              <TxnBadge txn={step.op.txn} variant="text" />{" "}
              {describeOp(step.op.kind, step.op.key, step.op.value, step.op.predicate)}
              {step.outcome !== "ok" && (
                <>
                  {" — "}
                  <span
                    className={
                      step.outcome === "blocked"
                        ? "text-[var(--color-ink)]"
                        : "text-[var(--color-danger)]"
                    }
                  >
                    {step.outcome}
                    {step.error ? `: ${step.error}` : ""}
                  </span>
                </>
              )}
            </p>
          )}
          {loading && steps.length === 0 && (
            <p className="text-[var(--color-ink-soft)] text-sm">Running the schedule…</p>
          )}
        </div>
      </FigureCard>

      {/* items-start, or the grid stretches both cards to the taller one and the shorter
          content sits above a band of empty card */}
      <div className="grid items-start gap-6 lg:grid-cols-2">
        <FigureCard
          title="Version chains"
          aside={
            step && Object.keys(step.txns).length > 0 ? (
              <label className="flex items-center gap-1.5 text-[var(--color-ink-soft)] text-xs">
                as seen by
                <select
                  className={select}
                  aria-label="Read the chain as this transaction"
                  value={activeViewer ?? ""}
                  onChange={(event) => setViewer(Number(event.target.value))}
                >
                  {Object.keys(step.txns)
                    .map(Number)
                    .sort((a, b) => a - b)
                    .map((txn) => (
                      <option key={txn} value={txn}>
                        T{txn}
                      </option>
                    ))}
                </select>
              </label>
            ) : null
          }
        >
          <VersionPanel step={step} viewer={activeViewer} />
          {step && activeViewer != null && step.txns[activeViewer] && (
            <p className="tabular mt-3 font-mono text-[var(--color-ink-soft)] text-xs">
              snapshot xmin {step.txns[activeViewer].snapshot_xmin ?? "–"} · xmax{" "}
              {step.txns[activeViewer].snapshot_xmax ?? "–"} · xip [
              {step.txns[activeViewer].snapshot_xip.join(", ")}]
            </p>
          )}
        </FigureCard>

        <FigureCard
          title="Dependency graph"
          aside={
            step && step.anomalies.length > 0 ? (
              <span className="rounded bg-[var(--color-inset)] px-2 py-0.5 font-mono text-[var(--color-ink)] text-xs">
                {step.anomalies.join(", ")}
              </span>
            ) : null
          }
        >
          <GraphPanel step={step} onSelectTxn={setViewer} selected={activeViewer} />
          {step && step.edges.length === 0 && (
            <p className="mt-2 text-[var(--color-ink-soft)] text-xs">
              No dependencies between transactions yet.
            </p>
          )}
        </FigureCard>
      </div>

      {summary && (
        <FigureCard
          title="Outcome"
          // this panel is the whole run, not the current step. unlabelled, a reader at
          // step 1 reads "Aborted T2" as something that happened at step 1
          aside={
            <span className="text-[var(--color-ink-soft)] text-xs">
              after all {steps.length} steps
            </span>
          }
        >
          <dl className="grid gap-x-8 gap-y-2 text-sm sm:grid-cols-2">
            <div className="flex gap-2">
              <dt className="text-[var(--color-ink-soft)]">Committed</dt>
              <dd className="flex gap-1">
                {summary.committed.length === 0 ? (
                  <span className="text-[var(--color-ink-faint)]">none</span>
                ) : (
                  summary.committed.map((txn) => <TxnBadge key={txn} txn={txn} />)
                )}
              </dd>
            </div>
            <div className="flex gap-2">
              <dt className="text-[var(--color-ink-soft)]">Aborted</dt>
              <dd className="flex gap-1">
                {summary.aborted.length === 0 ? (
                  <span className="text-[var(--color-ink-faint)]">none</span>
                ) : (
                  summary.aborted.map((txn) => <TxnBadge key={txn} txn={txn} />)
                )}
              </dd>
            </div>
            <div className="flex gap-2">
              <dt className="text-[var(--color-ink-soft)]">Anomalies</dt>
              <dd className="tabular font-mono">
                {summary.anomalies.length === 0 ? (
                  <span className="text-[var(--color-ink-faint)]">none</span>
                ) : (
                  summary.anomalies.join(", ")
                )}
              </dd>
            </div>
            <div className="flex gap-2">
              <dt className="text-[var(--color-ink-soft)]">Final</dt>
              <dd className="tabular font-mono">
                {Object.entries(summary.final)
                  .map(([key, value]) => `${key} => ${value}`)
                  .join(", ") || "empty"}
              </dd>
            </div>
          </dl>
          {summary.notes.length > 0 && (
            <ul className="mt-3 flex flex-col gap-1">
              {summary.notes.map((note) => (
                <li key={note} className="text-[var(--color-ink-soft)] text-xs">
                  {note}
                </li>
              ))}
            </ul>
          )}
        </FigureCard>
      )}
    </div>
  );
};

export default Workbench;
