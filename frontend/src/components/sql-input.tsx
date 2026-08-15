"use client";

import type { FC } from "react";
import { useState } from "react";
import FigureCard from "@/components/figure-card";
import TxnBadge from "@/components/txn-badge";
import { ApiError, parseSql } from "@/lib/api";
import type { Operation } from "@/lib/types";

interface SqlInputProps {
  onParsed: (operations: Operation[]) => void;
}

const PLACEHOLDER = `BEGIN;
SELECT * FROM test WHERE id = 1;
UPDATE test SET value = 11 WHERE id = 1;
COMMIT;`;

/**
 * SQL for one transaction at a time, parsed by the engine.
 *
 * Each transaction is entered separately because the schedule is an interleaving: two
 * SQL scripts do not say which statement runs first, and that ordering is the thing the
 * reader is here to control.
 */
const SqlInput: FC<SqlInputProps> = ({ onParsed }) => {
  const [txn, setTxn] = useState(1);
  const [sql, setSql] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const submit = async () => {
    if (sql.trim().length === 0) return;
    setPending(true);
    setError(null);
    try {
      const { operations } = await parseSql(txn, sql);
      onParsed(operations);
      setSql("");
    } catch (err: unknown) {
      setError(err instanceof ApiError ? err.message : "Could not parse that SQL.");
    } finally {
      setPending(false);
    }
  };

  return (
    <FigureCard
      title="From SQL"
      aside={
        <label className="flex items-center gap-1.5 text-[var(--color-ink-soft)] text-xs">
          <TxnBadge txn={txn} />
          <select
            aria-label="Transaction this SQL belongs to"
            value={txn}
            onChange={(event) => setTxn(Number(event.target.value))}
            className="cursor-pointer rounded border border-[var(--color-line)] bg-[var(--color-card)] px-2 py-1 text-[var(--color-ink)] text-xs transition-colors hover:bg-[var(--color-inset)]"
          >
            {[1, 2, 3].map((n) => (
              <option key={n} value={n}>
                T{n}
              </option>
            ))}
          </select>
        </label>
      }
    >
      <div className="flex flex-col gap-3">
        <textarea
          value={sql}
          onChange={(event) => setSql(event.target.value)}
          placeholder={PLACEHOLDER}
          rows={5}
          aria-label="SQL for this transaction"
          spellCheck={false}
          className="w-full resize-y rounded border border-[var(--color-line)] bg-[var(--color-card)] p-2 font-mono text-[var(--color-ink)] text-xs placeholder:text-[var(--color-ink-faint)]"
        />
        {error && (
          <p className="text-[var(--color-danger)] text-xs" role="alert">
            {error}
          </p>
        )}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={submit}
            disabled={pending || sql.trim().length === 0}
            className="cursor-pointer rounded border border-[var(--color-line)] px-3 py-1.5 text-[var(--color-ink)] text-xs transition-colors hover:bg-[var(--color-inset)] active:bg-[var(--color-line)] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
          >
            {pending ? "Parsing…" : "Replace schedule"}
          </button>
          <span className="text-[var(--color-ink-faint)] text-xs">
            One table, <span className="font-mono">test</span>, with{" "}
            <span className="font-mono">id</span> and <span className="font-mono">value</span>.
          </span>
        </div>
      </div>
    </FigureCard>
  );
};

export default SqlInput;
