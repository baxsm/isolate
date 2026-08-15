"use client";

import type { FC } from "react";
import Field from "@/components/field";
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
  /** The accessible name. Also the visible label when `caption` is set. */
  label: string;
  /** Shown above the trigger by `Field`. Omit for a control labelled by its context. */
  caption?: string;
  /** A transaction hue when this field belongs to one. Drawn as a rule, never a chip. */
  accent?: string;
  className?: string;
}

/**
 * A labelled dropdown for a schedule setting: isolation level, engine, operation kind.
 *
 * A dropdown means "pick one of these states". An action that does something is a Button,
 * and the two never share a shape. The caption sits above the trigger rather than beside it
 * so a row of fields aligns on one baseline whatever their labels are.
 */
const FieldSelect: FC<FieldSelectProps> = ({
  value,
  onChange,
  options,
  label,
  caption,
  accent,
  className,
}) => {
  const select = (
    <>
      {/* base ui can emit null when a selection is cleared, which these never are */}
      <Select value={value} onValueChange={(next) => next != null && onChange(next)}>
        <SelectTrigger size="sm" aria-label={label} className={className}>
          {/* the raw value is the wire format, `repeatable_read`. the trigger has to show
              the label the reader picked, so the option list is looked up by value */}
          <SelectValue>
            {(current) => options.find((o) => o.value === current)?.label ?? String(current)}
          </SelectValue>
        </SelectTrigger>
        {/*
          shadcn pins the popup to `w-(--anchor-width)`, the trigger's own width, and hides
          the overflow. The engine trigger is 114px while its longest hint needs 194px, so
          "repeatable read is snapshot isolation" was sliced to "repeatable read is snapsh".
          The hint is the whole point of the menu, so the popup sizes to its content and is
          only capped by the viewport.
        */}
        <SelectContent className="!w-auto min-w-(--anchor-width) max-w-[min(20rem,calc(100vw-2rem))]">
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
    </>
  );

  if (!caption) return select;
  return (
    <Field label={caption} accent={accent}>
      {select}
    </Field>
  );
};

export default FieldSelect;
