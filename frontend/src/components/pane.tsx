import type { FC, ReactNode } from "react";
import { cn } from "@/lib/utils";

interface PaneProps {
  title: string;
  /** Sits opposite the title. A status or a single control, never a second panel. */
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
  /**
   * Reserves the aside's line even when there is nothing in it, so a pane does not change
   * height when its status appears. Used where the aside is conditional.
   */
  reserveAside?: boolean;
}

/**
 * A region of the workbench, separated by a heading and space rather than a border.
 *
 * `FigureCard` is still the right container for a figure set into prose, where a card reads
 * as paper on a desk. Inside the workbench it was wrong: six bordered cards, each with a
 * bordered header, several holding bordered strips of bordered controls. Nesting a card in a
 * card breaks what a card means, and six equal boxes say nothing about what matters most.
 *
 * A pane has no border and no background. Hierarchy comes from the heading and the space
 * around it, so panes can sit inside one bordered surface without stacking boxes.
 */
const Pane: FC<PaneProps> = ({ title, aside, children, className, reserveAside }) => {
  return (
    <section className={cn("flex min-w-0 flex-col", className)}>
      <header className="mb-3 flex min-h-5 items-baseline justify-between gap-3">
        <h2 className="font-medium text-[11px] text-[var(--color-ink-faint)] uppercase tracking-wider">
          {title}
        </h2>
        {/* the empty span holds the line's height so nothing below it moves when a status
            appears. `reserveAside` is what makes that explicit rather than incidental */}
        {aside ?? (reserveAside ? <span aria-hidden /> : null)}
      </header>
      <div className="min-w-0">{children}</div>
    </section>
  );
};

export default Pane;
