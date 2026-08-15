"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import FigureCard from "@/components/figure-card";
import { ApiError, getScenarios } from "@/lib/api";
import type { Scenario } from "@/lib/types";

export default function ScenariosPage() {
  const [scenarios, setScenarios] = useState<Scenario[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  // biome-ignore lint/correctness/useExhaustiveDependencies: attempt is the retry trigger, it re-runs the effect without the request changing
  useEffect(() => {
    let live = true;
    getScenarios()
      .then((data) => live && setScenarios(data))
      .catch((err: unknown) => {
        if (!live) return;
        setError(err instanceof ApiError ? err.message : "Could not load the scenarios.");
      });
    return () => {
      live = false;
    };
  }, [attempt]);

  return (
    <div className="mx-auto max-w-[1200px] px-6 py-8">
      <h1 className="font-medium text-xl tracking-tight">Scenarios</h1>
      <p className="mt-2 max-w-[68ch] text-[var(--color-ink-soft)] text-sm">
        Every schedule from Kleppmann&apos;s Hermitage suite, plus Fekete&apos;s three transaction
        example. Each one names the file it was transcribed from.
      </p>

      {error && (
        <div className="mt-6 flex flex-col items-start gap-3">
          <p className="text-[var(--color-danger)] text-sm">{error}</p>
          <button
            type="button"
            onClick={() => {
              setError(null);
              setAttempt((n) => n + 1);
            }}
            className="cursor-pointer rounded border border-[var(--color-line)] px-3 py-1.5 text-sm transition-colors hover:bg-[var(--color-inset)] active:bg-[var(--color-line)]"
          >
            Try again
          </button>
        </div>
      )}

      {!error && scenarios === null && (
        <p className="mt-6 text-[var(--color-ink-soft)] text-sm">Loading scenarios…</p>
      )}

      {scenarios && scenarios.length > 0 && (
        <FigureCard className="mt-6">
          <ul className="flex flex-col">
            {scenarios.map((scenario, i) => (
              <li
                key={scenario.id}
                className={i === 0 ? "py-3" : "border-[var(--color-line)] border-t py-3"}
              >
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <Link
                    href={`/compose?scenario=${encodeURIComponent(scenario.id)}`}
                    className="font-mono text-[var(--color-t1-text)] text-sm underline underline-offset-4"
                  >
                    {scenario.id}
                  </Link>
                  <span className="text-[var(--color-ink)] text-sm">{scenario.title}</span>
                  <span className="tabular font-mono text-[var(--color-ink-soft)] text-xs">
                    {scenario.operations.length} operations
                  </span>
                  <span className="font-mono text-[var(--color-ink-faint)] text-xs">
                    {scenario.source}
                  </span>
                </div>
                {scenario.note && (
                  <p className="mt-1 text-[var(--color-ink-soft)] text-xs">{scenario.note}</p>
                )}
              </li>
            ))}
          </ul>
        </FigureCard>
      )}
    </div>
  );
}
