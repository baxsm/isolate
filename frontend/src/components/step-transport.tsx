"use client";

import { ChevronFirst, ChevronLast, ChevronLeft, ChevronRight } from "lucide-react";
import type { FC } from "react";
import { useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface StepTransportProps {
  index: number;
  count: number;
  onChange: (index: number) => void;
  /** Arrow keys only drive the figure the reader is actually pointing at. */
  keyboardTarget?: HTMLElement | null;
  className?: string;
}

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
        <Button
          variant="outline"
          size="icon-sm"
          onClick={() => onChange(0)}
          disabled={index === 0}
          aria-label="First step"
        >
          <ChevronFirst aria-hidden />
        </Button>
        <Button
          variant="outline"
          size="icon-sm"
          onClick={() => onChange(clamp(index - 1))}
          disabled={index === 0}
          aria-label="Previous step"
        >
          <ChevronLeft aria-hidden />
        </Button>
        <Button
          variant="outline"
          size="icon-sm"
          onClick={() => onChange(clamp(index + 1))}
          disabled={index >= last}
          aria-label="Next step"
        >
          <ChevronRight aria-hidden />
        </Button>
        <Button
          variant="outline"
          size="icon-sm"
          onClick={() => onChange(last)}
          disabled={index >= last}
          aria-label="Last step"
        >
          <ChevronLast aria-hidden />
        </Button>
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
