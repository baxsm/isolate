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
export function useRun(request: RunRequest | null): UseRunResult {
  const [steps, setSteps] = useState<Step[]>([]);
  const [summary, setSummary] = useState<RunResponse["summary"] | null>(null);
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
