import type { EngineProfile, IsolationLevel, Operation, OpKind } from "@/lib/types";

export interface SharedSchedule {
  operations: Operation[];
  isolation: Record<number, IsolationLevel>;
  engine: EngineProfile;
}

const KIND_CODES: Record<OpKind, string> = {
  begin: "b",
  read: "r",
  write: "w",
  insert: "i",
  delete: "d",
  predicate_read: "pr",
  predicate_write: "pw",
  predicate_delete: "pd",
  commit: "c",
  abort: "a",
};

const CODE_KINDS = Object.fromEntries(
  Object.entries(KIND_CODES).map(([kind, code]) => [code, kind as OpKind]),
) as Record<string, OpKind>;

const LEVEL_CODES: Record<IsolationLevel, string> = {
  read_uncommitted: "ru",
  read_committed: "rc",
  repeatable_read: "rr",
  serializable: "s",
};

const CODE_LEVELS = Object.fromEntries(
  Object.entries(LEVEL_CODES).map(([level, code]) => [code, level as IsolationLevel]),
) as Record<string, IsolationLevel>;

const ENGINES: EngineProfile[] = ["postgres", "mysql", "generic"];

/**
 * A schedule as a URL fragment, so a composed one can be shared.
 *
 * `1w:x=5` is transaction 1 writing 5 to x. Compact on purpose: a JSON blob through
 * base64 makes an unreadable URL and doubles the length.
 */
export function encodeSchedule({ operations, isolation, engine }: SharedSchedule): string {
  const ops = operations
    .map((op) => {
      const head = `${op.txn}${KIND_CODES[op.kind]}`;
      if (op.key === null) return head;
      return op.value === null ? `${head}:${op.key}` : `${head}:${op.key}=${op.value}`;
    })
    .join(",");
  const levels = Object.entries(isolation)
    .map(([txn, level]) => `${txn}${LEVEL_CODES[level]}`)
    .join(",");
  return `ops=${ops}&iso=${levels}&engine=${engine}`;
}

export function decodeSchedule(params: URLSearchParams): SharedSchedule | null {
  const ops = params.get("ops");
  if (!ops) return null;

  const operations: Operation[] = [];
  for (const token of ops.split(",")) {
    const match = /^(\d+)(pr|pw|pd|[brwidca])(?::([^=]+)(?:=(-?\d+))?)?$/.exec(token);
    if (!match) return null;
    const [, txn, code, key, value] = match;
    const kind = code ? CODE_KINDS[code] : undefined;
    if (!kind || !txn) return null;
    operations.push({
      txn: Number(txn),
      kind,
      key: key ?? null,
      value: value === undefined ? null : Number(value),
      predicate: null,
    });
  }

  const isolation: Record<number, IsolationLevel> = {};
  for (const token of params.get("iso")?.split(",") ?? []) {
    const match = /^(\d+)(ru|rc|rr|s)$/.exec(token);
    if (!match) continue;
    const [, txn, code] = match;
    const level = code ? CODE_LEVELS[code] : undefined;
    if (txn && level) isolation[Number(txn)] = level;
  }
  for (const op of operations) {
    if (isolation[op.txn] === undefined) isolation[op.txn] = "repeatable_read";
  }

  const engineParam = params.get("engine");
  const engine = ENGINES.find((e) => e === engineParam) ?? "postgres";

  return { operations, isolation, engine };
}
