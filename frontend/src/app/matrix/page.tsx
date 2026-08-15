import Link from "next/link";
import EngineUnreachable from "@/components/engine-unreachable";
import FigureCard from "@/components/figure-card";
import { getMatrix } from "@/lib/api";
import { ROW_LINK } from "@/lib/interaction";
import { cn } from "@/lib/utils";

export const metadata = {
  title: "The matrix",
  description: "Every scenario at every isolation level, checked against the published table.",
};

// the G-codes are the literature's names and the column has to stay narrow, so the plain
// english sits under the code rather than replacing it
const ANOMALIES: { code: string; name: string }[] = [
  { code: "G0", name: "write cycle" },
  { code: "G1a", name: "aborted read" },
  { code: "G1b", name: "intermediate read" },
  { code: "G1c", name: "circular info" },
  { code: "OTV", name: "observed txn vanishes" },
  { code: "PMP", name: "predicate many preceders" },
  { code: "P4", name: "lost update" },
  { code: "G-single", name: "read skew" },
  { code: "G2-item", name: "write skew" },
  { code: "G2", name: "anti dependency cycle" },
];

const ENGINE_PARAM: Record<string, string> = {
  PostgreSQL: "postgres",
  "MySQL/InnoDB": "mysql",
};

const LEVEL_PARAM: Record<string, string> = {
  "read uncommitted": "read_uncommitted",
  "read committed": "read_committed",
  "repeatable read": "repeatable_read",
  serializable: "serializable",
};

/**
 * A cell is an anomaly at one engine and one level, so its link has to carry all three.
 * Sending only the scenario opened every cell on the PostgreSQL default, which answered a
 * question the reader had not asked and looked like the right answer.
 */
function cellHref(scenarioId: string, engine: string, level: string): string {
  const params = new URLSearchParams({ scenario: scenarioId });
  const engineParam = ENGINE_PARAM[engine];
  const levelParam = LEVEL_PARAM[level];
  if (engineParam) params.set("engine", engineParam);
  if (levelParam) params.set("level", levelParam);
  return `/compose?${params.toString()}`;
}

/**
 * A server component. Every cell is the engine's answer for a fixed scenario at a fixed
 * level, identical for every reader, so it is computed on the server and arrives as HTML
 * rather than as "Running every scenario…" followed by a table.
 */
export default async function MatrixPage() {
  const rows = await getMatrix().catch(() => null);

  if (!rows) {
    return <EngineUnreachable title="The matrix" />;
  }

  const disagreements = rows.flatMap((row) => row.cells.filter((cell) => !cell.agrees));

  return (
    <div className="mx-auto max-w-[1200px] px-6 py-6">
      <h1 className="font-medium text-xl tracking-tight">The matrix</h1>
      <p className="mt-2 max-w-[80ch] text-[var(--color-ink-soft)] text-sm">
        Computed live by running every scenario at every level, then compared against the table
        Kleppmann published. A cell that disagrees is marked, because hiding it would be the
        dishonest thing to do.
      </p>

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
        {/* the legend is a line of text, not a tinted box inside the card */}
        <div className="mb-4 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs">
          <span className="text-[var(--color-ink)]">
            <span className="font-mono">allowed</span> the anomaly happens at this level
          </span>
          <span className="text-[var(--color-ink-soft)]">
            <span className="font-mono text-[var(--color-ink-faint)]">safe</span> the level prevents
            it
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
                {ANOMALIES.map(({ code, name }) => (
                  <th
                    key={code}
                    scope="col"
                    className="px-2 py-2 text-left align-bottom font-medium text-[var(--color-ink-soft)] text-xs"
                  >
                    <span className="block font-mono">{code}</span>
                    <span className="block max-w-24 font-normal text-[10px] text-[var(--color-ink-faint)] leading-tight">
                      {name}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {/*
                No hover on the row itself. A `tr` is not clickable here, only its cells are,
                and a row that lights up under the pointer while doing nothing promises a
                target that is not there. The audit fails the build over it. Tracking across
                the row is handled by the engine and level cells staying legible, not by
                tinting a thing you cannot press.
              */}
              {rows.map((row) => (
                <tr
                  key={`${row.engine}-${row.label}`}
                  className="border-[var(--color-line)] border-b last:border-0"
                >
                  <td className="whitespace-nowrap px-2 py-2">{row.engine}</td>
                  <td className="whitespace-nowrap px-2 py-2">
                    <span className="text-[var(--color-ink)]">{row.label}</span>
                    <span className="block text-[var(--color-ink-soft)] text-xs">{row.actual}</span>
                  </td>
                  {row.cells.map((cell) => (
                    <td key={cell.anomaly} className="p-0">
                      {/*
                            The whole cell is the target. This used to be a text link with
                            `hover:underline` and nothing else: no focus ring, no press, and
                            a hit area the width of the word inside a much wider cell, 70
                            times over.
                          */}
                      <Link
                        href={cellHref(cell.scenario_id, row.engine, row.label)}
                        aria-label={`${cell.anomaly} at ${row.engine} ${row.label}: ${
                          cell.computed ? "prevented" : "allowed"
                        }${cell.agrees ? "" : ", disagrees with the published table"}. Open ${
                          cell.scenario_id
                        }`}
                        className={cn("tabular block px-2 py-2 font-mono text-xs", ROW_LINK)}
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
    </div>
  );
}
