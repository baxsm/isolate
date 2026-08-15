"use client";

import type { FC } from "react";
import { useCallback, useState } from "react";
import Workbench from "@/components/workbench";
import type { EngineProfile, IsolationLevel, Operation } from "@/lib/types";

interface ArticleFigureProps {
  operations: Operation[];
  /** Level every transaction starts at. The reader changes it from inside the figure. */
  level?: IsolationLevel;
  engine?: EngineProfile;
  levelControl?: boolean;
  engineControl?: boolean;
  /** Panels this figure needs. Defaults to both; see the note in `workbench.tsx`. */
  panels?: { versions?: boolean; graph?: boolean };
}

const INITIAL = { "1": 10, "2": 20 };

/**
 * One figure, one schedule, one step index.
 *
 * Each figure owns its own state, so two figures on the page never share a step and
 * nothing is bound to scroll position. The reader steps with the buttons or arrow keys.
 */
const ArticleFigure: FC<ArticleFigureProps> = ({
  operations,
  level = "read_committed",
  engine = "postgres",
  levelControl = true,
  engineControl = false,
  panels,
}) => {
  const txns = [...new Set(operations.map((op) => op.txn))];
  const [isolation, setIsolation] = useState<Record<number, IsolationLevel>>(
    Object.fromEntries(txns.map((txn) => [txn, level])),
  );
  const [profile, setProfile] = useState<EngineProfile>(engine);

  // one control sets every transaction. a per transaction selector in a reading figure is
  // more knobs than the sentence beside it is asking about
  const setAll = useCallback((_txn: number, next: IsolationLevel) => {
    setIsolation((current) =>
      Object.fromEntries(Object.keys(current).map((key) => [Number(key), next])),
    );
  }, []);

  return (
    <div className="figure-wide my-6">
      <Workbench
        operations={operations}
        isolation={isolation}
        engine={profile}
        initial={INITIAL}
        onIsolationChange={levelControl ? setAll : undefined}
        onEngineChange={engineControl ? setProfile : undefined}
        panels={panels}
      />
    </div>
  );
};

export default ArticleFigure;
