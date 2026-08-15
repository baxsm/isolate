"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, runSchedule } from "@/lib/api";
import type { RunRequest, RunResponse, Step } from "@/lib/types";

interface UseRunResult {
  steps: Step[];
  step: Step | null;
  summary: RunResponse["summary"] | null;
  index: number;
  setIndex: (index: number) => void;
  loading: boolean;
  error: string | null;
  retry: () => void;
}

/**
 * Posts a schedule and holds the step list plus the current index.
 *
 * Every panel reads the same `step` object from here. No panel fetches, and no panel keeps
 * its own index, which is what stops the three views disagreeing without needing a test to
 * prove they agree.
 */
export function useRun(request: RunRequest | null, seed?: RunResponse | null): UseRunResult {
  /*
    `seed` is the same schedule already run on the server. Without it the first paint has no
    steps and every panel renders its empty state - "No operations yet", "No transactions
    yet" - which is a loading state wearing an empty state's words, for a schedule whose
    contents are known before the page is built.

    The effect still runs on mount and replaces this, which costs one request and keeps a
    single code path for every later edit. What it buys is that the first thing painted is
    the real schedule.
  */
  const [steps, setSteps] = useState<Step[]>(seed?.steps ?? []);
  const [summary, setSummary] = useState<RunResponse["summary"] | null>(seed?.summary ?? null);
  const [index, setIndexRaw] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  const serialised = request ? JSON.stringify(request) : null;
  // the request is compared by value, so a caller rebuilding the object every render does
  // not refetch on every render
  const latest = useRef(0);

  // biome-ignore lint/correctness/useExhaustiveDependencies: attempt is the retry trigger, it re-runs the effect without the request changing
  useEffect(() => {
    if (!serialised) {
      setSteps([]);
      setSummary(null);
      return;
    }
    const ticket = ++latest.current;
    const controller = new AbortController();
    setLoading(true);
    setError(null);

    runSchedule(JSON.parse(serialised) as RunRequest, controller.signal)
      .then((response) => {
        if (ticket !== latest.current) return;
        setSteps(response.steps);
        setSummary(response.summary);
        setIndexRaw((current) => Math.min(current, Math.max(0, response.steps.length - 1)));
      })
      .catch((err: unknown) => {
        if (ticket !== latest.current) return;
        if (err instanceof DOMException && err.name === "AbortError") return;
        setSteps([]);
        setSummary(null);
        setError(
          err instanceof ApiError ? err.message : "Something went wrong running this schedule.",
        );
      })
      .finally(() => {
        if (ticket === latest.current) setLoading(false);
      });

    return () => controller.abort();
  }, [serialised, attempt]);

  const setIndex = useCallback(
    (next: number) => {
      setIndexRaw(Math.min(Math.max(0, next), Math.max(0, steps.length - 1)));
    },
    [steps.length],
  );

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  return {
    steps,
    step: steps[index] ?? null,
    summary,
    index,
    setIndex,
    loading,
    error,
    retry,
  };
}
