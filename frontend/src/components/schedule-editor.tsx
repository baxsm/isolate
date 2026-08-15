"use client";

import { ArrowDown, ArrowUp, Plus, X } from "lucide-react";
import type { FC } from "react";
import { useState } from "react";
import TxnBadge from "@/components/txn-badge";
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

const control =
  "cursor-pointer rounded border border-[var(--color-line)] bg-[var(--color-card)] px-2 py-1 " +
  "text-xs text-[var(--color-ink)] transition-colors hover:bg-[var(--color-inset)]";

const iconButton =
  "cursor-pointer rounded p-1 text-[var(--color-ink-soft)] transition-colors " +
  "hover:bg-[var(--color-inset)] hover:text-[var(--color-ink)] active:bg-[var(--color-line)] " +
  "disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent";

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
            className="flex items-center gap-2 border-[var(--color-line)] border-b py-1 last:border-0"
          >
            <span className="tabular w-6 font-mono text-[var(--color-ink-faint)] text-xs">
              {i + 1}
            </span>
            <TxnBadge txn={op.txn} />
            <span className="tabular flex-1 font-mono text-[var(--color-ink)] text-xs">
              {opToken(op.kind, op.txn, op.key)}
              {op.value !== null && (
                <span className="text-[var(--color-ink-soft)]"> = {op.value}</span>
              )}
            </span>
            <button
              type="button"
              className={iconButton}
              onClick={() => move(i, i - 1)}
              disabled={i === 0}
              aria-label={`Move ${opToken(op.kind, op.txn, op.key)} earlier`}
            >
              <ArrowUp size={14} aria-hidden />
            </button>
            <button
              type="button"
              className={iconButton}
              onClick={() => move(i, i + 1)}
              disabled={i === operations.length - 1}
              aria-label={`Move ${opToken(op.kind, op.txn, op.key)} later`}
            >
              <ArrowDown size={14} aria-hidden />
            </button>
            <button
              type="button"
              className={iconButton}
              onClick={() => remove(i)}
              aria-label={`Remove ${opToken(op.kind, op.txn, op.key)}`}
            >
              <X size={14} aria-hidden />
            </button>
          </li>
        ))}
      </ol>

      <div className="flex flex-wrap items-center gap-3 rounded bg-[var(--color-inset)] p-2">
        <label className="flex items-center gap-1.5 text-[var(--color-ink-soft)] text-xs">
          txn
          <select
            className={control}
            aria-label="Transaction for the new operation"
            value={txn}
            onChange={(event) => setTxn(Number(event.target.value))}
          >
            {[1, 2, 3].map((n) => (
              <option key={n} value={n}>
                T{n}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-1.5 text-[var(--color-ink-soft)] text-xs">
          op
          <select
            className={control}
            aria-label="Kind of the new operation"
            value={kind}
            onChange={(event) => setKind(event.target.value as OpKind)}
          >
            {KINDS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        {spec?.needsKey && (
          <label className="flex items-center gap-1.5 text-[var(--color-ink-soft)] text-xs">
            key
            <input
              className={`${control} w-14 cursor-text`}
              aria-label="Key for the new operation"
              value={key}
              onChange={(event) => setKey(event.target.value)}
            />
          </label>
        )}
        {spec?.needsValue && (
          <label className="flex items-center gap-1.5 text-[var(--color-ink-soft)] text-xs">
            value
            <input
              className={`${control} w-16 cursor-text`}
              aria-label="Value for the new operation"
              inputMode="numeric"
              value={value}
              onChange={(event) => setValue(event.target.value)}
            />
          </label>
        )}
        <button
          type="button"
          onClick={add}
          className="flex cursor-pointer items-center gap-1 rounded border border-[var(--color-line)] bg-[var(--color-card)] px-2 py-1 text-[var(--color-ink)] text-xs transition-colors hover:bg-[var(--color-inset)] active:bg-[var(--color-line)]"
        >
          <Plus size={13} aria-hidden />
          Add
        </button>
      </div>
    </div>
  );
};

export default ScheduleEditor;
