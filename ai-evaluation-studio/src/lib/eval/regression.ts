import { getDB } from "@/lib/db";
import { overallScore } from "./judge";
import type { EvalResult, EvalRun } from "@/lib/types";

export interface RegressionItem {
  testCaseId: string;
  testCaseInput: string;
  promptVersionId: string;
  promptVersionNum: number;
  modelDefId: string;
  modelLabel: string;
  oldScore: number;
  newScore: number;
  delta: number;
  fixed: boolean;
}

export interface RegressionResult {
  fixed: RegressionItem[];
  regressed: RegressionItem[];
  total: number;
}

/**
 * 查询当前评估中所有之前被标记为 bad case 的结果，判断是否修复。
 */
export async function checkRegression(run: EvalRun): Promise<RegressionResult> {
  const db = getDB();

  // 当前评估的所有结果
  const currentResults = await db.evalResults
    .where("evalRunId")
    .equals(run.id)
    .filter((r) => !r.error && Object.keys(r.scores).length > 0)
    .toArray();
  if (currentResults.length === 0) return { fixed: [], regressed: [], total: 0 };

  // 之前的已完成评估
  const olderRuns = await db.evalRuns
    .where("createdAt")
    .below(run.createdAt)
    .filter((r) => r.status === "completed")
    .toArray();
  if (olderRuns.length === 0) return { fixed: [], regressed: [], total: 0 };

  const olderRunIds = olderRuns.map((r) => r.id);

  // 查询之前评估中的 bad case（匹配 testCaseId + promptVersionId + modelDefId）
  const olderBadResults: EvalResult[] = [];
  for (const oldRunId of olderRunIds) {
    const bad = await db.evalResults
      .where("evalRunId")
      .equals(oldRunId)
      .filter((r) => !!r.badCase && !r.error && Object.keys(r.scores).length > 0)
      .toArray();
    olderBadResults.push(...bad);
  }

  if (olderBadResults.length === 0) return { fixed: [], regressed: [], total: 0 };

  // 建立 (testCaseId::promptVersionId::modelDefId) → 旧分数 的映射
  const oldScoreMap = new Map<string, number>();
  for (const r of olderBadResults) {
    const key = `${r.testCaseId}::${r.promptVersionId}::${r.modelDefId}`;
    const s = overallScore(r.scores);
    if (!oldScoreMap.has(key) || s < oldScoreMap.get(key)!) {
      // 取最低分（最差表现）
      oldScoreMap.set(key, s);
    }
  }

  if (oldScoreMap.size === 0) return { fixed: [], regressed: [], total: 0 };

  // 加载关联信息（prompt version 编号、模型名称、测试用例输入）
  const versionIds = new Set(currentResults.map((r) => r.promptVersionId));
  const modelDefIds = new Set(currentResults.map((r) => r.modelDefId));
  const testCaseIds = new Set(currentResults.map((r) => r.testCaseId));

  const [versions, testCases] = await Promise.all([
    Promise.all(
      [...versionIds].map((vid) => db.promptVersions.get(vid))
    ),
    Promise.all(
      [...testCaseIds].map((tid) => db.testCases.get(tid))
    ),
  ]);
  const versionNumMap = new Map(versions.filter(Boolean).map((v) => [v!.id, v!.versionNumber]));
  const testCaseInputMap = new Map(testCases.filter(Boolean).map((t) => [t!.id, t!.input]));

  // 模型标签
  const modelLabels = new Map<string, string>();
  for (const mid of modelDefIds) {
    const mc = await db.modelConfigs.toArray();
    for (const c of mc) {
      const def = c.models.find((m) => m.id === mid);
      if (def) {
        modelLabels.set(mid, def.label);
        break;
      }
    }
  }

  const items: RegressionItem[] = [];

  for (const r of currentResults) {
    const key = `${r.testCaseId}::${r.promptVersionId}::${r.modelDefId}`;
    const oldScore = oldScoreMap.get(key);
    if (oldScore === undefined) continue;

    const newScore = overallScore(r.scores);
    const delta = newScore - oldScore;
    items.push({
      testCaseId: r.testCaseId,
      testCaseInput: testCaseInputMap.get(r.testCaseId) ?? "(已删除)",
      promptVersionId: r.promptVersionId,
      promptVersionNum: versionNumMap.get(r.promptVersionId) ?? 0,
      modelDefId: r.modelDefId,
      modelLabel: modelLabels.get(r.modelDefId) ?? "未知",
      oldScore,
      newScore,
      delta,
      fixed: delta >= 0.5,
    });
  }

  return {
    fixed: items.filter((i) => i.fixed),
    regressed: items.filter((i) => !i.fixed),
    total: items.length,
  };
}
