import type { FC, ReactNode } from "react";
import { cn } from "@/lib/utils";

interface FigureCardProps {
  title?: string;
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
  /** Drops the body padding so a divided list reaches the card's edges. Without it a
   * full-row hover stops 16px short and reads as a floating band. */
  flush?: boolean;
  /** A surface holding its own `Pane` headings instead of one card title. The workbench is
   * this: one border around several panes. */
  bare?: boolean;
  ref?: React.Ref<HTMLElement>;
  tabIndex?: number;
}

/**
 * The only bordered container in the app. One surface level, never nested, so the border and
 * radius classes are written here and nowhere else.
 */
const FigureCard: FC<FigureCardProps> = ({
  title,
  aside,
  children,
  className,
  flush,
  bare,
  ref,
  tabIndex,
}) => {
  if (bare) {
    return (
      <section
        ref={ref}
        tabIndex={tabIndex}
        className={cn(
          "flex min-w-0 flex-col overflow-hidden rounded border border-[var(--color-line)] bg-[var(--color-card)] outline-none",
          className,
        )}
      >
        {children}
      </section>
    );
  }

  return (
    <section
      ref={ref}
      className={cn(
        "min-w-0 rounded border border-[var(--color-line)] bg-[var(--color-card)]",
        className,
      )}
    >
      {(title || aside) && (
        <header className="flex items-center justify-between gap-3 border-[var(--color-line)] border-b px-4 py-2">
          {title && (
            <h2 className="font-medium text-[var(--color-ink)] text-sm tracking-tight">{title}</h2>
          )}
          {aside && <div className="flex items-center gap-3">{aside}</div>}
        </header>
      )}
      <div className={flush ? "overflow-hidden rounded-b" : "p-4"}>{children}</div>
    </section>
  );
};

export default FigureCard;
