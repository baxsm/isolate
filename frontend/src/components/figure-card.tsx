import type { FC, ReactNode } from "react";
import { cn } from "@/lib/utils";

interface FigureCardProps {
  title?: string;
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
}

/**
 * The only bordered figure container. One surface level, never nested, so the border and
 * radius classes are written here and nowhere else.
 */
const FigureCard: FC<FigureCardProps> = ({ title, aside, children, className }) => {
  return (
    <section
      className={cn("rounded border border-[var(--color-line)] bg-[var(--color-card)]", className)}
    >
      {(title || aside) && (
        <header className="flex items-center justify-between gap-3 border-[var(--color-line)] border-b px-4 py-2">
          {title && (
            <h2 className="font-medium text-[var(--color-ink)] text-sm tracking-tight">{title}</h2>
          )}
          {aside && <div className="flex items-center gap-3">{aside}</div>}
        </header>
      )}
      <div className="p-4">{children}</div>
    </section>
  );
};

export default FigureCard;
