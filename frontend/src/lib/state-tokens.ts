import type { CSSProperties } from "react";

/**
 * The version chain's row states, and the selection ring the SVG panels match by eye.
 *
 * Each state owns a channel nothing else uses, so two of them are never read as one:
 *
 *   hover     elevation, upward
 *   press     elevation, collapsed, plus a darker ground
 *   focus     a ring outside the box, in a hue no transaction owns
 *   selected  a ring inside the box, in the transaction's own hue
 *
 * Focus and selected are then told apart geometrically rather than by colour, which is why
 * focus still reads on a row that is already selected. Focus is deliberately not driven from
 * `txnColor`: a T2 row ringed in T2 would lose its focus ring inside its own fill.
 *
 * The graph node does not share the lift. It grows its halo instead, 0 to 6 to 9px, because
 * an SVG node inside a scaled viewBox cannot translate a pixel without the whole group
 * moving with it. Same idea, one channel, different geometry.
 */

export const SELECT_RING_WIDTH = 2;
export const SELECT_RING_OPACITY = 0.45;

/**
 * Written as Tailwind variants rather than React state because a row has no pointer handlers
 * to drive, and `:active` is a real press where a `useState` press would need three more
 * listeners.
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
