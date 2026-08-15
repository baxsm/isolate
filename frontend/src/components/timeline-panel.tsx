"use client";

import type { FC } from "react";
import { useMemo } from "react";
import type { Step } from "@/lib/types";
import { opToken, txnColor, txnInkColor } from "@/lib/utils";

interface TimelinePanelProps {
  steps: Step[];
  index: number;
  onScrub: (index: number) => void;
}

const LANE_HEIGHT = 18;
const LANE_GAP = 12;
const LEFT = 44;
const MARK = 26;

/**
 * One swimlane per transaction, operations as marks on a shared step axis.
 *
 * Hand written SVG rather than an ECharts custom series. A custom series here would be a
 * coordinate transform plus six hand drawn mark states, which is the same work with a
 * chart library's lifecycle on top and a canvas fallback that jsdom cannot read. Nothing
 * here turns data into a scale: the x position is the step index.
 *
 * The marks are `g role="button"` and keyboard operable. A real `button` cannot be a child
 * of `svg`, which is why useSemanticElements is turned off for this file in biome.json.
 */
const TimelinePanel: FC<TimelinePanelProps> = ({ steps, index, onScrub }) => {
  const txns = useMemo(() => {
    const seen = new Set<number>();
    for (const step of steps) seen.add(step.op.txn);
    return [...seen].sort((a, b) => a - b);
  }, [steps]);

  const width = LEFT + Math.max(steps.length, 1) * MARK + 8;
  const height = txns.length * (LANE_HEIGHT + LANE_GAP) + 8;

  if (steps.length === 0) {
    return <p className="text-[var(--color-ink-soft)] text-sm">No operations yet.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        role="group"
        aria-label="Schedule timeline"
        data-testid="timeline"
        style={{ display: "block" }}
      >
        <defs>
          <pattern
            id="hatch"
            width="6"
            height="6"
            patternTransform="rotate(45)"
            patternUnits="userSpaceOnUse"
          >
            <line x1="0" y1="0" x2="0" y2="6" stroke="var(--color-line-strong)" strokeWidth="2" />
          </pattern>
        </defs>

        {txns.map((txn, lane) => {
          const y = lane * (LANE_HEIGHT + LANE_GAP) + 4;
          const own = steps.filter((step) => step.op.txn === txn);
          // the lane ends at this transaction's last operation. running every lane to the
          // full width draws a line to where the transaction is not, which reads as a
          // transaction still doing something after it has committed
          const lastX = own.length > 0 ? LEFT + (own.at(-1)?.index ?? 0) * MARK + (MARK - 6) : LEFT;
          return (
            <g key={txn}>
              <text
                x={0}
                y={y + LANE_HEIGHT / 2 + 4}
                className="tabular"
                fontSize="11"
                fontFamily="var(--font-mono)"
                fill="var(--color-ink-soft)"
              >
                T{txn}
              </text>
              <line
                x1={LEFT - 6}
                y1={y + LANE_HEIGHT / 2}
                x2={lastX}
                y2={y + LANE_HEIGHT / 2}
                stroke="var(--color-line)"
                strokeWidth="1"
              />
              {steps
                .filter((step) => step.op.txn === txn)
                .map((step) => {
                  const x = LEFT + step.index * MARK;
                  const current = step.index === index;
                  const past = step.index < index;
                  const future = step.index > index;
                  const failed = step.outcome === "aborted" || step.outcome === "error";
                  const blocked = step.outcome === "blocked";
                  return (
                    <g
                      key={step.index}
                      role="button"
                      tabIndex={0}
                      aria-label={`Step ${step.index + 1}, ${opToken(step.op.kind, step.op.txn, step.op.key)}`}
                      aria-current={current ? "step" : undefined}
                      data-testid={`mark-${step.index}`}
                      data-state={current ? "current" : past ? "past" : "future"}
                      className="cursor-pointer"
                      onClick={() => onScrub(step.index)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          onScrub(step.index);
                        }
                      }}
                    >
                      <title>{opToken(step.op.kind, step.op.txn, step.op.key)}</title>
                      {/*
                        state is carried by form, not by opacity. a stroke faded to 0.5
                        against the dark ground measures about 1.9:1 and reads as missing.
                        past is filled, future is outlined, current gains a ring.
                      */}
                      {current && (
                        <rect
                          x={x - 3}
                          y={y - 3}
                          width={MARK}
                          height={LANE_HEIGHT + 6}
                          rx="5"
                          fill="none"
                          stroke={txnColor(txn)}
                          strokeWidth="1.5"
                        />
                      )}
                      <rect
                        x={x}
                        y={y}
                        width={MARK - 6}
                        height={LANE_HEIGHT}
                        rx="3"
                        fill={past || current ? txnColor(txn) : "var(--color-card)"}
                        stroke={txnColor(txn)}
                        strokeWidth={current ? 2 : 1}
                        strokeDasharray={future ? "3 2" : undefined}
                      />
                      {blocked && (
                        <rect
                          x={x}
                          y={y}
                          width={MARK - 6}
                          height={LANE_HEIGHT}
                          rx="3"
                          fill="url(#hatch)"
                          fillOpacity="0.55"
                        />
                      )}
                      <text
                        x={x + (MARK - 6) / 2}
                        y={y + LANE_HEIGHT / 2 + 4}
                        textAnchor="middle"
                        fontSize="10"
                        fontFamily="var(--font-mono)"
                        fontWeight={current ? 600 : 400}
                        fill={past || current ? txnInkColor(txn) : "var(--color-ink-soft)"}
                      >
                        {shortLabel(step.op.kind)}
                      </text>
                      {failed && (
                        <line
                          x1={x + 3}
                          y1={y + 3}
                          x2={x + MARK - 9}
                          y2={y + LANE_HEIGHT - 3}
                          stroke="var(--color-danger)"
                          strokeWidth="2"
                        />
                      )}
                    </g>
                  );
                })}
            </g>
          );
        })}
      </svg>
    </div>
  );
};

function shortLabel(kind: string): string {
  switch (kind) {
    case "begin":
      return "B";
    case "commit":
      return "C";
    case "abort":
      return "A";
    case "read":
    case "predicate_read":
      return "R";
    case "write":
    case "predicate_write":
      return "W";
    case "insert":
      return "I";
    case "delete":
    case "predicate_delete":
      return "D";
    default:
      return "?";
  }
}

export default TimelinePanel;
