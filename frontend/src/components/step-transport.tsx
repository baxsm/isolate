"use client";

import { ChevronFirst, ChevronLast, ChevronLeft, ChevronRight } from "lucide-react";
import type { FC } from "react";
import { useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { FOCUS } from "@/lib/interaction";
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

      {/*
        The track is 4px but the control is not. A bare `h-1` range measured 577x4, which is
        a 4px-tall drag target, and it was also the widest line on the screen. The wrapper
        gives it a 24px hit area while the track stays thin, and `max-w` stops a secondary
        control from being the longest horizontal rule in the panel.
      */}
      <span className="flex h-6 min-w-24 max-w-64 flex-1 items-center">
        <input
          type="range"
          min={0}
          max={last}
          value={index}
          onChange={(event) => onChange(Number(event.target.value))}
          aria-label="Step"
          className={cn(
            "h-1 w-full cursor-pointer appearance-none rounded-full bg-[var(--color-line)] accent-[var(--color-t1)]",
            "[&::-webkit-slider-thumb]:size-3.5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-[var(--color-t1)]",
            "[&::-webkit-slider-thumb]:transition-transform [&::-webkit-slider-thumb]:hover:scale-115 [&::-webkit-slider-thumb]:active:scale-95",
            "[&::-moz-range-thumb]:size-3.5 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-[var(--color-t1)]",
            FOCUS,
          )}
        />
      </span>

      <span className="tabular shrink-0 text-[var(--color-ink-soft)] text-xs">
        {count === 0 ? "0 / 0" : `${index + 1} / ${count}`}
      </span>
    </div>
  );
};

export default StepTransport;
