import Link from "next/link";
import FigureCard from "@/components/figure-card";
import { getMatrix, getScenarios } from "@/lib/api";
import { ROW_LINK } from "@/lib/interaction";
import type { MatrixRow } from "@/lib/types";
import { cn } from "@/lib/utils";

export const metadata = {
  title: "Scenarios",
  description: "Every schedule from the Hermitage suite, and the levels that prevent each one.",
};

/**
 * A server component. The scenario library and the matrix are the same for every reader and
 * change only when the engine does, so they are fetched on the server and arrive as HTML.
 *
 * This was a client component that fetched on mount, which meant every visit rendered
 * "Loading scenarios…" and then replaced it, and a reader with the engine down saw an empty
 * page before the error. It also made the page depend on the engine's CORS allowlist, which
 * only covers browser origins.
 */
export default async function ScenariosPage() {
  const [scenarios, matrix] = await Promise.all([
    getScenarios().catch(() => null),
    // the levels that stop an anomaly are the matrix's answer, not a second table written
    // here that could drift away from it
    getMatrix().catch((): MatrixRow[] => []),
  ]);

  if (!scenarios) {
    return (
      <div className="mx-auto max-w-[1200px] px-6 py-6">
        <h1 className="font-medium text-xl tracking-tight">Scenarios</h1>
        <p className="mt-6 text-[var(--color-danger)] text-sm">
          Could not reach the engine. Check it is running, then reload.
        </p>
      </div>
    );
  }

  const preventedBy = levelsThatPrevent(matrix);

  return (
    <div className="mx-auto max-w-[1200px] px-6 py-6">
      <h1 className="font-medium text-xl tracking-tight">Scenarios</h1>
      <p className="mt-2 max-w-[68ch] text-[var(--color-ink-soft)] text-sm">
        Every schedule from Kleppmann&apos;s Hermitage suite, plus Fekete&apos;s three transaction
        example. Each one names the file it was transcribed from.
      </p>

      <FigureCard className="mt-6" flush>
        <ul className="flex flex-col">
          {scenarios.map((scenario, i) => (
            <li key={scenario.id} className={i === 0 ? "" : "border-[var(--color-line)] border-t"}>
              {/*
                The whole row is the target. Only the id used to be a link, so a 40px token
                sat at the left of a full-width row of text that looked equally clickable
                and was not.
              */}
              <Link
                href={`/compose?scenario=${encodeURIComponent(scenario.id)}`}
                className={cn("block px-4 py-3", ROW_LINK)}
              >
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-2">
                  <span className="font-mono text-[var(--color-t1-text)] text-sm">
                    {scenario.id}
                  </span>
                  <span className="text-[var(--color-ink)] text-sm">{scenario.title}</span>
                  <span className="tabular font-mono text-[var(--color-ink-soft)] text-xs">
                    {scenario.operations.length} operations
                  </span>
                  <span className="font-mono text-[var(--color-ink-faint)] text-xs">
                    {scenario.source}
                  </span>
                </div>
                {scenario.note && (
                  <p className="mt-2 text-[var(--color-ink-soft)] text-xs">{scenario.note}</p>
                )}
                <p className="mt-2 text-[var(--color-ink-soft)] text-xs">
                  {describePrevention(preventedBy.get(scenario.id))}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      </FigureCard>
    </div>
  );
}

/** PostgreSQL levels at which each scenario's anomaly does not occur. */
function levelsThatPrevent(matrix: MatrixRow[]): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const row of matrix) {
    if (row.engine !== "PostgreSQL") continue;
    for (const cell of row.cells) {
      if (!cell.computed) continue;
      const levels = out.get(cell.scenario_id) ?? [];
      levels.push(row.label);
      out.set(cell.scenario_id, levels);
    }
  }
  return out;
}

function describePrevention(levels: string[] | undefined): string {
  if (!levels || levels.length === 0) return "No PostgreSQL level prevents this schedule.";
  return `Prevented on PostgreSQL by ${levels.join(", ")}.`;
}
