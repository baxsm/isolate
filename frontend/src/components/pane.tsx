import type { FC, ReactNode } from "react";
import { cn } from "@/lib/utils";

interface PaneProps {
  title: string;
  /** Sits opposite the title. A status or a single control, never a second panel. */
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
  /** Holds the aside's line when there is nothing in it, so the pane does not change height
   * as a status appears. */
  reserveAside?: boolean;
}

/**
 * A region of the workbench, separated by a heading and space rather than a border. This is
 * what `FigureCard` is not: a card inside a card breaks what a card means, so panes stack
 * inside one bordered surface without nesting boxes.
 */
const Pane: FC<PaneProps> = ({ title, aside, children, className, reserveAside }) => {
  return (
    <section className={cn("flex min-w-0 flex-col", className)}>
      <header className="mb-3 flex min-h-5 items-baseline justify-between gap-3">
        <h2 className="font-medium text-[11px] text-[var(--color-ink-faint)] uppercase tracking-wider">
          {title}
        </h2>
        {aside ?? (reserveAside ? <span aria-hidden /> : null)}
      </header>
      <div className="min-w-0">{children}</div>
    </section>
  );
};

export default Pane;
