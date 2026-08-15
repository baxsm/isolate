import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/** clsx for conditionals, twMerge so a class passed in beats the component's own. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/** Transaction colour, by number. Wraps at three because the palette holds three. */
export function txnColor(txn: number): string {
  const index = ((txn - 1) % 3) + 1;
  return `var(--color-t${index})`;
}

export function txnTextColor(txn: number): string {
  const index = ((txn - 1) % 3) + 1;
  return `var(--color-t${index}-text)`;
}

/**
 * Ink that passes AA on each fill. Measured, not guessed:
 * iris/white 5.37, jade/white 3.15 (fails), jade/dark 5.20, amber/dark 10.38.
 * Only T1 can carry white text.
 */
export function txnInkColor(txn: number): string {
  return ((txn - 1) % 3) + 1 === 1 ? "#ffffff" : "#1c2024";
}

const SHORT: Record<string, string> = {
  begin: "B",
  read: "R",
  write: "W",
  insert: "I",
  delete: "D",
  predicate_read: "R",
  predicate_write: "W",
  predicate_delete: "D",
  commit: "C",
  abort: "A",
};

/** The single letter for an operation kind. `SHORT` is the one table; nothing re-types it. */
export function opLetter(kind: string): string {
  return SHORT[kind] ?? "?";
}

/** `R1(x)`, `W2(y)`, `C1`. The notation the literature uses. */
export function opToken(kind: string, txn: number, key: string | null): string {
  const letter = SHORT[kind] ?? "?";
  if (kind === "begin" || kind === "commit" || kind === "abort") return `${letter}${txn}`;
  if (kind.startsWith("predicate")) return `${letter}${txn}(P)`;
  return `${letter}${txn}(${key ?? "?"})`;
}

export function describeOp(
  kind: string,
  key: string | null,
  value: number | null,
  predicate: string | null,
): string {
  switch (kind) {
    case "begin":
      return "begin";
    case "commit":
      return "commit";
    case "abort":
      return "abort";
    case "read":
      return `read ${key}`;
    case "write":
      return `write ${key} = ${value}`;
    case "insert":
      return `insert ${key} = ${value}`;
    case "delete":
      return `delete ${key}`;
    case "predicate_read":
      return `scan where ${predicate}`;
    case "predicate_write":
      return `update where ${predicate} set ${value}`;
    case "predicate_delete":
      return `delete where ${predicate}`;
    default:
      return kind;
  }
}
