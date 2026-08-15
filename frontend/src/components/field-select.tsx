"use client";

import type { FC } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface Option {
  value: string;
  label: string;
  /** Shown under the label in the menu. The engine's real strength, or a hint. */
  hint?: string;
}

interface FieldSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: Option[];
  label: string;
  /** Rendered before the trigger, in the ink-soft ramp. */
  caption?: string;
  className?: string;
}

/**
 * A labelled dropdown for a schedule setting: isolation level, engine, operation kind.
 *
 * The caption sits outside the trigger rather than as a placeholder, because these are
 * always set and a placeholder that never shows is a control that never says what it is.
 */
const FieldSelect: FC<FieldSelectProps> = ({
  value,
  onChange,
  options,
  label,
  caption,
  className,
}) => {
  return (
    <span className="flex items-center gap-1.5">
      {caption && <span className="text-[var(--color-ink-soft)] text-xs">{caption}</span>}
      {/* base ui can emit null when a selection is cleared, which these never are */}
      <Select value={value} onValueChange={(next) => next != null && onChange(next)}>
        <SelectTrigger size="sm" aria-label={label} className={className}>
          {/* the raw value is the wire format, `repeatable_read`. the trigger has to show
              the label the reader picked, so the option list is looked up by value */}
          <SelectValue>
            {(current) => options.find((o) => o.value === current)?.label ?? String(current)}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              <span className="flex flex-col">
                <span>{option.label}</span>
                {option.hint && (
                  <span className="text-[var(--color-ink-faint)] text-xs">{option.hint}</span>
                )}
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </span>
  );
};

export default FieldSelect;
