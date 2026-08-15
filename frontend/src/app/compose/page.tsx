"use client";

import { useCallback, useState } from "react";
import Workbench from "@/components/workbench";
import type { EngineProfile, IsolationLevel, Operation } from "@/lib/types";

const WRITE_SKEW: Operation[] = [
  { txn: 1, kind: "begin", key: null, value: null, predicate: null },
  { txn: 2, kind: "begin", key: null, value: null, predicate: null },
  { txn: 1, kind: "read", key: "1", value: null, predicate: null },
  { txn: 1, kind: "read", key: "2", value: null, predicate: null },
  { txn: 2, kind: "read", key: "1", value: null, predicate: null },
  { txn: 2, kind: "read", key: "2", value: null, predicate: null },
  { txn: 1, kind: "write", key: "1", value: 11, predicate: null },
  { txn: 2, kind: "write", key: "2", value: 21, predicate: null },
  { txn: 1, kind: "commit", key: null, value: null, predicate: null },
  { txn: 2, kind: "commit", key: null, value: null, predicate: null },
];

export default function ComposePage() {
  const [engine, setEngine] = useState<EngineProfile>("postgres");
  const [isolation, setIsolation] = useState<Record<number, IsolationLevel>>({
    1: "repeatable_read",
    2: "repeatable_read",
  });

  const setLevel = useCallback((txn: number, level: IsolationLevel) => {
    setIsolation((current) => ({ ...current, [txn]: level }));
  }, []);

  return (
    <div className="mx-auto max-w-[1200px] px-6 py-8">
      <h1 className="mb-6 font-medium text-xl tracking-tight">Write skew</h1>
      <Workbench
        operations={WRITE_SKEW}
        isolation={isolation}
        engine={engine}
        onIsolationChange={setLevel}
        onEngineChange={setEngine}
      />
    </div>
  );
}
