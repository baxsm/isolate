"use client";

import { ChevronFirst, ChevronLast, ChevronLeft, ChevronRight } from "lucide-react";
import type { FC } from "react";
import { useCallback, useEffect } from "react";
import { cn } from "@/lib/utils";

interface StepTransportProps {
  index: number;
  count: number;
  onChange: (index: number) => void;
  /** Arrow keys only drive the figure the reader is actually pointing at. */
  keyboardTarget?: HTMLElement | null;
  className?: string;
}

const button =
  "inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded border " +
  "border-[var(--color-line)] bg-[var(--color-card)] text-[var(--color-ink-soft)] " +
  "transition-colors hover:bg-[var(--color-inset)] hover:text-[var(--color-ink)] " +
  "active:bg-[var(--color-line)] disabled:cursor-not-allowed disabled:opacity-40 " +
  "disabled:hover:bg-[var(--color-card)]";

const StepTransport: FC<StepTransportProps> = ({
  index,
  count,
  onChange,
  keyboardTarget,
  className,
}) => {
  const last = Math.max(0, count - 1);
  const clamp = useCallback((next: number) => Math.min(last, Math.max(0, next)), [last]);

  useEffect(() => {
    if (!keyboardTarget) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        onChange(clamp(index - 1));
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        onChange(clamp(index + 1));
      } else if (event.key === "Home") {
        event.preventDefault();
        onChange(0);
      } else if (event.key === "End") {
        event.preventDefault();
        onChange(last);
      }
    };
    keyboardTarget.addEventListener("keydown", onKey);
    return () => keyboardTarget.removeEventListener("keydown", onKey);
  }, [keyboardTarget, index, last, clamp, onChange]);

  return (
    <div className={cn("flex flex-wrap items-center gap-x-3 gap-y-2", className)}>
      <div className="flex items-center gap-2">
        <button
          type="button"
          className={button}
          onClick={() => onChange(0)}
          disabled={index === 0}
          aria-label="First step"
        >
          <ChevronFirst size={16} aria-hidden />
        </button>
        <button
          type="button"
          className={button}
          onClick={() => onChange(clamp(index - 1))}
          disabled={index === 0}
          aria-label="Previous step"
        >
          <ChevronLeft size={16} aria-hidden />
        </button>
        <button
          type="button"
          className={button}
          onClick={() => onChange(clamp(index + 1))}
          disabled={index >= last}
          aria-label="Next step"
        >
          <ChevronRight size={16} aria-hidden />
        </button>
        <button
          type="button"
          className={button}
          onClick={() => onChange(last)}
          disabled={index >= last}
          aria-label="Last step"
        >
          <ChevronLast size={16} aria-hidden />
        </button>
      </div>

      <input
        type="range"
        min={0}
        max={last}
        value={index}
        onChange={(event) => onChange(Number(event.target.value))}
        aria-label="Step"
        className="h-1 min-w-24 flex-1 cursor-pointer accent-[var(--color-t1)]"
      />

      <span className="tabular shrink-0 text-[var(--color-ink-soft)] text-xs">
        {count === 0 ? "0 / 0" : `${index + 1} / ${count}`}
      </span>
    </div>
  );
};

export default StepTransport;
