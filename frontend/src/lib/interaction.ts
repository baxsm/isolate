/**
 * The interaction vocabulary every control in the app shares.
 *
 * This exists because the states were previously decided per component, and they disagreed:
 * nav links had no hover class at all and changed only their ink, graph nodes had no focus
 * treatment because the global outline was suppressed and nothing replaced it, transport
 * buttons were the only thing in the app with a press state, and the nav's active marker was
 * a `border-b-2` on a `rounded-sm` box, which paints a stubby bar with rounded ends floating
 * under the word rather than an underline.
 *
 * The rule is the one in `state-tokens.ts`: each state owns a channel nothing else uses. This
 * module is the DOM half of that, written as class strings so a control cannot forget one.
 */

/** Focus. Always outside the box, never a transaction hue, identical on every control. */
export const FOCUS =
  "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-focus)]";

/**
 * A text link inside prose. The underline is a real text underline, so it tracks the
 * baseline and the descenders rather than being a border painted under the box.
 */
export const PROSE_LINK = [
  "text-[var(--color-t1-text)] underline decoration-[var(--color-t1-text)]/40 underline-offset-[3px]",
  "transition-colors hover:decoration-[var(--color-t1-text)]",
  FOCUS,
  "rounded-xs",
].join(" ");

/**
 * A nav item. Active is weight plus a full-width rule drawn with a pseudo element, which is
 * why it spans the label exactly and has square ends. The old version put a 2px bottom
 * border on a 4px-radius box and pulled it into the header rule with `-mb-px`.
 */
export const NAV_LINK = [
  "relative inline-block py-2 text-sm transition-colors",
  "after:pointer-events-none after:absolute after:inset-x-0 after:-bottom-[7px] after:h-[2px] after:content-['']",
  FOCUS,
  "rounded-xs",
].join(" ");

export const NAV_LINK_ACTIVE = "font-medium text-[var(--color-ink)] after:bg-[var(--color-t1)]";

/**
 * Inactive nav items get a real hover: the ink lifts and the rule appears at low strength,
 * so the affordance is the same shape as the active marker rather than a different idea.
 */
export const NAV_LINK_IDLE = [
  "text-[var(--color-ink-soft)] hover:text-[var(--color-ink)]",
  "after:bg-transparent hover:after:bg-[var(--color-line-strong)]",
].join(" ");

/**
 * A whole list row or table cell that navigates. The ground fills on hover rather than the
 * row lifting, because a row inside a divided list has neighbours a lift would collide with.
 *
 * The focus ring is inset, driven by the `.focus-inset` rule in `globals.css` rather than a
 * utility. Measured on the matrix: an outward 2px ring on the last column reached 1523px
 * against a scroll container ending at 1519, so it was clipped on exactly the cells at the
 * edge. The negative-offset utility did not resolve on the installed Tailwind, and a plain
 * rule is both shorter and verifiable.
 */
export const ROW_LINK = [
  "cursor-pointer transition-colors",
  "hover:bg-[var(--color-inset)] active:bg-[var(--color-line)]",
  "focus-inset",
].join(" ");
