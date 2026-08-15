import type { CSSProperties } from "react";

/**
 * One state language for every surface: DOM rows, ECharts marks, React Flow nodes.
 *
 * The defect this replaces: each panel invented its own encoding, and two of them reused the
 * same channel at different magnitudes. A graph node hovered went to a 7px ring at 0.3 opacity
 * and pressed to 3px at 0.55, so pressing made the ring thinner but more opaque. A timeline
 * mark used a 1px lift for hover and a 4px ring at 0.25 for current, while the graph used a
 * 2px ring at 0.45 for the same idea. Both files claimed in comments to share one language.
 *
 * The rule here is that **each state owns a channel nothing else uses**:
 *
 *   hover     elevation, upward
 *   press     elevation, collapsed, plus a darker ground
 *   focus     a ring outside the box, in a hue no transaction owns
 *   selected  a ring inside the box, in the transaction's own hue
 *   current   filled with the hue, heavier text
 *   disabled  opacity, no pointer
 *
 * Focus and selected can then be told apart geometrically rather than by colour, which is why
 * focus reads on a node that is already selected. Focus is deliberately not driven from
 * `txnColor`: a T2 node ringed in T2 would lose its focus ring inside its own fill.
 */

export const FOCUS_RING_WIDTH = 2;
export const FOCUS_RING_OFFSET = 2;
export const SELECT_RING_WIDTH = 2;
export const SELECT_RING_OPACITY = 0.45;
export const HOVER_LIFT = 1;
export const HOVER_SHADOW = "0 1px 2px rgb(0 0 0 / 0.08)";

export interface MarkState {
  hover?: boolean;
  press?: boolean;
  focus?: boolean;
  selected?: boolean;
  current?: boolean;
  disabled?: boolean;
}

/** Tailwind classes for a DOM surface. Interactive elements keep their own base classes. */
export function markClass(state: MarkState): string {
  const parts: string[] = ["transition-[transform,box-shadow,background-color] duration-100"];
  if (state.disabled) return `${parts.join(" ")} pointer-events-none opacity-50`;
  if (state.press) parts.push("translate-y-0 bg-[var(--color-line)] shadow-none");
  else if (state.hover) parts.push("-translate-y-px shadow-[0_1px_2px_rgb(0_0_0/0.08)]");
  if (state.focus) parts.push("outline-2 outline-offset-2 outline-[var(--color-focus)]");
  if (state.current) parts.push("font-semibold");
  return parts.join(" ");
}

/**
 * React Flow nodes are DOM, not SVG, so a graph node and a table row resolve to the same
 * declarations. That equivalence is the point: hovering either produces one pixel of lift.
 */
export function flowNodeStyle(hue: string, state: MarkState): CSSProperties {
  const style: CSSProperties = {
    transition: "transform 100ms ease-out, box-shadow 100ms ease-out",
  };
  const shadows: string[] = [];

  if (state.press) style.transform = "translateY(0)";
  else if (state.hover) {
    style.transform = `translateY(-${HOVER_LIFT}px)`;
    shadows.push(HOVER_SHADOW);
  }
  if (state.selected) {
    shadows.push(`inset 0 0 0 ${SELECT_RING_WIDTH}px color-mix(in oklab, ${hue} 45%, transparent)`);
  }
  if (state.focus) {
    shadows.push(
      `0 0 0 ${FOCUS_RING_OFFSET}px var(--color-card)`,
      `0 0 0 ${FOCUS_RING_OFFSET + FOCUS_RING_WIDTH}px var(--color-focus)`,
    );
  }
  if (shadows.length > 0) style.boxShadow = shadows.join(", ");
  if (state.disabled) {
    style.opacity = 0.5;
    style.pointerEvents = "none";
  }
  return style;
}

/**
 * A table row carries the same four states as a graph node, in the same channels. Written as
 * Tailwind variants rather than React state because a row has no pointer handlers to drive,
 * and `:active` is a real press where a `useState` press would need three more listeners.
 *
 * The numbers are the constants above, not new ones: 1px of lift, the same shadow, and the
 * focus ring outside the box at 2px with a 2px offset.
 */
export const ROW_STATES = [
  "cursor-pointer transition-[transform,box-shadow,background-color] duration-100",
  "hover:-translate-y-px hover:shadow-[0_1px_2px_rgb(0_0_0/0.08)]",
  "active:translate-y-0 active:bg-[var(--color-line)] active:shadow-none",
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-focus)]",
].join(" ");

/**
 * Selection is a ring *inside* the box in the transaction's own hue, so it reads together
 * with a focus ring sitting outside it. An inset shadow is used rather than a border,
 * because a border would move the row by a pixel when it appears.
 */
export function rowSelectStyle(hue: string): CSSProperties {
  return {
    boxShadow: `inset 0 0 0 ${SELECT_RING_WIDTH}px color-mix(in oklab, ${hue} ${Math.round(
      SELECT_RING_OPACITY * 100,
    )}%, transparent)`,
  };
}

interface EChartsItemStyle {
  itemStyle: Record<string, unknown>;
  emphasis: { itemStyle: Record<string, unknown> };
  select: { itemStyle: Record<string, unknown> };
}

/**
 * ECharts cannot read a CSS class, so the same numbers are handed to it as graphic options.
 * `emphasis` is hover and `select` is selected, which keeps the chart's own interaction model
 * pointed at the same two states the DOM uses.
 */
export function echartsItemStyle(hue: string, state: MarkState = {}): EChartsItemStyle {
  return {
    itemStyle: {
      color: state.current ? hue : "var(--color-card)",
      borderColor: hue,
      borderWidth: 1,
      opacity: state.disabled ? 0.5 : 1,
    },
    emphasis: {
      itemStyle: {
        shadowBlur: 2,
        shadowOffsetY: 1,
        shadowColor: "rgb(0 0 0 / 0.08)",
      },
    },
    select: {
      itemStyle: {
        borderColor: hue,
        borderWidth: SELECT_RING_WIDTH,
        opacity: SELECT_RING_OPACITY,
      },
    },
  };
}
