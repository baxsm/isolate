"use client";

import type { FC } from "react";
import { useMemo, useRef, useState } from "react";
import FigureCard from "@/components/figure-card";
import GraphPanel from "@/components/graph-panel";
import Pane from "@/components/pane";
import TimelinePanel from "@/components/timeline-panel";
import TxnBadge from "@/components/txn-badge";
import TxnSelect from "@/components/txn-select";
import { Button } from "@/components/ui/button";
import VersionPanel from "@/components/version-panel";
import WorkbenchToolbar from "@/components/workbench-toolbar";
import type {
  EngineProfile,
  IsolationLevel,
  Operation,
  RunRequest,
  RunResponse,
} from "@/lib/types";
import { useRun } from "@/lib/use-run";
import { cn, describeOp } from "@/lib/utils";

interface WorkbenchProps {
  operations: Operation[];
  isolation: Record<number, IsolationLevel>;
  engine: EngineProfile;
  initial?: Record<string, number>;
  onIsolationChange?: (txn: number, level: IsolationLevel) => void;
  onEngineChange?: (engine: EngineProfile) => void;
  /**
   * Which panels this figure needs. The article measured six graph cards, every one of them
   * holding a single node and the words "No dependencies between transactions yet", because
   * every figure rendered the full workbench regardless of what its paragraph was about. A
   * figure about visibility shows chains; the graph earns its place from the section that
   * introduces edges onward.
   */
  panels?: { versions?: boolean; graph?: boolean };
  /**
   * The same schedule already run on the server, so the first paint shows real steps
   * instead of "No operations yet". Only correct when it is the run of `operations` at
   * `isolation` and `engine` as they arrive; a stale seed would paint the wrong schedule.
   */
  seed?: RunResponse | null;
}

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
  panels,
  seed,
}) => {
  const showVersions = panels?.versions ?? true;
  const showGraph = panels?.graph ?? true;
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

  const { steps, step, summary, index, setIndex, loading, error, retry } = useRun(request, seed);
  const txns = useMemo(
    () =>
      Object.keys(isolation)
        .map(Number)
        .sort((a, b) => a - b),
    [isolation],
  );
  /*
    The chain has to be read through somebody's eyes, so the viewer falls back to the first
    transaction. Selection is not the same thing: it is something the reader did. Passing the
    fallback through as `selected` put a ring on a node nobody had picked, which on a single
    node graph is a permanent pale halo that reads as a stuck focus ring.
  */
  const activeViewer = viewer ?? (step ? Number(Object.keys(step.txns)[0] ?? 0) || null : null);
  const selected = viewer;

  if (error) {
    return (
      <FigureCard bare className="p-4">
        <Pane title="Schedule">
          <div className="flex flex-col items-start gap-3">
            <p className="text-[var(--color-danger)] text-sm">{error}</p>
            <Button variant="outline" size="sm" onClick={retry}>
              Try again
            </Button>
          </div>
        </Pane>
      </FigureCard>
    );
  }

  return (
    /*
      One bordered surface, divided by rules rather than by nested cards. The schedule sits
      at the top with the toolbar because it is what the reader builds; everything below is
      what the engine says back about it.
    */
    <FigureCard bare ref={rigRef} tabIndex={-1}>
      <div className="border-[var(--color-line)] border-b p-4">
        <WorkbenchToolbar
          engine={engine}
          isolation={isolation}
          txns={txns}
          index={index}
          count={steps.length}
          onIndexChange={setIndex}
          onIsolationChange={onIsolationChange}
          onEngineChange={onEngineChange}
          keyboardTarget={rigRef.current}
        />
      </div>

      <div className="p-4">
        <Pane title="Schedule">
          <TimelinePanel steps={steps} index={index} onScrub={setIndex} />
          {/*
            The step description is one line whose content changes every step. Reserving its
            height stops every panel below it from shifting as the reader scrubs, which is
            the layout jumping around as the data changes.
          */}
          <p className="mt-3 min-h-5 text-[var(--color-ink-soft)] text-sm" aria-live="polite">
            {step && (
              <>
                <TxnBadge txn={step.op.txn} variant="text" />{" "}
                {describeOp(step.op.kind, step.op.key, step.op.value, step.op.predicate)}
                {step.outcome !== "ok" && (
                  <>
                    {". "}
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
              </>
            )}
            {loading && steps.length === 0 && "Running the schedule…"}
          </p>
        </Pane>
      </div>

      <div
        className={cn(
          "grid items-start border-[var(--color-line)] border-t",
          // a rule between the two, not a gap, so they read as one region split in two
          showVersions && showGraph && "lg:grid-cols-2 lg:divide-x lg:divide-[var(--color-line)]",
        )}
      >
        {showVersions && (
          <Pane
            className="p-4"
            title="Version chains"
            aside={
              step && Object.keys(step.txns).length > 0 && activeViewer != null ? (
                <TxnSelect
                  value={activeViewer}
                  onChange={setViewer}
                  options={Object.keys(step.txns)
                    .map(Number)
                    .sort((a, b) => a - b)}
                  label="Read the chain as this transaction"
                />
              ) : null
            }
            reserveAside
          >
            <VersionPanel
              step={step}
              viewer={activeViewer}
              selected={selected}
              onSelectTxn={setViewer}
            />
            {step && activeViewer != null && step.txns[activeViewer] && (
              <p className="tabular mt-3 font-mono text-[var(--color-ink-soft)] text-xs">
                snapshot xmin {step.txns[activeViewer].snapshot_xmin ?? "–"} · xmax{" "}
                {step.txns[activeViewer].snapshot_xmax ?? "–"} · xip [
                {step.txns[activeViewer].snapshot_xip.join(", ")}]
              </p>
            )}
          </Pane>
        )}

        {showGraph && (
          <Pane
            className="p-4"
            title="Dependency graph"
            aside={
              step && step.anomalies.length > 0 ? (
                <span className="font-mono text-[var(--color-danger)] text-xs">
                  {step.anomalies.join(", ")}
                </span>
              ) : null
            }
            reserveAside
          >
            <GraphPanel step={step} onSelectTxn={setViewer} selected={selected} />
            {/* reserved, so the graph does not move up and down as edges appear */}
            <p className="mt-2 min-h-4 text-[var(--color-ink-soft)] text-xs">
              {step && step.edges.length === 0 && "No dependencies between transactions yet."}
            </p>
          </Pane>
        )}
      </div>

      {summary && (
        <Pane
          className="border-[var(--color-line)] border-t p-4"
          title="Outcome"
          // this panel is the whole run, not the current step. unlabelled, a reader at
          // step 1 reads "Aborted T2" as something that happened at step 1
          aside={
            <span className="text-[var(--color-ink-soft)] text-xs">
              after all {steps.length} steps
            </span>
          }
        >
          <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2 [&_dd]:min-w-0">
            <div className="flex min-w-0 flex-wrap gap-2">
              <dt className="text-[var(--color-ink-soft)]">Committed</dt>
              <dd className="flex gap-2">
                {summary.committed.length === 0 ? (
                  <span className="text-[var(--color-ink-faint)]">none</span>
                ) : (
                  summary.committed.map((txn) => <TxnBadge key={txn} txn={txn} />)
                )}
              </dd>
            </div>
            <div className="flex min-w-0 flex-wrap gap-2">
              <dt className="text-[var(--color-ink-soft)]">Aborted</dt>
              <dd className="flex gap-2">
                {summary.aborted.length === 0 ? (
                  <span className="text-[var(--color-ink-faint)]">none</span>
                ) : (
                  summary.aborted.map((txn) => <TxnBadge key={txn} txn={txn} />)
                )}
              </dd>
            </div>
            <div className="flex min-w-0 flex-wrap gap-2">
              <dt className="text-[var(--color-ink-soft)]">Anomalies</dt>
              <dd className="tabular font-mono">
                {summary.anomalies.length === 0 ? (
                  <span className="text-[var(--color-ink-faint)]">none</span>
                ) : (
                  summary.anomalies.join(", ")
                )}
              </dd>
            </div>
            <div className="flex min-w-0 flex-wrap gap-2">
              <dt className="text-[var(--color-ink-soft)]">Final</dt>
              <dd className="tabular min-w-0 break-all font-mono">
                {Object.entries(summary.final)
                  .map(([key, value]) => `${key} => ${value}`)
                  .join(", ") || "empty"}
              </dd>
            </div>
          </dl>
          {summary.notes.length > 0 && (
            <ul className="mt-3 flex flex-col gap-2">
              {summary.notes.map((note) => (
                <li key={note} className="text-[var(--color-ink-soft)] text-xs">
                  {note}
                </li>
              ))}
            </ul>
          )}
        </Pane>
      )}
    </FigureCard>
  );
};

export default Workbench;
