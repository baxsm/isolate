"use client";

import type { FC } from "react";
import Field from "@/components/field";
import TxnBadge from "@/components/txn-badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface TxnSelectProps {
  value: number;
  onChange: (txn: number) => void;
  options?: number[];
  /** The accessible name. */
  label: string;
  /** Shown above the trigger by `Field`, so this aligns with the controls beside it. */
  caption?: string;
}

/**
 * Picks a transaction. The badge is the value, in both the trigger and the menu.
 *
 * One transaction, one hue, everywhere: the colour that identifies T2 in the timeline is
 * the colour in this menu, so the control is read the same way as the panels.
 */
const TxnSelect: FC<TxnSelectProps> = ({
  value,
  onChange,
  options = [1, 2, 3],
  label,
  caption,
}) => {
  const select = (
    <Select value={String(value)} onValueChange={(next) => next != null && onChange(Number(next))}>
      <SelectTrigger size="sm" aria-label={label}>
        <SelectValue>{(current) => <TxnBadge txn={Number(current)} />}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        {options.map((n) => (
          <SelectItem key={n} value={String(n)}>
            <TxnBadge txn={n} />
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  if (!caption) return select;
  return <Field label={caption}>{select}</Field>;
};

export default TxnSelect;
