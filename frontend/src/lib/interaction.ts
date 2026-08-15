/**
 * The interaction vocabulary every control shares, written as class strings so a control
 * cannot forget a state. Each state owns a channel nothing else uses; `state-tokens.ts`
 * holds the same rule for the version rows.
 */

/** Always outside the box, never a transaction hue, identical on every control. */
export const FOCUS =
  "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-focus)]";

/** A real text underline, so it tracks the baseline and the descenders. */
export const PROSE_LINK = [
  "text-[var(--color-t1-text)] underline decoration-[var(--color-t1-text)]/40 underline-offset-[3px]",
  "transition-colors hover:decoration-[var(--color-t1-text)]",
  FOCUS,
  "rounded-xs",
].join(" ");

/** The active rule is a pseudo element, not a bottom border: it spans the label exactly and
 * keeps square ends on a rounded box. */
export const NAV_LINK = [
  "relative inline-block py-2 text-sm transition-colors",
  "after:pointer-events-none after:absolute after:inset-x-0 after:-bottom-[7px] after:h-[2px] after:content-['']",
  FOCUS,
  "rounded-xs",
].join(" ");

export const NAV_LINK_ACTIVE = "font-medium text-[var(--color-ink)] after:bg-[var(--color-t1)]";

/** Hover previews the active marker at low strength, rather than inventing a second idea. */
export const NAV_LINK_IDLE = [
  "text-[var(--color-ink-soft)] hover:text-[var(--color-ink)]",
  "after:bg-transparent hover:after:bg-[var(--color-line-strong)]",
].join(" ");

/**
 * A row or cell that navigates. The ground fills instead of lifting, because a row in a
 * divided list has neighbours a lift collides with. The focus ring is inset via
 * `.focus-inset`: an outward ring on the matrix's last column was clipped by the scroll
 * container, and the negative-offset utility does not resolve on the installed Tailwind.
 */
export const ROW_LINK = [
  "cursor-pointer transition-colors",
  "hover:bg-[var(--color-inset)] active:bg-[var(--color-line)]",
  "focus-inset",
].join(" ");
