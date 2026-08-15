import type { Operation } from "@/lib/types";

/**
 * The schedule `/compose` opens with, and the rows it runs against.
 *
 * These live here rather than in the workbench component because the server page runs this
 * same schedule to seed the first paint. Importing them from a `"use client"` module made
 * that a circular import, and the constants arrived `undefined`: the engine answered
 * `body.operations: Field required` and the seed silently fell back to null, which looked
 * exactly like the seed never having been wired up.
 */
export const DEFAULT_OPERATIONS: Operation[] = [
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

export const DEFAULT_INITIAL = { "1": 10, "2": 20 };

export const DEFAULT_ISOLATION = { 1: "repeatable_read", 2: "repeatable_read" } as const;
