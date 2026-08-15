"use client";

import type { FC } from "react";
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
  label: string;
}

/**
 * Picks a transaction. The badge is the value, in both the trigger and the menu.
 *
 * One transaction, one hue, everywhere: the colour that identifies T2 in the timeline is
 * the colour in this menu, so the control is read the same way as the panels.
 */
const TxnSelect: FC<TxnSelectProps> = ({ value, onChange, options = [1, 2, 3], label }) => {
  return (
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
};

export default TxnSelect;
