"use client";

import type { FC } from "react";
import { useState } from "react";
import Pane from "@/components/pane";
import TxnSelect from "@/components/txn-select";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ApiError, parseSql } from "@/lib/api";
import type { Operation } from "@/lib/types";
import { cn } from "@/lib/utils";

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
        {/*
          The hint sits under the textarea it describes, not beside the button. Next to the
          button it wrapped to two ragged lines in a 286px rail and read as part of the
          control rather than as a note about the field above it.

          One line carries either the error or the hint, so a failed parse does not move the
          button. Both are the same size in the same place; only the ink says which it is.
        */}
        <p
          className={cn(
            "min-h-8 text-xs",
            error ? "text-[var(--color-danger)]" : "text-[var(--color-ink-faint)]",
          )}
          role={error ? "alert" : undefined}
        >
          {error ?? (
            <>
              One table, <span className="font-mono">test</span>, with{" "}
              <span className="font-mono">id</span> and <span className="font-mono">value</span>.
            </>
          )}
        </p>
        {/* "Replace schedule" destroys what the reader built, so it is the loud control
            here and the only filled button on this surface */}
        <Button
          size="sm"
          onClick={submit}
          disabled={pending || sql.trim().length === 0}
          className="self-start"
        >
          {pending ? "Parsing…" : "Replace schedule"}
        </Button>
      </div>
    </Pane>
  );
};

export default SqlInput;
