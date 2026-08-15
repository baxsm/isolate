"use client";

import dagre from "@dagrejs/dagre";
import type { FC } from "react";
import { useMemo } from "react";
import type { Edge, Step } from "@/lib/types";
import { txnColor, txnInkColor } from "@/lib/utils";

interface GraphPanelProps {
  step: Step | null;
  onSelectTxn?: (txn: number) => void;
  selected?: number | null;
}

const NODE_W = 64;
const NODE_H = 40;
const HEIGHT = 260;

interface Placed {
  txn: number;
  x: number;
  y: number;
  inCycle: boolean;
  pivot: boolean;
  aborted: boolean;
}

interface Drawn {
  edge: Edge;
  path: string;
  labelX: number;
  labelY: number;
  inCycle: boolean;
}

/**
 * Transactions as nodes, dependencies as edges, laid out by dagre.
 *
 * Drawn as plain SVG rather than with React Flow. React Flow 12.10 and 12.11 both render
 * zero edges on React 19.2: its own minimal two-node example produces an empty edge layer,
 * with the nodes and the store correct. Layout is still dagre's, so nothing here turns
 * data into coordinates by hand.
 *
 * The nodes are `g role="button"` and keyboard operable. A real `button` cannot be a child
 * of `svg`, which is why useSemanticElements is turned off for this file in biome.json.
 */
const GraphPanel: FC<GraphPanelProps> = ({ step, onSelectTxn, selected }) => {
  const { nodes, edges, width, height } = useMemo(() => {
    if (!step) return { nodes: [] as Placed[], edges: [] as Drawn[], width: 0, height: 0 };

    const cycleKeys = new Set<string>();
    const cycleNodes = new Set<number>();
    const pivots = new Set<number>();
    for (const cycle of step.cycles) {
      for (const edge of cycle) {
        cycleKeys.add(`${edge.frm}-${edge.to}-${edge.kind}-${edge.key}`);
        cycleNodes.add(edge.frm);
        cycleNodes.add(edge.to);
      }
      for (const node of cycleNodes) {
        const incoming = cycle.some((e) => e.to === node && e.kind === "rw");
        const outgoing = cycle.some((e) => e.frm === node && e.kind === "rw");
        if (incoming && outgoing) pivots.add(node);
      }
    }

    const graph = new dagre.graphlib.Graph();
    graph.setDefaultEdgeLabel(() => ({}));
    graph.setGraph({ rankdir: "LR", nodesep: 56, ranksep: 110, marginx: 24, marginy: 24 });
    const txns = Object.keys(step.txns)
      .map(Number)
      .sort((a, b) => a - b);
    for (const txn of txns) graph.setNode(String(txn), { width: NODE_W, height: NODE_H });
    for (const edge of step.edges) {
      if (graph.hasNode(String(edge.frm)) && graph.hasNode(String(edge.to))) {
        graph.setEdge(String(edge.frm), String(edge.to));
      }
    }
    dagre.layout(graph);

    const placed: Placed[] = txns.map((txn) => {
      const node = graph.node(String(txn));
      return {
        txn,
        x: node.x,
        y: node.y,
        inCycle: cycleNodes.has(txn),
        pivot: pivots.has(txn),
        aborted: step.txns[txn]?.state === "aborted",
      };
    });
    const byTxn = new Map(placed.map((p) => [p.txn, p]));

    // two transactions can depend on each other both ways, so edges between the same pair
    // are bowed apart. the offset is per pair, not per edge, or they overlap again
    const pairCount = new Map<string, number>();
    const drawn: Drawn[] = [];
    for (const edge of step.edges) {
      const from = byTxn.get(edge.frm);
      const to = byTxn.get(edge.to);
      if (!from || !to) continue;
      const pair = [edge.frm, edge.to].sort().join("-");
      const seen = pairCount.get(pair) ?? 0;
      pairCount.set(pair, seen + 1);
      const bow = seen === 0 ? -26 : 26;

      const forward = to.x >= from.x;
      const startX = from.x + (forward ? NODE_W / 2 : -NODE_W / 2);
      const endX = to.x + (forward ? -NODE_W / 2 : NODE_W / 2);
      const midX = (startX + endX) / 2;
      const midY = (from.y + to.y) / 2 + bow;

      drawn.push({
        edge,
        path: `M ${startX} ${from.y} Q ${midX} ${midY} ${endX} ${to.y}`,
        labelX: midX,
        labelY: (from.y + to.y) / 2 + bow / 2,
        inCycle: cycleKeys.has(`${edge.frm}-${edge.to}-${edge.kind}-${edge.key}`),
      });
    }

    const info = graph.graph();
    return {
      nodes: placed,
      edges: drawn,
      width: Math.max(info.width ?? 0, 240),
      height: Math.max(info.height ?? 0, 120),
    };
  }, [step]);

  if (!step || nodes.length === 0) {
    return <p className="text-[var(--color-ink-soft)] text-sm">No transactions yet.</p>;
  }

  // give the bowed edges and the cycle halo room outside the layout box
  const pad = 34;
  const viewBox = `${-pad} ${-pad} ${width + pad * 2} ${height + pad * 2}`;

  return (
    <div style={{ height: HEIGHT }} data-testid="graph">
      <svg
        viewBox={viewBox}
        width="100%"
        height="100%"
        role="group"
        aria-label="Dependency graph"
        preserveAspectRatio="xMidYMid meet"
      >
        <defs>
          <marker
            id="arrow"
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--color-line-strong)" />
          </marker>
          <marker
            id="arrow-cycle"
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--color-halo)" />
          </marker>
        </defs>

        {edges.map(({ edge, path, labelX, labelY, inCycle }) => {
          const id = `${edge.frm}-${edge.to}-${edge.kind}-${edge.key}`;
          return (
            <g key={id} data-testid={`edge-${id}`} data-in-cycle={inCycle}>
              <path
                d={path}
                fill="none"
                stroke={inCycle ? "var(--color-halo)" : "var(--color-line-strong)"}
                strokeWidth={inCycle ? 3 : 1.5}
                // adya's convention as cited by cahill: anti dependencies are dashed
                strokeDasharray={edge.kind === "rw" ? "6 4" : undefined}
                markerEnd={inCycle ? "url(#arrow-cycle)" : "url(#arrow)"}
                className={inCycle ? "cycle-edge" : undefined}
              />
              <text
                x={labelX}
                y={labelY}
                textAnchor="middle"
                fontSize="11"
                fontFamily="var(--font-mono)"
                fill="var(--color-ink-soft)"
                paintOrder="stroke"
                stroke="var(--color-card)"
                strokeWidth="4"
                strokeLinejoin="round"
              >
                {edge.kind} {edge.key}
              </text>
            </g>
          );
        })}

        {nodes.map((node) => (
          <g
            key={node.txn}
            data-testid={`node-${node.txn}`}
            data-in-cycle={node.inCycle}
            data-pivot={node.pivot}
            role="button"
            tabIndex={0}
            aria-label={`Transaction ${node.txn}${node.pivot ? ", pivot of a cycle" : ""}`}
            aria-pressed={selected === node.txn}
            className="cursor-pointer"
            onClick={() => onSelectTxn?.(node.txn)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onSelectTxn?.(node.txn);
              }
            }}
          >
            {/* a pivot sits between two anti dependency edges, which is what fekete's
                theorem says matters, so its ring is heavier than a plain cycle member */}
            {(node.inCycle || node.pivot) && (
              <rect
                x={node.x - NODE_W / 2 - (node.pivot ? 7 : 4)}
                y={node.y - NODE_H / 2 - (node.pivot ? 7 : 4)}
                width={NODE_W + (node.pivot ? 14 : 8)}
                height={NODE_H + (node.pivot ? 14 : 8)}
                rx="7"
                fill="none"
                stroke="var(--color-halo)"
                strokeWidth={node.pivot ? 4 : 2}
              />
            )}
            <rect
              x={node.x - NODE_W / 2}
              y={node.y - NODE_H / 2}
              width={NODE_W}
              height={NODE_H}
              rx="4"
              fill={txnColor(node.txn)}
              fillOpacity={node.aborted ? 0.5 : 1}
              stroke={selected === node.txn ? "var(--color-ink)" : "transparent"}
              strokeWidth="2"
            />
            <text
              x={node.x}
              y={node.y + 5}
              textAnchor="middle"
              fontSize="14"
              fontFamily="var(--font-mono)"
              fill={txnInkColor(node.txn)}
              textDecoration={node.aborted ? "line-through" : undefined}
            >
              T{node.txn}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
};

export default GraphPanel;
