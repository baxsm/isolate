"use client";

import { ArrowDown, ArrowUp, Plus, X } from "lucide-react";
import type { FC } from "react";
import { useState } from "react";
import Field from "@/components/field";
import FieldSelect from "@/components/field-select";
import TxnBadge from "@/components/txn-badge";
import TxnSelect from "@/components/txn-select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Operation, OpKind } from "@/lib/types";
import { opToken } from "@/lib/utils";

interface ScheduleEditorProps {
  operations: Operation[];
  onChange: (operations: Operation[]) => void;
}

const KINDS: { value: OpKind; label: string; needsKey: boolean; needsValue: boolean }[] = [
  { value: "begin", label: "begin", needsKey: false, needsValue: false },
  { value: "read", label: "read", needsKey: true, needsValue: false },
  { value: "write", label: "write", needsKey: true, needsValue: true },
  { value: "insert", label: "insert", needsKey: true, needsValue: true },
  { value: "delete", label: "delete", needsKey: true, needsValue: false },
  { value: "commit", label: "commit", needsKey: false, needsValue: false },
  { value: "abort", label: "abort", needsKey: false, needsValue: false },
];

/**
 * Reorder, add and remove operations. Moving a write past a commit is the whole point of
 * the page: the cycle appears or vanishes and the three panels follow.
 */
const ScheduleEditor: FC<ScheduleEditorProps> = ({ operations, onChange }) => {
  const [txn, setTxn] = useState(1);
  const [kind, setKind] = useState<OpKind>("read");
  const [key, setKey] = useState("1");
  const [value, setValue] = useState("1");

  const move = (from: number, to: number) => {
    if (to < 0 || to >= operations.length) return;
    const next = [...operations];
    const [moved] = next.splice(from, 1);
    if (moved) next.splice(to, 0, moved);
    onChange(next);
  };

  const remove = (at: number) => onChange(operations.filter((_, i) => i !== at));

  const spec = KINDS.find((k) => k.value === kind);

  const add = () => {
    onChange([
      ...operations,
      {
        txn,
        kind,
        key: spec?.needsKey ? key : null,
        value: spec?.needsValue ? Number(value) : null,
        predicate: null,
      },
    ]);
  };

  return (
    <div className="flex flex-col gap-3">
      <ol className="flex flex-col">
        {operations.map((op, i) => (
          <li
            // biome-ignore lint/suspicious/noArrayIndexKey: position is the identity. the same operation can appear twice in one schedule, so nothing else about it is unique
            key={`${i}-${op.txn}-${op.kind}-${op.key}`}
            className="flex items-center gap-2 border-[var(--color-line)] border-b py-2 last:border-0"
          >
            <span className="tabular w-5 shrink-0 font-mono text-[var(--color-ink-faint)] text-xs">
              {i + 1}
            </span>
            <TxnBadge txn={op.txn} />
            <span className="tabular min-w-0 flex-1 truncate font-mono text-[var(--color-ink)] text-xs">
              {opToken(op.kind, op.txn, op.key)}
              {op.value !== null && (
                <span className="text-[var(--color-ink-soft)]"> = {op.value}</span>
              )}
            </span>
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={() => move(i, i - 1)}
              disabled={i === 0}
              aria-label={`Move ${opToken(op.kind, op.txn, op.key)} earlier`}
            >
              <ArrowUp aria-hidden />
            </Button>
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={() => move(i, i + 1)}
              disabled={i === operations.length - 1}
              aria-label={`Move ${opToken(op.kind, op.txn, op.key)} later`}
            >
              <ArrowDown aria-hidden />
            </Button>
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={() => remove(i)}
              aria-label={`Remove ${opToken(op.kind, op.txn, op.key)}`}
            >
              <X aria-hidden />
            </Button>
          </li>
        ))}
      </ol>

      {/*
        The new-operation row. It was a tinted box holding boxed controls with three
        different label styles; now every control is a `Field` on one baseline and the row
        sits on the pane directly.

        Key and value keep their slots when the kind does not use them, disabled rather than
        removed: switching read to commit used to delete two fields and pull `Add` left under
        the pointer. It is a fixed grid rather than a wrapping row for the same reason -
        measured at the 320px rail, 384px of controls wrapped onto three lines.
      */}
      <div className="mt-3 grid grid-cols-[auto_1fr] items-end gap-2">
        <TxnSelect
          value={txn}
          onChange={setTxn}
          label="Transaction for the new operation"
          caption="txn"
        />
        <FieldSelect
          caption="operation"
          label="Kind of the new operation"
          value={kind}
          onChange={(next) => setKind(next as OpKind)}
          options={KINDS}
        />
        <div className="col-span-2 flex items-end gap-2">
          <Field label="key" className="flex-1" disabled={!spec?.needsKey}>
            <Input
              className="tabular h-7 w-full font-mono text-xs"
              aria-label="Key for the new operation"
              value={key}
              onChange={(event) => setKey(event.target.value)}
              disabled={!spec?.needsKey}
            />
          </Field>
          <Field label="value" className="flex-1" disabled={!spec?.needsValue}>
            <Input
              className="tabular h-7 w-full font-mono text-xs"
              aria-label="Value for the new operation"
              inputMode="numeric"
              value={value}
              onChange={(event) => setValue(event.target.value)}
              disabled={!spec?.needsValue}
            />
          </Field>
          {/* an action, so it is a button and never shares a shape with the pickers beside it */}
          <Button variant="outline" size="sm" onClick={add} className="shrink-0">
            <Plus data-icon="inline-start" aria-hidden />
            Add
          </Button>
        </div>
      </div>
    </div>
  );
};

export default ScheduleEditor;
