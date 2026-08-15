export type IsolationLevel =
  | "read_uncommitted"
  | "read_committed"
  | "repeatable_read"
  | "serializable";

export type EngineProfile = "postgres" | "mysql" | "generic";

export type OpKind =
  | "begin"
  | "read"
  | "write"
  | "insert"
  | "delete"
  | "predicate_read"
  | "predicate_write"
  | "predicate_delete"
  | "commit"
  | "abort";

export type Outcome = "ok" | "blocked" | "aborted" | "error";

export type EdgeKind = "ww" | "wr" | "rw";

export interface Operation {
  txn: number;
  kind: OpKind;
  key: string | null;
  value: number | null;
  predicate: string | null;
}

export interface Version {
  key: string;
  value: number | null;
  xmin: number;
  xmax: number | null;
  created_at_step: number;
  expired_at_step: number | null;
}

export interface TransactionView {
  xid: number;
  state: "active" | "committed" | "aborted" | "blocked";
  isolation: IsolationLevel;
  began_at_step: number;
  ended_at_step: number | null;
  in_conflict: boolean;
  out_conflict: boolean;
  snapshot_xmin: number | null;
  snapshot_xmax: number | null;
  snapshot_xip: number[];
}

export interface Edge {
  frm: number;
  to: number;
  kind: EdgeKind;
  key: string;
  item_level: boolean;
  at_step: number;
}

export interface Step {
  index: number;
  op: Operation;
  outcome: Outcome;
  error: string | null;
  versions: Record<string, Version[]>;
  visible: Record<number, Record<string, number | null>>;
  txns: Record<number, TransactionView>;
  edges: Edge[];
  cycles: Edge[][];
  anomalies: string[];
}

export interface RunSummary {
  anomalies: string[];
  committed: number[];
  aborted: number[];
  final: Record<string, number | null>;
  notes: string[];
}

export interface RunResponse {
  steps: Step[];
  summary: RunSummary;
}

export interface Scenario {
  id: string;
  title: string;
  anomaly: string;
  operations: Operation[];
  source: string;
  note: string;
  initial: Record<string, number>;
}

export interface MatrixCell {
  anomaly: string;
  computed: boolean;
  published: boolean | null;
  agrees: boolean;
  scenario_id: string;
}

export interface MatrixRow {
  engine: string;
  level: string;
  label: string;
  actual: string;
  cells: MatrixCell[];
}

export interface RunRequest {
  engine: EngineProfile;
  isolation: Record<number, IsolationLevel>;
  initial?: { key: string; value: number }[];
  operations: Operation[];
}
