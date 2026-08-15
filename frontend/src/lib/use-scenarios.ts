"use client";

import { useCallback, useEffect, useState } from "react";
import { ApiError, getScenarios } from "@/lib/api";
import type { Scenario } from "@/lib/types";

interface UseScenariosResult {
  scenarios: Scenario[] | null;
  error: string | null;
  retry: () => void;
}

/** Loads the built-in schedule library. Shared by /scenarios and /compose. */
export function useScenarios(): UseScenariosResult {
  const [scenarios, setScenarios] = useState<Scenario[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  // biome-ignore lint/correctness/useExhaustiveDependencies: attempt is the retry trigger, it re-runs the effect without the request changing
  useEffect(() => {
    let live = true;
    setError(null);
    getScenarios()
      .then((data) => {
        if (live) setScenarios(data);
      })
      .catch((err: unknown) => {
        if (!live) return;
        setError(err instanceof ApiError ? err.message : "Could not load the scenarios.");
      });
    return () => {
      live = false;
    };
  }, [attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  return { scenarios, error, retry };
}
