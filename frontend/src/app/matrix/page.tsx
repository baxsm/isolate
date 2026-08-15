"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import FigureCard from "@/components/figure-card";
import { ApiError, getMatrix } from "@/lib/api";
import type { MatrixRow } from "@/lib/types";

const ANOMALIES = ["G0", "G1a", "G1b", "G1c", "OTV", "PMP", "P4", "G-single", "G2-item", "G2"];

export default function MatrixPage() {
  const [rows, setRows] = useState<MatrixRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  // biome-ignore lint/correctness/useExhaustiveDependencies: attempt is the retry trigger, it re-runs the effect without the request changing
  useEffect(() => {
    let live = true;
    getMatrix()
      .then((data) => live && setRows(data))
      .catch((err: unknown) => {
        if (!live) return;
        setError(err instanceof ApiError ? err.message : "Could not compute the matrix.");
      });
    return () => {
      live = false;
    };
  }, [attempt]);

  const disagreements = rows?.flatMap((row) => row.cells.filter((cell) => !cell.agrees)) ?? [];

  return (
    <div className="mx-auto max-w-[1200px] px-6 py-8">
      <h1 className="font-medium text-xl tracking-tight">The matrix</h1>
      <p className="mt-2 max-w-[80ch] text-[var(--color-ink-soft)] text-sm">
        Computed live by running every scenario at every level, then compared against the table
        Kleppmann published. A cell that disagrees is marked, because hiding it would be the
        dishonest thing to do.
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

      {!error && rows === null && (
        <p className="mt-6 text-[var(--color-ink-soft)] text-sm">Running every scenario…</p>
      )}

      {rows && (
        <>
          <p className="mt-4 text-sm">
            {disagreements.length === 0 ? (
              <span className="text-[var(--color-ink)]">
                All {rows.length * ANOMALIES.length} cells reproduce the published result.
              </span>
            ) : (
              <span className="text-[var(--color-danger)]">
                {disagreements.length} cells disagree with the published table.
              </span>
            )}
          </p>

          <FigureCard className="mt-6">
            <div className="mb-3 flex flex-wrap items-center gap-x-6 gap-y-1 rounded bg-[var(--color-inset)] px-3 py-2 text-xs">
              <span className="text-[var(--color-ink)]">
                <span className="font-mono">allowed</span> the anomaly happens at this level
              </span>
              <span className="text-[var(--color-ink-soft)]">
                <span className="font-mono text-[var(--color-ink-faint)]">safe</span> the level
                prevents it
              </span>
              <span className="text-[var(--color-danger)]">
                <span className="font-mono">!</span> disagrees with the published table
              </span>
              <span className="text-[var(--color-ink-soft)]">Every cell opens its schedule.</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <caption className="sr-only">
                  Anomalies prevented by each engine and isolation level
                </caption>
                <thead>
                  <tr className="border-[var(--color-line)] border-b">
                    <th
                      scope="col"
                      className="px-2 py-2 text-left font-medium text-[var(--color-ink-soft)] text-xs"
                    >
                      engine
                    </th>
                    <th
                      scope="col"
                      className="px-2 py-2 text-left font-medium text-[var(--color-ink-soft)] text-xs"
                    >
                      level
                    </th>
                    {ANOMALIES.map((anomaly) => (
                      <th
                        key={anomaly}
                        scope="col"
                        className="px-2 py-2 text-left font-medium font-mono text-[var(--color-ink-soft)] text-xs"
                      >
                        {anomaly}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr
                      key={`${row.engine}-${row.label}`}
                      className="border-[var(--color-line)] border-b last:border-0"
                    >
                      <td className="whitespace-nowrap px-2 py-2">{row.engine}</td>
                      <td className="whitespace-nowrap px-2 py-2">
                        <span className="text-[var(--color-ink)]">{row.label}</span>
                        <span className="block text-[var(--color-ink-soft)] text-xs">
                          {row.actual}
                        </span>
                      </td>
                      {row.cells.map((cell) => (
                        <td key={cell.anomaly} className="px-2 py-2">
                          <Link
                            href={`/compose?scenario=${encodeURIComponent(cell.scenario_id)}`}
                            aria-label={`${cell.anomaly} at ${row.engine} ${row.label}: ${
                              cell.computed ? "prevented" : "allowed"
                            }${cell.agrees ? "" : ", disagrees with the published table"}. Open ${
                              cell.scenario_id
                            }`}
                            className="tabular font-mono text-xs underline-offset-4 hover:underline"
                            style={{
                              color: cell.agrees
                                ? cell.computed
                                  ? "var(--color-ink-faint)"
                                  : "var(--color-ink)"
                                : "var(--color-danger)",
                            }}
                          >
                            {/* "prevented" and "allowed" rather than yes and no: yes to
                                "does it prevent" and yes to "does it happen" are opposite
                                answers, and the header does not say which was asked */}
                            {cell.computed ? "safe" : "allowed"}
                            {cell.agrees ? "" : " !"}
                          </Link>
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </FigureCard>
        </>
      )}
    </div>
  );
}
