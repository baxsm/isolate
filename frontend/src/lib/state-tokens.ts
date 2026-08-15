import type { CSSProperties } from "react";

/**
 * The version chain's row states, and the selection ring the SVG panels match by eye.
 *
 * Each state owns a channel nothing else uses: hover lifts, press collapses onto a darker
 * ground, focus rings outside the box in a hue no transaction owns, selection rings inside
 * it in the transaction's own. Focus and selection are told apart by geometry rather than
 * colour, so focus still reads on a row that is already selected.
 *
 * The graph node grows a halo, 0 to 6 to 9px, instead of lifting: an SVG node in a scaled
 * viewBox cannot translate without its whole group moving.
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

/** An inset shadow rather than a border, which would move the row a pixel when it appears. */
export function rowSelectStyle(hue: string): CSSProperties {
  return {
    boxShadow: `inset 0 0 0 ${SELECT_RING_WIDTH}px color-mix(in oklab, ${hue} ${Math.round(
      SELECT_RING_OPACITY * 100,
    )}%, transparent)`,
  };
}
