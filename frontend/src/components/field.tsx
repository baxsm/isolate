"use client";

import type { FC, ReactNode } from "react";
import { cn } from "@/lib/utils";

interface FieldProps {
  /** What the control sets. Always present, always in the same place. */
  label: string;
  /** A transaction hue when the field belongs to one transaction, else nothing. */
  accent?: string;
  children: ReactNode;
  className?: string;
  /**
   * Marks the field's control as unavailable for assistive tech. It deliberately does not
   * dim the label: `--color-ink-faint` measures 5.04:1 on the card at full strength, so any
   * opacity at all puts a 10px label under AA. Measured with colorjs at 0.5, 0.7, 0.8 and
   * 0.9 and every one failed, and axe flagged `color-contrast: .opacity-50` at both widths.
   * The control's own disabled styling is what carries the state visually.
   */
  disabled?: boolean;
}

/**
 * A labelled control.
 *
 * The screen used to carry four different labelling systems side by side: "engine" as bare
 * text, T1 and T2 as filled chips butted against their dropdowns, "as seen by" as text
 * again, and "key" as text. Two controls doing the same job looked like different kinds of
 * thing, and the chip competed with the value it was labelling.
 *
 * Here a label is always a label. When the field belongs to a transaction, the hue is a rule
 * down its left edge rather than a chip, so the pair reads as one object and the value stays
 * the loudest thing in it.
 */
const Field: FC<FieldProps> = ({ label, accent, children, className, disabled }) => {
  return (
    <div className={cn("flex min-w-0 flex-col gap-1", className)} data-disabled={disabled}>
      <span
        className={cn(
          "flex items-center gap-1.5 font-medium text-[10px] text-[var(--color-ink-faint)] uppercase tracking-wider",
          accent && "pl-2",
        )}
        style={
          accent ? { borderLeft: `2px solid ${accent}`, paddingLeft: 6, marginLeft: -8 } : undefined
        }
      >
        {label}
      </span>
      {children}
    </div>
  );
};

export default Field;
