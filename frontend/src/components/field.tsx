"use client";

import type { FC, ReactNode } from "react";
import { cn } from "@/lib/utils";

interface FieldProps {
  label: string;
  /** A transaction's text hue, from `txnTextColor`. Never the step 9 fill: amber-9 on the
   * card is 1.4:1. */
  accent?: string;
  children: ReactNode;
  className?: string;
  /** The label never dims with it. `--color-ink-faint` is 5.04:1 at full strength, so any
   * opacity puts a 10px label under AA. The control carries the state instead. */
  disabled?: boolean;
}

/** A labelled control. A transaction hue is carried by the label's ink, never a chip or a
 * border, because `ui.md` gives a border to a figure card and nothing else. */
const Field: FC<FieldProps> = ({ label, accent, children, className, disabled }) => {
  return (
    <div className={cn("flex min-w-0 flex-col gap-2", className)} data-disabled={disabled}>
      <span
        className="flex items-center gap-2 font-medium text-[10px] uppercase tracking-wider"
        style={{ color: accent ?? "var(--color-ink-faint)" }}
      >
        {label}
      </span>
      {children}
    </div>
  );
};

export default Field;
