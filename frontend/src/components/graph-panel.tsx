"use client";

import dagre from "@dagrejs/dagre";
import type { FC } from "react";
import { useMemo, useState } from "react";
import type { Edge, Step } from "@/lib/types";
import { txnColor, txnInkColor } from "@/lib/utils";

interface GraphPanelProps {
  step: Step | null;
  onSelectTxn?: (txn: number) => void;
  selected?: number | null;
}

const NODE_W = 64;
const NODE_H = 40;
// tall enough that a three node cycle is not cramped, short enough that a single node
// does not sit in a field of empty card
const MIN_HEIGHT = 110;
const MAX_HEIGHT = 260;

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
 * Drawn as plain SVG rather than with React Flow. Measured on 12.11 against this build:
 * default node types draw edges correctly, and a custom node type draws none, because the
 * custom node never reports its dimensions. React Flow gates both `visibility` and the edge
 * layer on a measured node, so the nodes stay hidden and no edge is ever placed. A custom
 * node is not optional here, since every node carries a transaction hue and a cycle ring.
 *
 * Layout is still dagre's, so nothing here turns data into coordinates by hand.
 *
 * The nodes are `g role="button"` and keyboard operable. A real `button` cannot be a child
 * of `svg`, which is why useSemanticElements is turned off for this file in biome.json.
 */
const GraphPanel: FC<GraphPanelProps> = ({ step, onSelectTxn, selected }) => {
  const [hovered, setHovered] = useState<number | null>(null);
  const [pressed, setPressed] = useState<number | null>(null);
  // separate from hover, not an alias of it: aliasing makes a keyboard user and a mouse
  // user look identical, and the global outline suppression leaves nothing in its place
  const [focused, setFocused] = useState<number | null>(null);

  const { nodes, edges, width, height } = useMemo(() => {
    if (!step) return { nodes: [] as Placed[], edges: [] as Drawn[], width: 0, height: 0 };

    const cycleKeys = new Set<string>();
    const cycleNodes = new Set<number>();
    const pivots = new Set<number>();
    for (const cycle of step.cycles) {
      // scoped to this cycle. a pivot is a node between two rw edges of the same cycle, so
      // testing against every node seen so far marks pivots that belong to another one
      const inThisCycle = new Set<number>();
      for (const edge of cycle) {
        cycleKeys.add(`${edge.frm}-${edge.to}-${edge.kind}-${edge.key}`);
        cycleNodes.add(edge.frm);
        cycleNodes.add(edge.to);
        inThisCycle.add(edge.frm);
        inThisCycle.add(edge.to);
      }
      for (const node of inThisCycle) {
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
      // dagre's own box, not a floor. forcing 120 here gave a single node a 188px field of
      // empty card to sit in, with "no dependencies yet" stranded under it
      height: info.height ?? 0,
    };
  }, [step]);

  if (!step || nodes.length === 0) {
    return <p className="text-[var(--color-ink-soft)] text-sm">No transactions yet.</p>;
  }

  // room outside the layout box for the bowed edges and the cycle halo. with no edges
  // there is neither, and the full padding left one node in a 188px field of empty card
  const hasEdges = edges.length > 0;
  const pad = hasEdges ? 34 : 10;

  /*
    dagre sizes its box for a rank layout whether or not anything is ranked, so a single
    node came back in a 260x108 box holding 64x40 of node: measured, 68px of it empty. With
    no edges there is nothing between nodes to leave room for, so the box is the nodes'
    own bounds instead of dagre's.
  */
  const bounds = hasEdges
    ? { x: 0, y: 0, w: width, h: height }
    : (() => {
        const xs = nodes.map((n) => n.x);
        const ys = nodes.map((n) => n.y);
        const left = Math.min(...xs) - NODE_W / 2;
        const top = Math.min(...ys) - NODE_H / 2;
        return {
          x: left,
          y: top,
          w: Math.max(...xs) + NODE_W / 2 - left,
          h: Math.max(...ys) + NODE_H / 2 - top,
        };
      })();

  const viewBox = `${bounds.x - pad} ${bounds.y - pad} ${bounds.w + pad * 2} ${bounds.h + pad * 2}`;

  // the floor only earns its space once there are edges to give room to
  const drawnHeight = Math.min(
    MAX_HEIGHT,
    hasEdges ? Math.max(MIN_HEIGHT, height + pad * 2) : bounds.h + pad * 2,
  );

  return (
    <div style={{ height: drawnHeight }} data-testid="graph">
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
            onPointerEnter={() => setHovered(node.txn)}
            onPointerLeave={() => {
              setHovered((current) => (current === node.txn ? null : current));
              setPressed((current) => (current === node.txn ? null : current));
            }}
            onPointerDown={() => setPressed(node.txn)}
            onPointerUp={() => setPressed(null)}
            onFocus={(event) => {
              // only a keyboard focus draws the ring. a pointer press focuses too, and
              // ringing then puts a focus ring on every node the reader merely clicks
              if (event.currentTarget.matches(":focus-visible")) setFocused(node.txn);
            }}
            onBlur={() => setFocused((current) => (current === node.txn ? null : current))}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onSelectTxn?.(node.txn);
              }
            }}
          >
            {/* furthest out, in a hue no transaction owns, so it reads on a node that is
                already selected and haloed. this is what stands in for the browser outline
                the app suppresses on svg buttons */}
            {focused === node.txn && (
              <rect
                x={node.x - NODE_W / 2 - 8}
                y={node.y - NODE_H / 2 - 8}
                width={NODE_W + 16}
                height={NODE_H + 16}
                rx="10"
                fill="none"
                stroke="var(--color-focus)"
                strokeWidth="2"
              />
            )}
            {/* selection is an offset ring in the node's own hue, so it reads as "this
                one" without competing with the cycle halo sitting right beside it */}
            {selected === node.txn && (
              <rect
                x={node.x - NODE_W / 2 - 5}
                y={node.y - NODE_H / 2 - 5}
                width={NODE_W + 10}
                height={NODE_H + 10}
                rx="8"
                fill="none"
                stroke={txnColor(node.txn)}
                strokeWidth="2"
                strokeOpacity="0.45"
              />
            )}
            {/* a pivot sits between two anti dependency edges, which is what fekete's
                theorem says matters, so it is dashed where a plain cycle member is solid */}
            {(node.inCycle || node.pivot) && (
              <rect
                x={node.x - NODE_W / 2 - 2.5}
                y={node.y - NODE_H / 2 - 2.5}
                width={NODE_W + 5}
                height={NODE_H + 5}
                rx="6"
                fill="none"
                stroke="var(--color-halo)"
                strokeWidth={node.pivot ? 2.5 : 1.5}
                strokeDasharray={node.pivot ? "5 3" : undefined}
              />
            )}
            <rect
              className="graph-node"
              x={node.x - NODE_W / 2}
              y={node.y - NODE_H / 2}
              width={NODE_W}
              height={NODE_H}
              rx="4"
              fill={txnColor(node.txn)}
              fillOpacity={node.aborted ? 0.45 : 1}
              stroke={txnColor(node.txn)}
              // one channel, one direction: the halo only grows. 0, 6, 9
              strokeWidth={pressed === node.txn ? 9 : hovered === node.txn ? 6 : 0}
              strokeOpacity={pressed === node.txn ? 0.45 : hovered === node.txn ? 0.28 : 0}
              paintOrder="stroke"
            />
            <text
              x={node.x}
              y={node.y + 5}
              textAnchor="middle"
              fontSize="14"
              fontFamily="var(--font-mono)"
              fontWeight={selected === node.txn ? 600 : 400}
              fill={txnInkColor(node.txn)}
              textDecoration={node.aborted ? "line-through" : undefined}
              pointerEvents="none"
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
