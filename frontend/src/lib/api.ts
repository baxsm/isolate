import type { MatrixRow, Operation, RunRequest, RunResponse, Scenario } from "@/lib/types";

const BASE = process.env.NEXT_PUBLIC_ENGINE_URL ?? "http://127.0.0.1:8000";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(BASE + path, {
      ...init,
      headers: { "content-type": "application/json", ...init?.headers },
    });
  } catch {
    throw new ApiError("Could not reach the engine. Check it is running.", 0);
  }
  if (!response.ok) {
    throw new ApiError(await readError(response), response.status);
  }
  return (await response.json()) as T;
}

async function readError(response: Response): Promise<string> {
  try {
    const body = await response.json();
    const detail = body?.detail;
    if (typeof detail === "string") return detail;
    if (Array.isArray(detail) && detail.length > 0) {
      const first = detail[0];
      const where = Array.isArray(first?.loc) ? first.loc.join(".") : "";
      return where ? `${where}: ${first.msg}` : String(first.msg ?? "Invalid request");
    }
  } catch {
    // fall through to the status text
  }
  return response.statusText || "Request failed";
}

export function runSchedule(request: RunRequest, signal?: AbortSignal): Promise<RunResponse> {
  return call<RunResponse>("/api/run", {
    method: "POST",
    body: JSON.stringify(request),
    signal,
  });
}

export function parseSql(txn: number, sql: string): Promise<{ operations: Operation[] }> {
  return call<{ operations: Operation[] }>("/api/parse", {
    method: "POST",
    body: JSON.stringify({ txn, sql }),
  });
}

export function getScenarios(): Promise<Scenario[]> {
  return call<Scenario[]>("/api/scenarios");
}

export function getMatrix(): Promise<MatrixRow[]> {
  return call<MatrixRow[]>("/api/matrix");
}
