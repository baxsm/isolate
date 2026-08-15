"use client";

import { Check, Link2 } from "lucide-react";
import type { FC } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import FigureCard from "@/components/figure-card";
import Pane from "@/components/pane";
import ScheduleEditor from "@/components/schedule-editor";
import SqlInput from "@/components/sql-input";
import { Button } from "@/components/ui/button";
import Workbench from "@/components/workbench";
import { DEFAULT_INITIAL, DEFAULT_ISOLATION, DEFAULT_OPERATIONS } from "@/lib/default-schedule";
import { decodeSchedule, encodeSchedule } from "@/lib/schedule-url";
import type { EngineProfile, IsolationLevel, Operation, RunResponse } from "@/lib/types";
import { useScenarios } from "@/lib/use-scenarios";

const LEVELS: IsolationLevel[] = [
  "read_uncommitted",
  "read_committed",
  "repeatable_read",
  "serializable",
];

const PROFILES: EngineProfile[] = ["postgres", "mysql", "generic"];

const ComposeWorkbench: FC<{ seed: RunResponse | null }> = ({ seed }) => {
  const { scenarios } = useScenarios();

  // read on the client rather than through useSearchParams. that hook suspends the whole
  // route, and a page that is only ever reached in a browser does not need the server to
  // know the query string
  const [search, setSearch] = useState<URLSearchParams | null>(null);
  useEffect(() => {
    setSearch(new URLSearchParams(window.location.search));
  }, []);

  const wanted = search?.get("scenario") ?? null;
  const [operations, setOperations] = useState<Operation[]>(DEFAULT_OPERATIONS);
  const [isolation, setIsolation] = useState<Record<number, IsolationLevel>>({
    ...DEFAULT_ISOLATION,
  });
  const [engine, setEngine] = useState<EngineProfile>("postgres");
  const [title, setTitle] = useState("Write skew");
  const [loadedFrom, setLoadedFrom] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // a schedule in the url wins over a named scenario, so an edited link restores exactly
  // what was shared rather than snapping back to the library version
  useEffect(() => {
    if (!search) return;
    const shared = decodeSchedule(search);
    if (shared && shared.operations.length > 0) {
      setOperations(shared.operations);
      setIsolation(shared.isolation);
      setEngine(shared.engine);
      setTitle("Shared schedule");
      setLoadedFrom(null);
      return;
    }
    if (!wanted || !scenarios) return;
    const scenario = scenarios.find((s) => s.id === wanted);
    if (!scenario) return;
    const txns = [...new Set(scenario.operations.map((op) => op.txn))];
    // a matrix cell is an anomaly at one engine and one level, and it links here with all
    // three. without them every cell opened on the postgres default, which quietly answers
    // a different question than the one clicked
    const level = LEVELS.find((l) => l === search.get("level")) ?? "repeatable_read";
    const profile = PROFILES.find((p) => p === search.get("engine"));
    setOperations(scenario.operations);
    setIsolation(Object.fromEntries(txns.map((txn) => [txn, level])));
    if (profile) setEngine(profile);
    setTitle(`${scenario.id} · ${scenario.title}`);
    setLoadedFrom(scenario.source);
  }, [wanted, scenarios, search]);

  const setLevel = useCallback((txn: number, level: IsolationLevel) => {
    setIsolation((current) => ({ ...current, [txn]: level }));
  }, []);

  const edit = useCallback((next: Operation[]) => {
    setOperations(next);
    setTitle("Edited schedule");
    setLoadedFrom(null);
    setCopied(false);
    setIsolation((current) => {
      const merged: Record<number, IsolationLevel> = {};
      for (const op of next) merged[op.txn] = current[op.txn] ?? "repeatable_read";
      return merged;
    });
  }, []);

  const share = useCallback(() => {
    const url = `${window.location.origin}/compose?${encodeSchedule({ operations, isolation, engine })}`;
    window.history.replaceState(null, "", url);
    navigator.clipboard?.writeText(url).then(
      () => setCopied(true),
      // clipboard needs permission the reader may not have granted. the url is in the
      // address bar either way, so say what actually happened
      () => setCopied(false),
    );
  }, [operations, isolation, engine]);

  const notFound = wanted && scenarios && !scenarios.some((s) => s.id === wanted);
  const missing = useMemo(() => describeMissing(operations), [operations]);
  /*
    The seed is the server's run of the default schedule, so it is only the right answer
    while the page is still showing that schedule. A shared link, a named scenario or any
    edit replaces the operations, and painting the seed then would show a schedule the
    reader is not looking at.
  */
  const pristine = operations === DEFAULT_OPERATIONS;

  return (
    <div className="mx-auto max-w-[1200px] px-6 py-6">
      <div className="mb-6 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
        <div>
          <h1 className="font-medium text-xl tracking-tight">{title}</h1>
          {loadedFrom && (
            <p className="mt-2 font-mono text-[var(--color-ink-faint)] text-xs">{loadedFrom}</p>
          )}
        </div>
        <Button variant="outline" size="sm" onClick={share}>
          {copied ? <Check aria-hidden /> : <Link2 aria-hidden />}
          {copied ? "Link copied" : "Share this schedule"}
        </Button>
      </div>

      {notFound && (
        <p className="mb-4 text-[var(--color-danger)] text-sm">
          No scenario called {wanted}. Showing the default schedule.
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
        {/*
          One surface for everything the reader types, divided by a rule. These were two
          separate cards, each with its own bordered header, and the SQL one held a bordered
          textarea and a bordered button inside that. Input on the left, what the engine says
          back on the right.
        */}
        <FigureCard bare className="h-fit">
          <Pane
            className="p-4"
            title="Operations"
            // the timeline can hold more steps than this list: a write that blocks is
            // retried when the lock clears, and that retry is a step nobody typed. saying
            // so beats a reader counting eight rows against nine marks
            aside={
              <span className="text-[var(--color-ink-faint)] text-xs">what you asked for</span>
            }
          >
            <ScheduleEditor operations={operations} onChange={edit} />
            {/* reserved, so adding an operation that completes a transaction does not move
                the SQL pane below it */}
            <p className="mt-3 min-h-4 text-[var(--color-ink-soft)] text-xs">{missing}</p>
          </Pane>
          <div className="border-[var(--color-line)] border-t p-4">
            <SqlInput onParsed={edit} />
          </div>
        </FigureCard>

        <Workbench
          operations={operations}
          isolation={isolation}
          engine={engine}
          initial={DEFAULT_INITIAL}
          onIsolationChange={setLevel}
          onEngineChange={setEngine}
          // only valid while the page still shows what the server ran. any edit, shared
          // link or scenario replaces the schedule, and the hook refetches for it
          seed={pristine ? seed : null}
        />
      </div>
    </div>
  );
};

export default ComposeWorkbench;

/** Named so the reader is told why a schedule produces nothing, rather than seeing an error. */
function describeMissing(operations: Operation[]): string | null {
  const began = new Set<number>();
  const ended = new Set<number>();
  for (const op of operations) {
    if (op.kind === "begin") began.add(op.txn);
    if (op.kind === "commit" || op.kind === "abort") ended.add(op.txn);
  }
  const txns = [...new Set(operations.map((op) => op.txn))];
  const noBegin = txns.filter((txn) => !began.has(txn));
  const noEnd = txns.filter((txn) => began.has(txn) && !ended.has(txn));
  const parts: string[] = [];
  if (noBegin.length > 0) parts.push(`${noBegin.map((t) => `T${t}`).join(", ")} never begins`);
  if (noEnd.length > 0)
    parts.push(`${noEnd.map((t) => `T${t}`).join(", ")} never commits or aborts`);
  return parts.length > 0 ? `${parts.join(". ")}.` : null;
}
