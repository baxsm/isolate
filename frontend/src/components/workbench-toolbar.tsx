"use client";

import type { FC } from "react";
import FieldSelect from "@/components/field-select";
import StepTransport from "@/components/step-transport";
import type { EngineProfile, IsolationLevel } from "@/lib/types";
import { txnTextColor } from "@/lib/utils";

interface WorkbenchToolbarProps {
  engine: EngineProfile;
  isolation: Record<number, IsolationLevel>;
  txns: number[];
  index: number;
  count: number;
  onIndexChange: (index: number) => void;
  onIsolationChange?: (txn: number, level: IsolationLevel) => void;
  onEngineChange?: (engine: EngineProfile) => void;
  keyboardTarget?: HTMLElement | null;
}

const LEVELS: { value: IsolationLevel; label: string }[] = [
  { value: "read_uncommitted", label: "read uncommitted" },
  { value: "read_committed", label: "read committed" },
  { value: "repeatable_read", label: "repeatable read" },
  { value: "serializable", label: "serializable" },
];

// the hint is the point of the whole project: the label and the behaviour disagree
const ENGINES: { value: EngineProfile; label: string; hint: string }[] = [
  { value: "postgres", label: "PostgreSQL", hint: "repeatable read is snapshot isolation" },
  { value: "mysql", label: "MySQL", hint: "repeatable read loses updates" },
  { value: "generic", label: "Generic", hint: "the standard, taken literally" },
];

/**
 * Every control that acts on the whole run, in one strip.
 *
 * These used to be spread across three card headers, so a reader looking for "where do I
 * change the level" had to find which panel happened to own it, and each header invented its
 * own labelling. One toolbar means one place to look and one alignment to hold.
 *
 * Settings sit left and the transport sits right, because settings define the run and the
 * transport moves through it. That order does not change when a schedule has three
 * transactions instead of two, so the transport does not move when the data does.
 */
const WorkbenchToolbar: FC<WorkbenchToolbarProps> = ({
  engine,
  isolation,
  txns,
  index,
  count,
  onIndexChange,
  onIsolationChange,
  onEngineChange,
  keyboardTarget,
}) => {
  return (
    <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
      <div className="flex flex-wrap items-end gap-x-4 gap-y-3">
        {onEngineChange && (
          <FieldSelect
            caption="engine"
            label="Engine profile"
            value={engine}
            onChange={(next) => onEngineChange(next as EngineProfile)}
            options={ENGINES}
            className="w-[136px]"
          />
        )}
        {onIsolationChange &&
          txns.map((txn) => (
            <FieldSelect
              key={txn}
              caption={`T${txn} level`}
              accent={txnTextColor(txn)}
              label={`Isolation level for transaction ${txn}`}
              value={isolation[txn] ?? "repeatable_read"}
              onChange={(next) => onIsolationChange(txn, next as IsolationLevel)}
              options={LEVELS}
              className="w-[152px]"
            />
          ))}
      </div>

      <StepTransport
        index={index}
        count={count}
        onChange={onIndexChange}
        keyboardTarget={keyboardTarget}
      />
    </div>
  );
};

export default WorkbenchToolbar;
