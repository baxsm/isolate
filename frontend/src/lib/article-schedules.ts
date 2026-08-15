import type { Operation } from "@/lib/types";

const op = (
  txn: number,
  kind: Operation["kind"],
  key: string | null = null,
  value: number | null = null,
): Operation => ({ txn, kind, key, value, predicate: null });

/** Two transactions, one row. The smallest schedule that interferes. */
export const FIRST_TOUCH: Operation[] = [
  op(1, "begin"),
  op(2, "begin"),
  op(1, "read", "1"),
  op(2, "write", "1", 99),
  op(2, "commit"),
  op(1, "read", "1"),
  op(1, "commit"),
];

/** G1a. T2 reads a value T1 wrote and then rolled back. */
export const DIRTY_READ: Operation[] = [
  op(1, "begin"),
  op(2, "begin"),
  op(1, "write", "1", 101),
  op(2, "read", "1"),
  op(1, "abort"),
  op(2, "read", "1"),
  op(2, "commit"),
];

/** P4. Both read, both write, one update is lost. */
export const LOST_UPDATE: Operation[] = [
  op(1, "begin"),
  op(2, "begin"),
  op(1, "read", "1"),
  op(2, "read", "1"),
  op(1, "write", "1", 11),
  op(2, "write", "1", 12),
  op(1, "commit"),
  op(2, "commit"),
];

/** G-single. One transaction sees key 1 before and key 2 after another commits. */
export const READ_SKEW: Operation[] = [
  op(1, "begin"),
  op(2, "begin"),
  op(1, "read", "1"),
  op(2, "read", "1"),
  op(2, "read", "2"),
  op(2, "write", "1", 12),
  op(2, "write", "2", 18),
  op(2, "commit"),
  op(1, "read", "2"),
  op(1, "commit"),
];

/** G2-item. Neither reads the other's write, and together they break the invariant. */
export const WRITE_SKEW: Operation[] = [
  op(1, "begin"),
  op(2, "begin"),
  op(1, "read", "1"),
  op(1, "read", "2"),
  op(2, "read", "1"),
  op(2, "read", "2"),
  op(1, "write", "1", 11),
  op(2, "write", "2", 21),
  op(1, "commit"),
  op(2, "commit"),
];
