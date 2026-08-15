"use client";

import type { FC } from "react";
import { useState } from "react";
import Pane from "@/components/pane";
import TxnSelect from "@/components/txn-select";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
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
    <Pane
      title="From SQL"
      aside={<TxnSelect value={txn} onChange={setTxn} label="Transaction this SQL belongs to" />}
    >
      <div className="flex flex-col gap-3">
        <Textarea
          value={sql}
          onChange={(event) => setSql(event.target.value)}
          placeholder={PLACEHOLDER}
          rows={5}
          aria-label="SQL for this transaction"
          spellCheck={false}
          className="resize-y font-mono text-xs"
        />
        <div className="flex items-center gap-3">
          {/* "Replace schedule" destroys what the reader built, so it is the loud control
              here and the only filled button on the page */}
          <Button size="sm" onClick={submit} disabled={pending || sql.trim().length === 0}>
            {pending ? "Parsing…" : "Replace schedule"}
          </Button>
          {/*
            One line that carries either the error or the hint, so a failed parse does not
            push the button down the page. Both are the same size and sit in the same place;
            only the ink says which one this is.
          */}
          <span
            className={
              error ? "text-[var(--color-danger)] text-xs" : "text-[var(--color-ink-faint)] text-xs"
            }
            role={error ? "alert" : undefined}
          >
            {error ?? (
              <>
                One table, <span className="font-mono">test</span>, with{" "}
                <span className="font-mono">id</span> and <span className="font-mono">value</span>.
              </>
            )}
          </span>
        </div>
      </div>
    </Pane>
  );
};

export default SqlInput;
