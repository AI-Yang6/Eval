"use client";

import { useEffect } from "react";

import { listEvalRuns } from "@/lib/db/evaluations";
import { startEvaluation } from "@/lib/eval/runner";

export function EvaluationRecovery() {
  useEffect(() => {
    let stopped = false;

    async function recover() {
      const runs = await listEvalRuns();
      if (stopped) return;
      for (const run of runs) {
        if (run.status === "running") void startEvaluation(run.id);
      }
    }

    void recover();
    const timer = window.setInterval(() => void recover(), 15_000);
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, []);

  return null;
}
