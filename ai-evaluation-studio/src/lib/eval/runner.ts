import {
  getEvalRun,
  updateEvalRunStatus,
  bulkUpsertResults,
  upsertResult,
  listResultsByRun,
  touchEvalRun,
} from "@/lib/db/evaluations";
import { listTestCases } from "@/lib/db/test-suites";
import { findModelDef, getModelConfig } from "@/lib/db/models";
import { getDB } from "@/lib/db";
import {
  buildJudgeSystemPrompt,
  buildJudgeUserPrompt,
  parseJudgeOutput,
} from "./judge";
import { retrieveContext, getKnowledgeBase } from "@/lib/db/knowledge";
import { getEmbedConfig } from "@/lib/db/embed-config";
import type {
  EvalResult,
  ModelConfig,
  ModelDefinition,
  PromptVersion,
  TestCase,
} from "@/lib/types";

const CONCURRENCY = 4;

// 同标签页用内存标志快速取消；跨标签页取消通过持久化 run.status 感知。
const cancelFlags = new Set<string>();
const activeRuns = new Set<string>();

export function requestCancelEvaluation(evalRunId: string): void {
  cancelFlags.add(evalRunId);
}

export function isCancelled(evalRunId: string): boolean {
  return cancelFlags.has(evalRunId);
}

async function shouldStop(evalRunId: string): Promise<boolean> {
  if (cancelFlags.has(evalRunId)) return true;
  const run = await getEvalRun(evalRunId);
  return !run || run.status !== "running";
}

function resultId(job: Job, evalRunId: string): string {
  return `${evalRunId}:${job.testCase.id}:${job.promptVersion.id}:${job.modelDef.id}`;
}

// 重试一次评估中所有失败的 case：
// 1) 把 DB 里所有带 error 的 result 删掉
// 2) 把 run 状态置回 running
// 3) 重新调 startEvaluation —— 它会跳过已成功的 case，只跑剩下的
export async function retryFailedInEvaluation(
  evalRunId: string
): Promise<{ retried: number }> {
  cancelFlags.delete(evalRunId);
  const all = await listResultsByRun(evalRunId);
  const failed = all.filter((r) => !!r.error);
  if (failed.length === 0) {
    return { retried: 0 };
  }
  await getDB().evalResults.bulkDelete(failed.map((r) => r.id));
  await updateEvalRunStatus(evalRunId, "running");
  // fire-and-forget；调用方通常会跳到详情页轮询
  void startEvaluation(evalRunId);
  return { retried: failed.length };
}

interface ModelCall {
  provider: string;
  apiKey: string;
  baseURL?: string;
  modelId: string;
  systemPrompt?: string;
  userPrompt: string;
  maxOutputTokens?: number;
  temperature?: number;
}

interface ModelCallResult {
  ok: true;
  text: string;
  latencyMs: number;
  usage: { input: number; output: number };
}

interface ModelCallError {
  ok: false;
  error: string;
  latencyMs: number;
}

async function callModel(
  args: ModelCall
): Promise<ModelCallResult | ModelCallError> {
  const res = await fetch("/api/generate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(args),
  });
  const data = await res.json();
  if (data.ok) {
    return {
      ok: true,
      text: data.text,
      latencyMs: data.latencyMs,
      usage: data.usage,
    };
  }
  return {
    ok: false,
    error: data.error ?? "未知错误",
    latencyMs: data.latencyMs ?? 0,
  };
}

function renderTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k) =>
    vars[k] !== undefined ? vars[k] : ""
  );
}

interface Job {
  testCase: TestCase;
  promptVersion: PromptVersion;
  modelConfig: ModelConfig;
  modelDef: ModelDefinition;
}

// Parallel pool with bounded concurrency
async function runPool<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, idx: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      results[i] = await fn(items[i], i);
    }
  }
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () =>
    worker()
  );
  await Promise.all(workers);
  return results;
}

export async function startEvaluation(evalRunId: string): Promise<void> {
  if (activeRuns.has(evalRunId)) return;
  activeRuns.add(evalRunId);
  try {
    if (typeof navigator !== "undefined" && navigator.locks) {
      await navigator.locks.request(
        `eval-studio-run:${evalRunId}`,
        { ifAvailable: true },
        async (lock) => {
          if (lock) await runEvaluation(evalRunId);
        }
      );
      return;
    }
    await runEvaluation(evalRunId);
  } finally {
    activeRuns.delete(evalRunId);
  }
}

async function runEvaluation(evalRunId: string): Promise<void> {
  try {
    const run = await getEvalRun(evalRunId);
    if (!run) throw new Error("评估不存在");
    if (run.status !== "running") return;
    await touchEvalRun(evalRunId);

    const cases = run.snapshots?.testCases ?? await listTestCases(run.testSuiteId);
    if (cases.length === 0) throw new Error("测试集没有用例");

    // 加载所有 prompt versions
    const versions: PromptVersion[] = run.snapshots?.promptVersions ?? [];
    if (versions.length === 0) {
      for (const vid of run.promptVersionIds) {
        const v = await getDB().promptVersions.get(vid);
        if (!v) throw new Error(`Prompt 版本不存在: ${vid}`);
        versions.push(v);
      }
    }

    // 加载所有模型
    const modelEntries: Array<{
      config: ModelConfig;
      def: ModelDefinition;
    }> = run.snapshots?.models ?? [];
    if (modelEntries.length === 0) {
      for (const mid of run.modelDefIds) {
        const e = await findModelDef(mid);
        if (!e) throw new Error(`模型不存在: ${mid}`);
        modelEntries.push(e);
      }
    }

    // judge model
    const judgeEntry =
      run.snapshots?.judgeModel ?? await findModelDef(run.judgeModelDefId);
    if (!judgeEntry) throw new Error("Judge 模型未找到");

    // 已存在的成功结果（用于重试时跳过）
    const existing = await listResultsByRun(evalRunId);
    const failedIds = existing.filter((result) => !!result.error).map((result) => result.id);
    if (failedIds.length > 0) {
      await getDB().evalResults.bulkDelete(failedIds);
    }
    const successKeys = new Set(
      existing
        .filter((r) => !r.error)
        .map((r) => `${r.testCaseId}::${r.promptVersionId}::${r.modelDefId}`)
    );

    // 组装所有 jobs：每个 (case × version × model)，跳过已成功
    const jobs: Job[] = [];
    for (const tc of cases) {
      for (const v of versions) {
        for (const m of modelEntries) {
          const key = `${tc.id}::${v.id}::${m.def.id}`;
          if (successKeys.has(key)) continue;
          jobs.push({
            testCase: tc,
            promptVersion: v,
            modelConfig: m.config,
            modelDef: m.def,
          });
        }
      }
    }

    // 没有需要执行的 job（理论上不会发生，但保护一下）
    if (jobs.length === 0) {
      const allResults = await listResultsByRun(evalRunId);
      const allFailed =
        allResults.length > 0 && allResults.every((r) => !!r.error);
      await updateEvalRunStatus(evalRunId, allFailed ? "failed" : "completed");
      return;
    }

    // 阶段 1：生成
    // 如果配置了知识库，预加载 KB 和 modelConfig 信息
    let kbInfo: {
      id: string;
      provider: ModelConfig["provider"];
      apiKey: string;
      baseURL?: string;
      embeddingModel: string;
      topK: number;
    } | null = null;
    if (run.knowledgeBaseId) {
      const kb = await getKnowledgeBase(run.knowledgeBaseId);
      if (kb) {
        const embedCfg = await getEmbedConfig();
        const mc = await getModelConfig(kb.embeddingProvider);
        if (embedCfg?.apiKey || mc?.apiKey) {
          kbInfo = {
            id: kb.id,
            provider: kb.embeddingProvider,
            apiKey: embedCfg?.apiKey || mc!.apiKey,
            baseURL:
              embedCfg?.baseURL !== undefined ? embedCfg.baseURL : mc?.baseURL,
            embeddingModel: kb.embeddingModel,
            topK: run.topK ?? 3,
          };
        }
      }
    }

    const generationOutputs = await runPool(jobs, CONCURRENCY, async (job) => {
      if (await shouldStop(evalRunId)) {
        return {
          job,
          r: { ok: false as const, error: "已取消", latencyMs: 0 },
          userPrompt: "",
        };
      }

      // 多轮对话：把历史 turns 拼成文本前缀，最后一条 user 作为 {{input}}
      let conversationPrefix = "";
      let inputText = job.testCase.input;
      if (job.testCase.turns && job.testCase.turns.length > 0) {
        const parts: string[] = [];
        for (const turn of job.testCase.turns) {
          if (turn.role === "user") {
            inputText = turn.content;
            parts.push(`User: ${turn.content}`);
          } else {
            parts.push(`Assistant: ${turn.content}`);
          }
        }
        conversationPrefix = parts.join("\n") + "\n";
      }

      // 构建模板变量
      const vars: Record<string, string> = { input: inputText };
      let retrievedChunks: Array<{ content: string; score: number }> | undefined;
      let kbError: string | undefined;

      // 知识库检索
      if (kbInfo) {
        try {
          const chunks = await retrieveContext(
            kbInfo.id,
            inputText,
            kbInfo.provider,
            kbInfo.apiKey,
            kbInfo.baseURL,
            kbInfo.embeddingModel,
            kbInfo.topK
          );
          if (chunks.length > 0) {
            vars["context"] = chunks.map((c) => c.content).join("\n\n---\n\n");
            retrievedChunks = chunks;
          } else {
            vars["context"] = "";
            kbError = "未检索到相关知识片段";
          }
        } catch (e) {
          console.warn("[KB retrieval failed]", e);
          vars["context"] = "";
          kbError = `检索失败: ${e instanceof Error ? e.message : String(e)}`;
        }
      }

      const userPrompt =
        conversationPrefix +
        renderTemplate(job.promptVersion.userPromptTemplate, vars);
      const r = await callModel({
        provider: job.modelConfig.provider,
        apiKey: job.modelConfig.apiKey,
        baseURL: job.modelConfig.baseURL,
        modelId: job.modelDef.modelId,
        systemPrompt: job.promptVersion.systemPrompt,
        userPrompt,
      });
      await touchEvalRun(evalRunId);
      return { job, r, userPrompt, context: vars["context"], retrievedChunks, kbError };
    });

    if (await shouldStop(evalRunId)) {
      cancelFlags.delete(evalRunId);
      return;
    }

    // 阶段 2：Judge —— 仅对生成成功的 case 做评分
    const judgeSystemPrompt = buildJudgeSystemPrompt(run.rubric);
    const partialResults: EvalResult[] = [];

    await runPool(generationOutputs, CONCURRENCY, async (item) => {
      const { job, r, userPrompt, context, retrievedChunks, kbError } = item;

      if (await shouldStop(evalRunId)) {
        return;
      }

      if (!r.ok) {
        const failed: EvalResult = {
          id: resultId(job, evalRunId),
          evalRunId,
          testCaseId: job.testCase.id,
          promptVersionId: job.promptVersion.id,
          modelDefId: job.modelDef.id,
          actualOutput: "",
          tokenUsage: { input: 0, output: 0 },
          latency: r.latencyMs,
          scores: {},
          judgeReasoning: "",
          error: r.error,
        };
        partialResults.push(failed);
        await upsertResult(failed);
        await touchEvalRun(evalRunId);
        return;
      }

      const judgeUser = buildJudgeUserPrompt({
        rubric: run.rubric,
        testInput: job.testCase.input,
        testedSystemPrompt: job.promptVersion.systemPrompt,
        testedUserPrompt: userPrompt,
        expected: job.testCase.expected,
        actualOutput: r.text,
        context,
      });

      const j = await callModel({
        provider: judgeEntry.config.provider,
        apiKey: judgeEntry.config.apiKey,
        baseURL: judgeEntry.config.baseURL,
        modelId: judgeEntry.def.modelId,
        systemPrompt: judgeSystemPrompt,
        userPrompt: judgeUser,
        temperature: 0.0,
        maxOutputTokens: 800,
      });

      let scores: Record<string, number> = {};
      let reasoning = "";
      let judgeError: string | null = null;

      if (j.ok) {
        try {
          const parsed = parseJudgeOutput(j.text, run.rubric);
          scores = parsed.scores;
          reasoning = parsed.reasoning;
        } catch (e) {
          judgeError = e instanceof Error ? e.message : String(e);
        }
      } else {
        judgeError = j.error;
      }

      const result: EvalResult = {
        id: resultId(job, evalRunId),
        evalRunId,
        testCaseId: job.testCase.id,
        promptVersionId: job.promptVersion.id,
        modelDefId: job.modelDef.id,
        actualOutput: r.text,
        tokenUsage: r.usage,
        latency: r.latencyMs,
        scores,
        judgeReasoning: reasoning,
        error: judgeError || kbError || null,
        retrievedChunks: retrievedChunks && retrievedChunks.length > 0 ? retrievedChunks : undefined,
      };
      partialResults.push(result);
      await upsertResult(result);
      await touchEvalRun(evalRunId);
    });

    await bulkUpsertResults(partialResults);
    if (await shouldStop(evalRunId)) {
      cancelFlags.delete(evalRunId);
      return;
    }
    // 重新读全量结果（包括之前成功跳过的）来决定最终状态：
    // 只要还有 result 全是 error，就算失败；其余视为完成
    const finalResults = await listResultsByRun(evalRunId);
    const allFailed =
      finalResults.length > 0 && finalResults.every((r) => !!r.error);
    await updateEvalRunStatus(evalRunId, allFailed ? "failed" : "completed");
  } catch (e) {
    console.error("[evaluation runner] failed:", e);
    try {
      await updateEvalRunStatus(evalRunId, "failed");
    } catch {
      // ignore
    }
  }
}
