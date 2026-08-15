"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import FigureCard from "@/components/figure-card";
import ScheduleEditor from "@/components/schedule-editor";
import SqlInput from "@/components/sql-input";
import Workbench from "@/components/workbench";
import { decodeSchedule, encodeSchedule } from "@/lib/schedule-url";
import type { EngineProfile, IsolationLevel, Operation } from "@/lib/types";
import { useScenarios } from "@/lib/use-scenarios";

const FALLBACK: Operation[] = [
  { txn: 1, kind: "begin", key: null, value: null, predicate: null },
  { txn: 2, kind: "begin", key: null, value: null, predicate: null },
  { txn: 1, kind: "read", key: "1", value: null, predicate: null },
  { txn: 1, kind: "read", key: "2", value: null, predicate: null },
  { txn: 2, kind: "read", key: "1", value: null, predicate: null },
  { txn: 2, kind: "read", key: "2", value: null, predicate: null },
  { txn: 1, kind: "write", key: "1", value: 11, predicate: null },
  { txn: 2, kind: "write", key: "2", value: 21, predicate: null },
  { txn: 1, kind: "commit", key: null, value: null, predicate: null },
  { txn: 2, kind: "commit", key: null, value: null, predicate: null },
];

const INITIAL = { "1": 10, "2": 20 };

const LEVELS: IsolationLevel[] = [
  "read_uncommitted",
  "read_committed",
  "repeatable_read",
  "serializable",
];

const PROFILES: EngineProfile[] = ["postgres", "mysql", "generic"];

export default function ComposePage() {
  const { scenarios } = useScenarios();

  // read on the client rather than through useSearchParams. that hook suspends the whole
  // route, and a page that is only ever reached in a browser does not need the server to
  // know the query string
  const [search, setSearch] = useState<URLSearchParams | null>(null);
  useEffect(() => {
    setSearch(new URLSearchParams(window.location.search));
  }, []);

  const wanted = search?.get("scenario") ?? null;
  const [operations, setOperations] = useState<Operation[]>(FALLBACK);
  const [isolation, setIsolation] = useState<Record<number, IsolationLevel>>({
    1: "repeatable_read",
    2: "repeatable_read",
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

  return (
    <div className="mx-auto max-w-[1200px] px-6 py-8">
      <div className="mb-6 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
        <div>
          <h1 className="font-medium text-xl tracking-tight">{title}</h1>
          {loadedFrom && (
            <p className="mt-1 font-mono text-[var(--color-ink-faint)] text-xs">{loadedFrom}</p>
          )}
        </div>
        <button
          type="button"
          onClick={share}
          className="cursor-pointer rounded border border-[var(--color-line)] px-3 py-1.5 text-[var(--color-ink)] text-xs transition-colors hover:bg-[var(--color-inset)] active:bg-[var(--color-line)]"
        >
          {copied ? "Link copied" : "Share this schedule"}
        </button>
      </div>

      {notFound && (
        <p className="mb-4 text-[var(--color-danger)] text-sm">
          No scenario called {wanted}. Showing the default schedule.
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
        <div className="flex flex-col gap-6">
          <FigureCard
            title="Operations"
            // the timeline can hold more steps than this list: a write that blocks is
            // retried when the lock clears, and that retry is a step nobody typed. saying
            // so beats a reader counting eight rows against nine marks
            aside={<span className="text-[var(--color-ink-soft)] text-xs">what you asked for</span>}
          >
            <ScheduleEditor operations={operations} onChange={edit} />
            {missing && <p className="mt-3 text-[var(--color-ink-soft)] text-xs">{missing}</p>}
          </FigureCard>
          <SqlInput onParsed={edit} />
        </div>

        <Workbench
          operations={operations}
          isolation={isolation}
          engine={engine}
          initial={INITIAL}
          onIsolationChange={setLevel}
          onEngineChange={setEngine}
        />
      </div>
    </div>
  );
}

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
