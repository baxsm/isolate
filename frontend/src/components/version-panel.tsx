"use client";

import {
  columnVisibilityFeature,
  createColumnHelper,
  tableFeatures,
  useTable,
} from "@tanstack/react-table";
import type { FC } from "react";
import { useMemo } from "react";
import TxnBadge from "@/components/txn-badge";
import { ROW_STATES, rowSelectStyle } from "@/lib/state-tokens";
import type { Step, Version } from "@/lib/types";
import { cn, txnColor } from "@/lib/utils";

interface VersionPanelProps {
  step: Step | null;
  /** Whose eyes to read the chain through. Drives the hatching. */
  viewer: number | null;
  /** Selecting a transaction anywhere rings its rows here, in its own hue. */
  selected?: number | null;
  onSelectTxn?: (txn: number) => void;
}

interface VersionRow {
  version: Version;
  visible: boolean;
  dead: boolean;
  /** No live transaction is looking, so "not visible" would be a claim about nobody. */
  unobserved: boolean;
}

// columnVisibilityFeature is what puts getVisibleCells on a row. without it the row only
// carries the core API and the cells cannot be walked
const features = tableFeatures({ columnVisibilityFeature });
const helper = createColumnHelper<typeof features, VersionRow>();

// helper.columns keeps each column's own value type instead of widening them all to the
// first one, which is what a plain array does when the types differ
const columns = helper.columns([
  helper.accessor((row) => row.version.key, {
    id: "key",
    header: "key",
    cell: (info) => <span className="tabular font-mono">{info.getValue()}</span>,
  }),
  helper.accessor((row) => row.version.value, {
    id: "value",
    header: "value",
    cell: (info) => {
      const value = info.getValue();
      return (
        <span className="tabular font-mono">
          {value === null ? <span className="text-[var(--color-ink-faint)]">deleted</span> : value}
        </span>
      );
    },
  }),
  helper.accessor((row) => row.version.xmin, {
    id: "xmin",
    header: "xmin",
    cell: (info) => {
      const xmin = info.getValue();
      return xmin === 0 ? (
        <span className="tabular font-mono text-[var(--color-ink-faint)]">0</span>
      ) : (
        <TxnBadge txn={xmin} label={String(xmin)} />
      );
    },
  }),
  helper.accessor((row) => row.version.xmax, {
    id: "xmax",
    header: "xmax",
    cell: (info) => {
      const xmax = info.getValue();
      return xmax === null ? (
        <span className="text-[var(--color-ink-faint)]">–</span>
      ) : (
        <TxnBadge txn={xmax} label={String(xmax)} />
      );
    },
  }),
  helper.display({
    id: "state",
    header: "state",
    cell: ({ row }) => {
      if (row.original.dead) return <span className="text-[var(--color-ink-faint)]">dead</span>;
      if (row.original.visible) return <span>{row.original.unobserved ? "live" : "visible"}</span>;
      return <span className="text-[var(--color-ink-faint)]">not visible</span>;
    },
  }),
]);

const VersionPanel: FC<VersionPanelProps> = ({ step, viewer, selected, onSelectTxn }) => {
  const data = useMemo<VersionRow[]>(() => {
    if (!step) return [];
    const out: VersionRow[] = [];
    // a committed or aborted transaction has no live view, so the engine sends no row for
    // it. reporting every version as "not visible" then describes nobody's perspective
    const watching = viewer != null && step.visible[viewer] !== undefined;
    for (const key of Object.keys(step.versions).sort()) {
      const chain = step.versions[key] ?? [];
      const seen = watching ? step.visible[viewer]?.[key] : undefined;
      for (const version of chain) {
        out.push({
          version,
          // the row this transaction actually reads: live, and carrying the value its
          // snapshot resolves to
          visible: watching
            ? seen !== undefined && seen !== null && seen === version.value
            : version.xmax === null,
          dead: version.xmax !== null,
          unobserved: !watching,
        });
      }
    }
    return out;
  }, [step, viewer]);

  const table = useTable({ features, columns, data });

  if (!step) {
    return <p className="text-[var(--color-ink-soft)] text-sm">Nothing to show yet.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm" data-testid="version-table">
        <thead>
          {table.getHeaderGroups().map((group) => (
            <tr key={group.id} className="border-[var(--color-line)] border-b">
              {group.headers.map((header) => (
                <th
                  key={header.id}
                  scope="col"
                  className="px-2 py-2 text-left font-medium font-mono text-[var(--color-ink-soft)] text-xs"
                >
                  <table.FlexRender header={header} />
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody>
          {table.getRowModel().rows.map((row) => {
            // the transaction that wrote this version. selecting T2 anywhere rings its rows
            // here in its own hue, which is what makes three panels read as one object
            const owner = row.original.version.xmin;
            const isSelected = selected != null && owner === selected && owner !== 0;
            return (
              <tr
                key={row.id}
                data-testid="version-row"
                data-visible={row.original.visible}
                data-dead={row.original.dead}
                data-selected={isSelected}
                onClick={owner !== 0 ? () => onSelectTxn?.(owner) : undefined}
                onKeyDown={
                  owner !== 0
                    ? (event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          onSelectTxn?.(owner);
                        }
                      }
                    : undefined
                }
                tabIndex={owner !== 0 && onSelectTxn ? 0 : undefined}
                style={isSelected ? rowSelectStyle(txnColor(owner)) : undefined}
                className={cn(
                  "border-[var(--color-line)] border-b last:border-0",
                  // one language with the graph node: hover lifts and shadows, press
                  // collapses onto a darker ground, focus rings outside the box
                  owner !== 0 && onSelectTxn && ROW_STATES,
                  !row.original.visible && !row.original.unobserved && "not-visible-row",
                  row.original.dead && "line-through decoration-[var(--color-ink-faint)]",
                )}
              >
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id} className="px-2 py-2">
                    <table.FlexRender cell={cell} />
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

export default VersionPanel;
