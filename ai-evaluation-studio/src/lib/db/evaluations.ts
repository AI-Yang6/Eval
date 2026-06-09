import { v4 as uuid } from "uuid";
import { getDB } from "./index";
import type {
  EvalRun,
  EvalResult,
  EvalRunStatus,
  RubricDimension,
  TestSuite,
  TestCase,
  PromptVersion,
  ModelConfig,
  ModelDefinition,
  Prompt,
} from "@/lib/types";

const now = () => new Date().toISOString();

// ---- EvalRun ----

export async function listEvalRuns(): Promise<EvalRun[]> {
  const runs = await getDB().evalRuns.toArray();
  return runs.sort((a, b) => (a.createdAt > b.createdAt ? -1 : 1));
}

export async function getEvalRun(id: string): Promise<EvalRun | undefined> {
  return getDB().evalRuns.get(id);
}

export async function createEvalRun(input: {
  name: string;
  testSuiteId: string;
  promptVersionIds: string[];
  modelDefIds: string[];
  rubric: RubricDimension[];
  judgeModelDefId: string;
  knowledgeBaseId?: string;
  topK?: number;
  snapshots?: {
    testSuite: TestSuite;
    testCases: TestCase[];
    prompts?: Prompt[];
    promptVersions: PromptVersion[];
    models: Array<{ config: ModelConfig; def: ModelDefinition }>;
    judgeModel: { config: ModelConfig; def: ModelDefinition };
  };
}): Promise<EvalRun> {
  const ts = now();
  const run: EvalRun = {
    id: uuid(),
    name: input.name,
    status: "running",
    testSuiteId: input.testSuiteId,
    promptVersionIds: input.promptVersionIds,
    modelDefIds: input.modelDefIds,
    rubric: input.rubric,
    judgeModelDefId: input.judgeModelDefId,
    knowledgeBaseId: input.knowledgeBaseId,
    topK: input.topK,
    createdAt: ts,
    completedAt: null,
    lastHeartbeatAt: ts,
    snapshots: input.snapshots,
  };
  await getDB().evalRuns.add(run);
  return run;
}

export async function updateEvalRunStatus(
  id: string,
  status: EvalRunStatus
): Promise<void> {
  const patch: Partial<EvalRun> = { status, lastHeartbeatAt: now() };
  patch.completedAt = status === "running" ? null : now();
  await getDB().evalRuns.update(id, patch);
}

export async function touchEvalRun(id: string): Promise<void> {
  await getDB().evalRuns.update(id, { lastHeartbeatAt: now() });
}

export async function deleteEvalRun(id: string): Promise<void> {
  await getDB().transaction(
    "rw",
    getDB().evalRuns,
    getDB().evalResults,
    async () => {
      await getDB().evalResults.where("evalRunId").equals(id).delete();
      await getDB().evalRuns.delete(id);
    }
  );
}

// ---- EvalResult ----

export async function listResultsByRun(
  evalRunId: string
): Promise<EvalResult[]> {
  return getDB().evalResults.where("evalRunId").equals(evalRunId).toArray();
}

export async function upsertResult(result: EvalResult): Promise<void> {
  await getDB().evalResults.put(result);
}

export async function bulkUpsertResults(results: EvalResult[]): Promise<void> {
  await getDB().evalResults.bulkPut(results);
}

export async function toggleBadCase(
  resultId: string,
  badCase: boolean
): Promise<void> {
  await getDB().evalResults.update(resultId, { badCase });
}

export async function listBadCasesByRun(
  evalRunId: string
): Promise<EvalResult[]> {
  return getDB().evalResults
    .where("evalRunId")
    .equals(evalRunId)
    .filter((r) => !!r.badCase)
    .toArray();
}

export async function upsertHumanScores(
  resultId: string,
  scores: Record<string, number>
): Promise<void> {
  await getDB().evalResults.update(resultId, { humanScores: scores });
}
