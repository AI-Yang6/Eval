"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  BarChart3,
  Download,
  Trophy,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  RefreshCw,
  ThumbsDown,
  Info,
} from "lucide-react";
import { toast } from "sonner";
import {
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
  Legend,
  Tooltip,
} from "recharts";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { SpotlightCard } from "@/components/ui/spotlight-card";
import {
  Tooltip as InfoTooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import {
  getEvalRun,
  listResultsByRun,
  toggleBadCase,
  upsertHumanScores,
} from "@/lib/db/evaluations";
import { listTestCases, getTestSuite } from "@/lib/db/test-suites";
import { findModelDef } from "@/lib/db/models";
import { getDB } from "@/lib/db";
import { overallScore } from "@/lib/eval/judge";
import { retryFailedInEvaluation } from "@/lib/eval/runner";
import { checkRegression, type RegressionItem } from "@/lib/eval/regression";
import { buildCSV, buildMarkdown, downloadFile } from "@/lib/eval/export";
import { formatDate } from "@/lib/utils/format";
import { cn } from "@/lib/utils";
import type {
  EvalRun,
  EvalResult,
  PromptVersion,
  ModelDefinition,
  TestCase,
  TestSuite,
  RubricDimension,
} from "@/lib/types";

interface Props {
  params: Promise<{ id: string }>;
}

interface ComboMeta {
  key: string;
  label: string;
  promptVersionId: string;
  modelDefId: string;
  promptName: string;
  versionNumber: number;
  modelLabel: string;
  inputPricePer1k: number;
  outputPricePer1k: number;
}

const COMBO_COLORS = [
  "#7c5cfc",
  "#3b82f6",
  "#10b981",
  "#f59e0b",
  "#ef4444",
  "#ec4899",
  "#06b6d4",
  "#8b5cf6",
];

type CaseFilter = "all" | "diff" | "bad" | "human_gap";

export default function ReportPage({ params }: Props) {
  const router = useRouter();
  const [id, setId] = useState<string | null>(null);
  const [run, setRun] = useState<EvalRun | null>(null);
  const [results, setResults] = useState<EvalResult[]>([]);
  const [cases, setCases] = useState<TestCase[]>([]);
  const [suite, setSuite] = useState<TestSuite | null>(null);
  const [combos, setCombos] = useState<ComboMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [hiddenCombos, setHiddenCombos] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<CaseFilter>("all");
  const [expandedCase, setExpandedCase] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);
  const [regressionData, setRegressionData] = useState<{
    fixed: RegressionItem[];
    regressed: RegressionItem[];
    total: number;
  } | null>(null);

  useEffect(() => {
    params.then((p) => setId(p.id));
  }, [params]);

  useEffect(() => {
    if (!id) return;
    (async () => {
      try {
        const r = await getEvalRun(id);
        if (!r) {
          toast.error("评估不存在");
          router.push("/history");
          return;
        }
        const [list, cs, ts] = await Promise.all([
          listResultsByRun(id),
          listTestCases(r.testSuiteId),
          getTestSuite(r.testSuiteId),
        ]);

        const promptIds = new Set(r.promptVersionIds);
        const modelIds = new Set(r.modelDefIds);
        const versionMap = new Map<string, PromptVersion>();
        for (const vid of promptIds) {
          const v = await getDB().promptVersions.get(vid);
          if (v) versionMap.set(vid, v);
        }
        const modelMap = new Map<string, ModelDefinition>();
        for (const mid of modelIds) {
          const m = await findModelDef(mid);
          if (m) modelMap.set(mid, m.def);
        }
        const promptNameMap = new Map<string, string>();
        for (const v of versionMap.values()) {
          if (!promptNameMap.has(v.promptId)) {
            const p = await getDB().prompts.get(v.promptId);
            promptNameMap.set(v.promptId, p?.name ?? "未知");
          }
        }

        const comboList: ComboMeta[] = [];
        for (const vid of r.promptVersionIds) {
          const v = versionMap.get(vid);
          if (!v) continue;
          const pname = promptNameMap.get(v.promptId) ?? "";
          for (const mid of r.modelDefIds) {
            const md = modelMap.get(mid);
            if (!md) continue;
            comboList.push({
              key: `${vid}::${mid}`,
              label: `${pname} V${v.versionNumber} + ${md.label}`,
              promptVersionId: vid,
              modelDefId: mid,
              promptName: pname,
              versionNumber: v.versionNumber,
              modelLabel: md.label,
              inputPricePer1k: md.inputPricePer1k,
              outputPricePer1k: md.outputPricePer1k,
            });
          }
        }

        setRun(r);
        setResults(list);
        setCases(cs);
        setSuite(ts ?? null);
        setCombos(comboList);

        // Bad case 回归检测
        if (r.status === "completed") {
          checkRegression(r).then(setRegressionData).catch(console.warn);
        }
      } catch (e) {
        toast.error(`加载失败：${e instanceof Error ? e.message : String(e)}`);
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const resultMap = useMemo(() => {
    const m = new Map<string, EvalResult>();
    for (const r of results) {
      m.set(`${r.testCaseId}::${r.promptVersionId}::${r.modelDefId}`, r);
    }
    return m;
  }, [results]);

  // 每组合每维度平均
  const comboScores = useMemo(() => {
    if (!run) return new Map<string, { overall: number; perDim: Record<string, number> }>();
    const m = new Map<
      string,
      { overall: number; perDim: Record<string, number> }
    >();
    for (const c of combos) {
      const subset = results.filter(
        (r) =>
          r.promptVersionId === c.promptVersionId &&
          r.modelDefId === c.modelDefId &&
          !r.error &&
          Object.keys(r.scores).length > 0
      );
      if (subset.length === 0) {
        m.set(c.key, {
          overall: 0,
          perDim: Object.fromEntries(run.rubric.map((d) => [d.name, 0])),
        });
        continue;
      }
      const perDim: Record<string, number> = {};
      for (const dim of run.rubric) {
        const sum = subset.reduce((a, r) => a + (r.scores[dim.name] ?? 0), 0);
        perDim[dim.name] = sum / subset.length;
      }
      const overall =
        Object.values(perDim).reduce((a, b) => a + b, 0) / run.rubric.length;
      m.set(c.key, { overall, perDim });
    }
    return m;
  }, [combos, results, run]);

  // 排序
  const rankedCombos = useMemo(() => {
    return [...combos].sort((a, b) => {
      const sa = comboScores.get(a.key)?.overall ?? 0;
      const sb = comboScores.get(b.key)?.overall ?? 0;
      return sb - sa;
    });
  }, [combos, comboScores]);

  const bestOverall = rankedCombos[0]
    ? comboScores.get(rankedCombos[0].key)?.overall ?? 0
    : 0;

  const comboCostStats = useMemo(() => {
    const m = new Map<
      string,
      {
        cost: number;
        inputTokens: number;
        outputTokens: number;
        validCount: number;
        avgCostPerResult: number;
        scorePerDollar: number | null;
      }
    >();
    for (const c of combos) {
      const subset = results.filter(
        (r) =>
          r.promptVersionId === c.promptVersionId &&
          r.modelDefId === c.modelDefId &&
          !r.error
      );
      const inputTokens = subset.reduce((sum, r) => sum + r.tokenUsage.input, 0);
      const outputTokens = subset.reduce((sum, r) => sum + r.tokenUsage.output, 0);
      const cost =
        (inputTokens / 1000) * c.inputPricePer1k +
        (outputTokens / 1000) * c.outputPricePer1k;
      const validCount = subset.length;
      const overall = comboScores.get(c.key)?.overall ?? 0;
      m.set(c.key, {
        cost,
        inputTokens,
        outputTokens,
        validCount,
        avgCostPerResult: validCount > 0 ? cost / validCount : 0,
        scorePerDollar: cost > 0 && overall > 0 ? overall / cost : null,
      });
    }
    return m;
  }, [combos, results, comboScores]);

  const bestValueComboKey = useMemo(() => {
    let bestKey: string | null = null;
    let bestValue = -Infinity;
    for (const c of combos) {
      const value = comboCostStats.get(c.key)?.scorePerDollar;
      if (value !== null && value !== undefined && value > bestValue) {
        bestValue = value;
        bestKey = c.key;
      }
    }
    return bestKey;
  }, [combos, comboCostStats]);

  // 雷达图数据
  const radarData = useMemo(() => {
    if (!run) return [];
    return run.rubric.map((dim) => {
      const row: Record<string, number | string> = { dimension: dim.name };
      for (const c of combos) {
        if (hiddenCombos.has(c.key)) continue;
        row[c.label] = Number(
          (comboScores.get(c.key)?.perDim[dim.name] ?? 0).toFixed(2)
        );
      }
      return row;
    });
  }, [run, combos, comboScores, hiddenCombos]);

  // 维度极值（用于加粗/标红）
  const perDimExtremes = useMemo(() => {
    if (!run) return new Map<string, { max: number; min: number }>();
    const m = new Map<string, { max: number; min: number }>();
    for (const dim of run.rubric) {
      const values = combos.map(
        (c) => comboScores.get(c.key)?.perDim[dim.name] ?? 0
      );
      m.set(dim.name, {
        max: Math.max(...values),
        min: Math.min(...values),
      });
    }
    return m;
  }, [run, combos, comboScores]);

  // 逐 case 数据
  const filteredCases = useMemo(() => {
    if (!run) return [];
    return cases.filter((tc) => {
      const cellResults = combos.map((c) =>
        resultMap.get(`${tc.id}::${c.promptVersionId}::${c.modelDefId}`)
      );
      if (filter === "all") return true;
      if (filter === "bad") {
        return cellResults.some((r) => r?.badCase);
      }
      if (filter === "human_gap") {
        return cellResults.some((r) => {
          if (!r || r.error || !r.humanScores) return false;
          const judgeOverall = Object.keys(r.scores).length > 0 ? overallScore(r.scores) : 0;
          const humanOverall =
            Object.values(r.humanScores).filter((v) => v > 0).length > 0
              ? Object.values(r.humanScores).reduce((a, b) => a + b, 0) /
                Object.values(r.humanScores).filter((v) => v > 0).length
              : 0;
          return Math.abs(humanOverall - judgeOverall) >= 1;
        });
      }
      if (filter === "diff") {
        const overalls = cellResults.map((r) =>
          r && !r.error ? overallScore(r.scores) : -1
        );
        const valid = overalls.filter((v) => v >= 0);
        if (valid.length < 2) return false;
        return Math.max(...valid) - Math.min(...valid) >= 0.5;
      }
      return true;
    });
  }, [cases, combos, resultMap, filter, run]);

  // 每组合人工评分平均
  const humanComboScores = useMemo(() => {
    const m = new Map<string, { overall: number }>();
    for (const c of combos) {
      const subset = results.filter(
        (r) =>
          r.promptVersionId === c.promptVersionId &&
          r.modelDefId === c.modelDefId &&
          !r.error &&
          r.humanScores &&
          Object.values(r.humanScores).some((v) => v > 0)
      );
      if (subset.length === 0) {
        m.set(c.key, { overall: 0 });
        continue;
      }
      let total = 0;
      let count = 0;
      for (const r of subset) {
        const vals = Object.values(r.humanScores!).filter((v) => v > 0);
        if (vals.length > 0) {
          total += vals.reduce((a, b) => a + b, 0) / vals.length;
          count++;
        }
      }
      m.set(c.key, { overall: count > 0 ? total / count : 0 });
    }
    return m;
  }, [combos, results]);

  // Judge 校准度：仅看有人工评分的 result，逐维度算偏差
  const judgeCalibration = useMemo(() => {
    if (!run) return null;
    const sampled = results.filter(
      (r) =>
        !r.error &&
        r.humanScores &&
        Object.values(r.humanScores).some((v) => v > 0) &&
        Object.keys(r.scores).length > 0
    );
    if (sampled.length === 0) return null;

    const perDim: Record<
      string,
      { meanGap: number; absMean: number; count: number }
    > = {};
    for (const d of run.rubric) {
      let gapSum = 0;
      let absSum = 0;
      let cnt = 0;
      for (const r of sampled) {
        const hv = r.humanScores?.[d.name];
        const jv = r.scores[d.name];
        if (!hv || hv <= 0 || jv === undefined) continue;
        gapSum += jv - hv;
        absSum += Math.abs(jv - hv);
        cnt++;
      }
      perDim[d.name] = {
        meanGap: cnt > 0 ? gapSum / cnt : 0,
        absMean: cnt > 0 ? absSum / cnt : 0,
        count: cnt,
      };
    }

    // 整体 Pearson 相关性（按 result 综合分）
    const pairs: Array<{ j: number; h: number }> = [];
    for (const r of sampled) {
      const hVals = Object.values(r.humanScores!).filter((v) => v > 0);
      const jVals = Object.values(r.scores).filter((v) => v > 0);
      if (hVals.length === 0 || jVals.length === 0) continue;
      const h = hVals.reduce((a, b) => a + b, 0) / hVals.length;
      const j = jVals.reduce((a, b) => a + b, 0) / jVals.length;
      pairs.push({ j, h });
    }
    let correlation: number | null = null;
    if (pairs.length >= 2) {
      const jMean = pairs.reduce((a, p) => a + p.j, 0) / pairs.length;
      const hMean = pairs.reduce((a, p) => a + p.h, 0) / pairs.length;
      let num = 0;
      let dj = 0;
      let dh = 0;
      for (const p of pairs) {
        num += (p.j - jMean) * (p.h - hMean);
        dj += (p.j - jMean) ** 2;
        dh += (p.h - hMean) ** 2;
      }
      const denom = Math.sqrt(dj * dh);
      correlation = denom > 0 ? num / denom : null;
    }

    // 整体平均绝对偏差（所有 case × 维度）
    let totalAbs = 0;
    let totalCnt = 0;
    for (const d of run.rubric) {
      totalAbs += perDim[d.name].absMean * perDim[d.name].count;
      totalCnt += perDim[d.name].count;
    }
    const overallMAE = totalCnt > 0 ? totalAbs / totalCnt : 0;

    return {
      sampleCount: sampled.length,
      perDim,
      correlation,
      overallMAE,
    };
  }, [results, run]);

  // 实际成本
  const actualCost = useMemo(() => {
    const prices = new Map<string, { inP: number; outP: number }>();
    for (const c of combos) {
      prices.set(c.modelDefId, { inP: c.inputPricePer1k, outP: c.outputPricePer1k });
    }
    let total = 0;
    for (const r of results) {
      if (r.error) continue;
      const p = prices.get(r.modelDefId) ?? { inP: 0, outP: 0 };
      total += (r.tokenUsage.input / 1000) * p.inP + (r.tokenUsage.output / 1000) * p.outP;
    }
    return total;
  }, [results, combos]);

  const totalTokens = useMemo(
    () =>
      results.reduce(
        (a, r) => ({ input: a.input + r.tokenUsage.input, output: a.output + r.tokenUsage.output }),
        { input: 0, output: 0 }
      ),
    [results]
  );

  const failedCount = results.filter((r) => r.error).length;
  const completedCount = results.length - failedCount;

  function bestWorstForCase(tc: TestCase): {
    bestKey?: string;
    worstKey?: string;
  } {
    let bestKey: string | undefined;
    let worstKey: string | undefined;
    let bestScore = -Infinity;
    let worstScore = Infinity;
    for (const c of combos) {
      const r = resultMap.get(`${tc.id}::${c.promptVersionId}::${c.modelDefId}`);
      if (!r || r.error) continue;
      const s = overallScore(r.scores);
      if (s > bestScore) {
        bestScore = s;
        bestKey = c.key;
      }
      if (s < worstScore) {
        worstScore = s;
        worstKey = c.key;
      }
    }
    return { bestKey, worstKey };
  }

  function toggleCombo(key: string) {
    setHiddenCombos((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function exportJSON() {
    if (!run) return;
    const payload = {
      run,
      suite,
      cases,
      results,
    };
    downloadFile(
      `${safeFilename(run.name)}.json`,
      JSON.stringify(payload, null, 2),
      "application/json"
    );
  }

  function exportCSV() {
    if (!run || !suite) return;
    const csv = buildCSV({
      run,
      suite,
      cases,
      results,
      combos,
    });
    downloadFile(`${safeFilename(run.name)}.csv`, csv, "text/csv");
  }

  function exportMarkdown() {
    if (!run || !suite) return;
    const md = buildMarkdown({
      run,
      suite,
      cases,
      results,
      combos,
    });
    downloadFile(`${safeFilename(run.name)}.md`, md, "text/markdown");
  }

  async function handleRetry() {
    if (!id) return;
    setRetrying(true);
    try {
      const { retried } = await retryFailedInEvaluation(id);
      if (retried === 0) {
        toast.info("没有需要重试的失败 case");
        return;
      }
      toast.success(`已发起 ${retried} 条失败 case 的重试，跳转查看进度`);
      router.push(`/evaluations/${id}`);
    } catch (e) {
      toast.error(`重试失败：${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setRetrying(false);
    }
  }

  async function handleToggleBadCase(resultId: string, current: boolean) {
    await toggleBadCase(resultId, !current);
    setResults((prev) =>
      prev.map((r) => (r.id === resultId ? { ...r, badCase: !current } : r))
    );
  }

  async function handleSaveHumanScores(
    resultId: string,
    scores: Record<string, number>
  ) {
    await upsertHumanScores(resultId, scores);
    setResults((prev) =>
      prev.map((r) =>
        r.id === resultId ? { ...r, humanScores: { ...scores } } : r
      )
    );
    toast.success("人工评分已保存");
  }

  if (loading || !run || !suite) {
    return (
      <div className="px-6 sm:px-10 lg:px-12 py-8 max-w-6xl mx-auto">
        <Skeleton className="h-10 w-64 mb-4" />
        <Skeleton className="h-32 mb-6" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  return (
    <div className="px-6 sm:px-10 lg:px-12 py-8 max-w-6xl mx-auto">
      <div className="flex items-center justify-between gap-4 flex-wrap mb-6">
        <Link
          href="/history"
          className="text-sm text-text-secondary hover:text-text-primary transition-colors flex items-center gap-1"
        >
          <ArrowLeft className="w-4 h-4" />
          返回历史
        </Link>
        <div className="flex items-center gap-2">
          {failedCount > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleRetry}
              disabled={retrying}
            >
              <RefreshCw
                className={cn("w-4 h-4", retrying && "animate-spin")}
              />
              {retrying ? "重试中..." : `重试 ${failedCount} 条失败`}
            </Button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger className="h-8 px-3 rounded-md inline-flex items-center gap-1.5 text-sm border border-border-default bg-bg-card text-text-primary hover:bg-bg-hover transition-colors outline-none data-[state=open]:bg-bg-hover">
              <Download className="w-4 h-4" />
              导出
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-[140px]">
              <DropdownMenuItem onClick={() => setTimeout(exportCSV, 0)}>
                CSV（明细）
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setTimeout(exportMarkdown, 0)}>
                Markdown（报告）
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setTimeout(exportJSON, 0)}>
                JSON（原始数据）
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Header */}
      <SpotlightCard className="p-6 mb-6">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-md bg-primary-muted border border-[rgba(124,92,252,0.2)] flex items-center justify-center shrink-0">
            <BarChart3 className="w-5 h-5 text-primary" />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-bold text-text-primary tracking-tight mb-1">
              {run.name}
            </h1>
            <div className="text-xs text-text-tertiary flex items-center gap-3 flex-wrap">
              <span>测试集：{suite.name} ({cases.length} 条)</span>
              <span>·</span>
              <span>{formatDate(run.createdAt)}</span>
              <span>·</span>
              <span>
                {completedCount}/{results.length} 完成
                {failedCount > 0 && (
                  <span className="text-danger ml-1">· {failedCount} 失败</span>
                )}
              </span>
              <span>·</span>
              <span className="font-mono">
                {totalTokens.input.toLocaleString()} + {totalTokens.output.toLocaleString()} tokens
              </span>
              <span>·</span>
              <span className="font-mono text-primary">
                ≈ ${actualCost.toFixed(4)}
              </span>
            </div>
          </div>
        </div>
      </SpotlightCard>

      {/* 综合得分 */}
      <Section title="综合得分">
        <TooltipProvider>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-text-tertiary text-xs uppercase tracking-wider border-b border-border-subtle">
                <th className="text-left font-medium px-3 py-2">组合</th>
                <th className="text-right font-medium px-3 py-2">Judge</th>
                <th className="text-right font-medium px-3 py-2">人工</th>
                <th className="text-right font-medium px-3 py-2">成本</th>
                <th className="text-right font-medium px-3 py-2">
                  <span className="inline-flex items-center justify-end gap-1">
                    分/$
                    <InfoTip
                      content={
                        <div className="space-y-1">
                          <div>
                            <span className="font-semibold">计算：</span>
                            Judge 综合分 ÷ 该组合实际成本。
                          </div>
                          <div>
                            成本使用未四舍五入的真实值，所以可能和页面显示的 4 位小数手算结果略有差异。
                          </div>
                          <div>
                            数值越大表示单位成本获得的分数越多；当成本很小时，这个值会被明显放大。
                          </div>
                        </div>
                      }
                    />
                  </span>
                </th>
                <th className="text-right font-medium px-3 py-2">vs 最优</th>
                <th className="text-center font-medium px-3 py-2">趋势</th>
              </tr>
            </thead>
            <tbody>
              {rankedCombos.map((c, idx) => {
                const score = comboScores.get(c.key)?.overall ?? 0;
                const humanScore = humanComboScores.get(c.key)?.overall ?? 0;
                const costStats = comboCostStats.get(c.key);
                const diff = score - bestOverall;
                return (
                  <tr
                    key={c.key}
                    className="border-b border-border-subtle last:border-0 hover:bg-bg-hover/40 transition-colors"
                  >
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-2">
                        <Badge
                          variant="secondary"
                          className="bg-bg-hover text-text-secondary border-border-subtle font-mono text-[10px]"
                        >
                          {c.promptName} V{c.versionNumber}
                        </Badge>
                        <span className="text-text-tertiary">×</span>
                        <span className="font-medium text-text-primary">
                          {c.modelLabel}
                        </span>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-right font-mono font-semibold text-text-primary">
                      {score.toFixed(2)}
                    </td>
                    <td className="px-3 py-3 text-right font-mono">
                      {humanScore > 0 ? (
                        <span
                          className={cn(
                            "font-semibold",
                            humanScore >= score
                              ? "text-success"
                              : "text-danger"
                          )}
                        >
                          {humanScore.toFixed(2)}
                        </span>
                      ) : (
                        <span className="text-text-tertiary">—</span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-right font-mono text-text-secondary">
                      {costStats ? (
                        <div>
                          <div>${costStats.cost.toFixed(4)}</div>
                          <div className="text-[10px] text-text-tertiary">
                            ${costStats.avgCostPerResult.toFixed(4)}/条
                          </div>
                        </div>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-3 py-3 text-right font-mono">
                      {costStats?.scorePerDollar ? (
                        <span
                          className={cn(
                            "font-semibold",
                            c.key === bestValueComboKey
                              ? "text-success"
                              : "text-text-primary"
                          )}
                        >
                          {costStats.scorePerDollar.toFixed(1)}
                        </span>
                      ) : (
                        <span className="text-text-tertiary">—</span>
                      )}
                    </td>
                    <td
                      className={cn(
                        "px-3 py-3 text-right font-mono",
                        diff === 0
                          ? "text-text-tertiary"
                          : "text-text-secondary"
                      )}
                    >
                      {diff === 0 ? "—" : diff.toFixed(2)}
                    </td>
                    <td className="px-3 py-3 text-center">
                      <div className="flex items-center justify-center gap-1">
                        {idx === 0 && (
                          <Trophy className="w-4 h-4 text-[#f59e0b]" />
                        )}
                        {c.key === bestValueComboKey && (
                          <Badge
                            variant="secondary"
                            className="bg-success/10 text-success border-success/20 text-[10px]"
                          >
                            性价比
                          </Badge>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        </TooltipProvider>
      </Section>

      {/* 雷达图 */}
      <Section title="维度雷达图">
        <div className="flex flex-wrap gap-2 mb-3">
          {combos.map((c, idx) => {
            const hidden = hiddenCombos.has(c.key);
            const color = COMBO_COLORS[idx % COMBO_COLORS.length];
            return (
              <button
                key={c.key}
                type="button"
                onClick={() => toggleCombo(c.key)}
                className={cn(
                  "h-7 px-2.5 rounded-md text-xs font-medium transition-all flex items-center gap-1.5 border",
                  hidden
                    ? "bg-bg-card text-text-tertiary border-border-subtle line-through"
                    : "bg-bg-card text-text-primary border-border-default"
                )}
              >
                <span
                  className="w-2.5 h-2.5 rounded-full"
                  style={{ backgroundColor: hidden ? "#444" : color }}
                />
                {c.label}
              </button>
            );
          })}
        </div>
        <div className="h-[360px]">
          <ResponsiveContainer width="100%" height="100%">
            <RadarChart data={radarData}>
              <PolarGrid stroke="rgba(255,255,255,0.08)" />
              <PolarAngleAxis
                dataKey="dimension"
                tick={{ fill: "#a1a1aa", fontSize: 12 }}
              />
              <PolarRadiusAxis
                angle={90}
                domain={[0, 5]}
                tick={{ fill: "#71717a", fontSize: 10 }}
                stroke="rgba(255,255,255,0.05)"
              />
              {combos.map((c, idx) => {
                if (hiddenCombos.has(c.key)) return null;
                const color = COMBO_COLORS[idx % COMBO_COLORS.length];
                return (
                  <Radar
                    key={c.key}
                    name={c.label}
                    dataKey={c.label}
                    stroke={color}
                    fill={color}
                    fillOpacity={0.15}
                  />
                );
              })}
              <Tooltip
                contentStyle={{
                  background: "rgba(20,20,28,0.95)",
                  border: "1px solid rgba(255,255,255,0.1)",
                  borderRadius: 6,
                  fontSize: 12,
                }}
                labelStyle={{ color: "#e4e4e7" }}
              />
              <Legend
                wrapperStyle={{ fontSize: 11, color: "#a1a1aa" }}
              />
            </RadarChart>
          </ResponsiveContainer>
        </div>
      </Section>

      {/* 维度详情 */}
      <Section title="维度得分详情">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-text-tertiary text-xs uppercase tracking-wider border-b border-border-subtle">
                <th className="text-left font-medium px-3 py-2">组合</th>
                {run.rubric.map((d) => (
                  <th
                    key={d.name}
                    className="text-right font-medium px-3 py-2 whitespace-nowrap"
                  >
                    {d.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rankedCombos.map((c) => {
                const scores = comboScores.get(c.key)?.perDim ?? {};
                return (
                  <tr
                    key={c.key}
                    className="border-b border-border-subtle last:border-0"
                  >
                    <td className="px-3 py-2.5 text-text-secondary">
                      <span className="font-mono text-text-tertiary">
                        {c.promptName} V{c.versionNumber}
                      </span>{" "}
                      + {c.modelLabel}
                    </td>
                    {run.rubric.map((d) => {
                      const v = scores[d.name] ?? 0;
                      const ext = perDimExtremes.get(d.name)!;
                      const isMax =
                        v === ext.max && ext.max !== ext.min;
                      const isMin =
                        v === ext.min && ext.max !== ext.min;
                      return (
                        <td
                          key={d.name}
                          className={cn(
                            "px-3 py-2.5 text-right font-mono",
                            isMax && "text-success font-bold",
                            isMin && "text-danger",
                            !isMax && !isMin && "text-text-primary"
                          )}
                        >
                          {v.toFixed(2)}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Section>

      {/* Judge 校准度 */}
      {judgeCalibration && (
        <Section title="Judge 校准度">
          <TooltipProvider>
          <div className="text-xs text-text-tertiary mb-4">
            基于已提交人工评分的{" "}
            <span className="font-mono text-text-secondary">
              {judgeCalibration.sampleCount}
            </span>{" "}
            条样本。
            {judgeCalibration.sampleCount < 5 && (
              <span className="text-[#f59e0b] ml-2">
                ⓘ 样本较少，仅供参考
              </span>
            )}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-5">
            <div className="rounded-md border border-border-subtle bg-bg-base p-3">
              <div className="text-[10px] text-text-tertiary uppercase tracking-wider mb-1 flex items-center gap-1">
                平均绝对偏差 (MAE)
                <InfoTip
                  content={
                    <div className="space-y-1">
                      <div className="font-semibold">如何解读：</div>
                      <div>
                        <span className="text-success">≤ 0.5</span>：Judge 很准
                      </div>
                      <div>
                        <span>0.5 – 1.0</span>：可接受
                      </div>
                      <div>
                        <span className="text-danger">{">"}  1.0</span>：偏差明显，建议调整 rubric 描述或换 Judge 模型
                      </div>
                    </div>
                  }
                />
              </div>
              <div
                className={cn(
                  "text-2xl font-mono font-bold tabular-nums",
                  judgeCalibration.overallMAE <= 0.5
                    ? "text-success"
                    : judgeCalibration.overallMAE <= 1
                    ? "text-text-primary"
                    : "text-danger"
                )}
              >
                {judgeCalibration.overallMAE.toFixed(2)}
              </div>
              <div className="text-[10px] text-text-tertiary mt-0.5">
                每维度 Judge 与人工分平均相差
              </div>
            </div>

            <div className="rounded-md border border-border-subtle bg-bg-base p-3">
              <div className="text-[10px] text-text-tertiary uppercase tracking-wider mb-1 flex items-center gap-1">
                相关性 (Pearson r)
                <InfoTip
                  content={
                    <div className="space-y-1">
                      <div className="font-semibold">如何解读：</div>
                      <div>
                        <span className="text-success">≥ 0.7</span>：Judge 排序基本可信
                      </div>
                      <div>
                        <span>0.4 – 0.7</span>：弱相关，趋势对但细节有误
                      </div>
                      <div>
                        <span className="text-danger">{"<"} 0.4</span>：基本不可信，Judge 的排序参考价值低
                      </div>
                      <div className="text-[10px] mt-1.5 opacity-80">
                        样本 ≥ 10 条时更可靠
                      </div>
                    </div>
                  }
                />
              </div>
              <div
                className={cn(
                  "text-2xl font-mono font-bold tabular-nums",
                  judgeCalibration.correlation === null
                    ? "text-text-tertiary"
                    : judgeCalibration.correlation >= 0.7
                    ? "text-success"
                    : judgeCalibration.correlation >= 0.4
                    ? "text-text-primary"
                    : "text-danger"
                )}
              >
                {judgeCalibration.correlation === null
                  ? "—"
                  : judgeCalibration.correlation.toFixed(2)}
              </div>
              <div className="text-[10px] text-text-tertiary mt-0.5">
                综合分排序一致性，越接近 1 越好
              </div>
            </div>

            <div className="rounded-md border border-border-subtle bg-bg-base p-3">
              <div className="text-[10px] text-text-tertiary uppercase tracking-wider mb-1 flex items-center gap-1">
                Judge 倾向
                <InfoTip
                  content={
                    <div className="space-y-1">
                      <div className="font-semibold">如何解读：</div>
                      <div>
                        <span className="text-[#f59e0b]">正数</span>：Judge 普遍打分比人工高（偏松）
                      </div>
                      <div>
                        <span className="text-[#3b82f6]">负数</span>：Judge 普遍打分比人工低（偏严）
                      </div>
                      <div>
                        <span>|值| ≤ 0.3</span>：基本对齐
                      </div>
                      <div className="text-[10px] mt-1.5 opacity-80">
                        系统性偏差可通过在 rubric 描述里加锚定例子来缓解
                      </div>
                    </div>
                  }
                />
              </div>
              <div className="text-2xl font-mono font-bold tabular-nums text-text-primary">
                {(() => {
                  const allGaps = Object.values(judgeCalibration.perDim);
                  const totalGap = allGaps.reduce(
                    (a, p) => a + p.meanGap * p.count,
                    0
                  );
                  const totalCnt = allGaps.reduce((a, p) => a + p.count, 0);
                  const avg = totalCnt > 0 ? totalGap / totalCnt : 0;
                  return (avg >= 0 ? "+" : "") + avg.toFixed(2);
                })()}
              </div>
              <div className="text-[10px] text-text-tertiary mt-0.5">
                正数=Judge 偏松 · 负数=偏严
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-text-tertiary text-xs uppercase tracking-wider border-b border-border-subtle">
                  <th className="text-left font-medium px-3 py-2">维度</th>
                  <th className="text-right font-medium px-3 py-2">样本</th>
                  <th className="text-right font-medium px-3 py-2">
                    <span className="inline-flex items-center gap-1 justify-end">
                      Judge 偏差
                      <InfoTip
                        content={
                          <div className="space-y-1">
                            <div>
                              <span className="font-mono">+</span>：该维度 Judge 平均比人工高
                            </div>
                            <div>
                              <span className="font-mono">−</span>：Judge 平均比人工低
                            </div>
                            <div className="text-[10px] mt-1.5 opacity-80">
                              |偏差| ≤ 0.3 视为对齐
                            </div>
                          </div>
                        }
                      />
                    </span>
                  </th>
                  <th className="text-right font-medium px-3 py-2">
                    <span className="inline-flex items-center gap-1 justify-end">
                      绝对偏差
                      <InfoTip
                        content={
                          <div className="space-y-1">
                            <div>不分方向，Judge 和人工差距的平均值</div>
                            <div>
                              <span className="text-success">≤ 0.5</span> 可信 ·{" "}
                              <span>≤ 1.0</span> 可用 ·{" "}
                              <span className="text-danger">{">"} 1.0</span> 不可信
                            </div>
                          </div>
                        }
                      />
                    </span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {run.rubric.map((d) => {
                  const dim = judgeCalibration.perDim[d.name];
                  if (!dim || dim.count === 0) {
                    return (
                      <tr
                        key={d.name}
                        className="border-b border-border-subtle last:border-0"
                      >
                        <td className="px-3 py-2.5 text-text-secondary">
                          {d.name}
                        </td>
                        <td
                          className="px-3 py-2.5 text-right text-text-tertiary"
                          colSpan={3}
                        >
                          无人工评分
                        </td>
                      </tr>
                    );
                  }
                  return (
                    <tr
                      key={d.name}
                      className="border-b border-border-subtle last:border-0"
                    >
                      <td className="px-3 py-2.5 text-text-secondary">
                        {d.name}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono text-text-tertiary">
                        {dim.count}
                      </td>
                      <td
                        className={cn(
                          "px-3 py-2.5 text-right font-mono",
                          Math.abs(dim.meanGap) <= 0.3
                            ? "text-text-primary"
                            : dim.meanGap > 0
                            ? "text-[#f59e0b]"
                            : "text-[#3b82f6]"
                        )}
                      >
                        {(dim.meanGap >= 0 ? "+" : "") + dim.meanGap.toFixed(2)}
                      </td>
                      <td
                        className={cn(
                          "px-3 py-2.5 text-right font-mono",
                          dim.absMean <= 0.5
                            ? "text-success"
                            : dim.absMean <= 1
                            ? "text-text-primary"
                            : "text-danger"
                        )}
                      >
                        {dim.absMean.toFixed(2)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          </TooltipProvider>
        </Section>
      )}

      {/* Bad case 回归检测 */}
      {regressionData && regressionData.total > 0 && (
        <Section title="Bad case 回归检测">
          <div className="space-y-3">
            <div className="flex items-center gap-3 flex-wrap">
              <Badge
                variant="secondary"
                className="bg-[rgba(16,185,129,0.12)] text-success border-[rgba(16,185,129,0.3)]"
              >
                已修复 {regressionData.fixed.length}
              </Badge>
              <Badge
                variant="secondary"
                className="bg-[rgba(239,68,68,0.12)] text-danger border-[rgba(239,68,68,0.3)]"
              >
                仍异常 {regressionData.regressed.length}
              </Badge>
              <span className="text-xs text-text-tertiary">
                共检测 {regressionData.total} 个历史 bad case
              </span>
            </div>
            {regressionData.regressed.length > 0 && (
              <div className="border border-border-subtle rounded-md overflow-hidden">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-text-tertiary uppercase tracking-wider border-b border-border-subtle bg-bg-card">
                      <th className="text-left font-medium px-3 py-2">用例</th>
                      <th className="text-left font-medium px-3 py-2">版本</th>
                      <th className="text-left font-medium px-3 py-2">模型</th>
                      <th className="text-right font-medium px-3 py-2">之前</th>
                      <th className="text-right font-medium px-3 py-2">现在</th>
                      <th className="text-right font-medium px-3 py-2">变化</th>
                    </tr>
                  </thead>
                  <tbody>
                    {regressionData.regressed.map((item, i) => (
                      <tr key={i} className="border-b border-border-subtle last:border-0 hover:bg-bg-hover/40">
                        <td className="px-3 py-2 text-text-primary max-w-[200px] truncate">
                          {item.testCaseInput}
                        </td>
                        <td className="px-3 py-2 text-text-secondary font-mono">
                          v{item.promptVersionNum}
                        </td>
                        <td className="px-3 py-2 text-text-secondary">
                          {item.modelLabel}
                        </td>
                        <td className="px-3 py-2 text-right font-mono text-danger">
                          {item.oldScore.toFixed(2)}
                        </td>
                        <td className="px-3 py-2 text-right font-mono text-danger">
                          {item.newScore.toFixed(2)}
                        </td>
                        <td className="px-3 py-2 text-right font-mono text-danger">
                          {item.delta > 0 ? "+" : ""}{item.delta.toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {regressionData.fixed.length > 0 && (
              <div className="border border-border-subtle rounded-md overflow-hidden">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-text-tertiary uppercase tracking-wider border-b border-border-subtle bg-bg-card">
                      <th className="text-left font-medium px-3 py-2">用例</th>
                      <th className="text-left font-medium px-3 py-2">版本</th>
                      <th className="text-left font-medium px-3 py-2">模型</th>
                      <th className="text-right font-medium px-3 py-2">之前</th>
                      <th className="text-right font-medium px-3 py-2">现在</th>
                      <th className="text-right font-medium px-3 py-2">提升</th>
                    </tr>
                  </thead>
                  <tbody>
                    {regressionData.fixed.map((item, i) => (
                      <tr key={i} className="border-b border-border-subtle last:border-0 hover:bg-bg-hover/40">
                        <td className="px-3 py-2 text-text-primary max-w-[200px] truncate">
                          {item.testCaseInput}
                        </td>
                        <td className="px-3 py-2 text-text-secondary font-mono">
                          v{item.promptVersionNum}
                        </td>
                        <td className="px-3 py-2 text-text-secondary">
                          {item.modelLabel}
                        </td>
                        <td className="px-3 py-2 text-right font-mono text-text-tertiary">
                          {item.oldScore.toFixed(2)}
                        </td>
                        <td className="px-3 py-2 text-right font-mono text-success">
                          {item.newScore.toFixed(2)}
                        </td>
                        <td className="px-3 py-2 text-right font-mono text-success">
                          +{item.delta.toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </Section>
      )}

      {/* 逐 Case 对比 */}
      <Section title="逐 Case 对比">
        <div className="flex items-center gap-2 mb-3">
          {([
            { v: "all" as const, label: "全部" },
            { v: "diff" as const, label: "仅差异" },
            { v: "human_gap" as const, label: `评分差异 (≥1分)` },
            { v: "bad" as const, label: `标记 bad (${results.filter((r) => r.badCase).length})` },
          ]).map((opt) => (
            <button
              key={opt.v}
              type="button"
              onClick={() => setFilter(opt.v)}
              className={cn(
                "h-7 px-3 rounded-md text-xs transition-colors border",
                filter === opt.v
                  ? "bg-primary-muted text-primary border-[rgba(124,92,252,0.4)]"
                  : "bg-bg-card text-text-secondary hover:text-text-primary border-border-subtle"
              )}
            >
              {opt.label}
            </button>
          ))}
          <span className="text-xs text-text-tertiary ml-auto">
            {filteredCases.length} / {cases.length} case
          </span>
        </div>

        <div className="border border-border-subtle rounded-md overflow-hidden">
          {filteredCases.length === 0 ? (
            <div className="text-center text-sm text-text-tertiary py-8">
              没有匹配的 case
            </div>
          ) : (
            filteredCases.map((tc) => {
              const expanded = expandedCase === tc.id;
              const { bestKey, worstKey } = bestWorstForCase(tc);
              const bestCombo = combos.find((c) => c.key === bestKey);
              const worstCombo = combos.find((c) => c.key === worstKey);
              return (
                <div
                  key={tc.id}
                  className="border-b border-border-subtle last:border-0"
                >
                  <button
                    type="button"
                    onClick={() =>
                      setExpandedCase(expanded ? null : tc.id)
                    }
                    className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-bg-hover/40 transition-colors text-left"
                  >
                    <span className="text-xs font-mono text-text-tertiary w-8 shrink-0">
                      #{tc.order}
                    </span>
                    <span className="flex-1 text-sm text-text-secondary truncate">
                      {tc.input}
                    </span>
                    <div className="flex items-center gap-2 shrink-0 text-xs">
                      {bestCombo && (
                        <span className="text-success font-mono">
                          ↑ {bestCombo.promptName} V{bestCombo.versionNumber}+{bestCombo.modelLabel.split(" ")[0]}
                        </span>
                      )}
                      {worstCombo && bestKey !== worstKey && (
                        <span className="text-danger font-mono">
                          ↓ {worstCombo.promptName} V{worstCombo.versionNumber}+{worstCombo.modelLabel.split(" ")[0]}
                        </span>
                      )}
                      {expanded ? (
                        <ChevronUp className="w-4 h-4 text-text-tertiary" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-text-tertiary" />
                      )}
                    </div>
                  </button>
                  {expanded && (
                    <div className="bg-bg-base border-t border-border-subtle p-4">
                      <div className="text-xs text-text-tertiary uppercase mb-2 tracking-wider">
                        用户输入
                      </div>
                      <div className="text-sm text-text-primary mb-1 whitespace-pre-wrap break-words">
                        {tc.input}
                      </div>
                      {tc.expected && (
                        <div className="text-xs text-text-tertiary mt-3 mb-1">
                          期望：{tc.expected}
                        </div>
                      )}

                      <div className="mt-4 space-y-3">
                        {combos.map((c) => {
                          const r = resultMap.get(
                            `${tc.id}::${c.promptVersionId}::${c.modelDefId}`
                          );
                          const score =
                            r && !r.error ? overallScore(r.scores) : null;
                          return (
                            <div
                              key={c.key}
                              className="rounded-md border border-border-subtle p-3 bg-bg-card"
                            >
                              <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
                                <div className="flex items-center gap-2">
                                  <Badge
                                    variant="secondary"
                                    className="bg-bg-hover text-text-secondary border-border-subtle font-mono text-[10px]"
                                  >
                                    {c.promptName} V{c.versionNumber}
                                  </Badge>
                                  <span className="text-sm font-medium text-text-primary">
                                    {c.modelLabel}
                                  </span>
                                </div>
                                <div className="flex items-center gap-2">
                                  {r && !r.error && (
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleToggleBadCase(r.id, !!r.badCase);
                                      }}
                                      className={cn(
                                        "w-6 h-6 rounded flex items-center justify-center transition-colors",
                                        r.badCase
                                          ? "text-[#f59e0b] bg-[rgba(245,158,11,0.12)]"
                                          : "text-text-tertiary hover:text-[#f59e0b] hover:bg-bg-hover"
                                      )}
                                      title={r.badCase ? "取消标记" : "标记为 bad case"}
                                    >
                                      <ThumbsDown className="w-3.5 h-3.5" />
                                    </button>
                                  )}
                                  {score !== null ? (
                                    <span
                                      className={cn(
                                        "text-sm font-mono font-bold",
                                        score >= 4
                                          ? "text-success"
                                          : score >= 3
                                          ? "text-text-primary"
                                          : "text-danger"
                                      )}
                                    >
                                      {score.toFixed(2)}
                                    </span>
                                  ) : (
                                    <span className="text-xs text-danger flex items-center gap-1">
                                      <AlertCircle className="w-3 h-3" />
                                      {r?.error ? "失败" : "无数据"}
                                    </span>
                                  )}
                                </div>
                              </div>
                              {r?.error ? (
                                <div className="text-xs text-danger font-mono whitespace-pre-wrap break-words">
                                  {r.error}
                                </div>
                              ) : r ? (
                                <>
                                  <pre className="text-sm text-text-primary whitespace-pre-wrap break-words font-mono bg-bg-base border border-border-subtle rounded-md p-3 max-h-[200px] overflow-y-auto">
                                    {r.actualOutput}
                                  </pre>
                                  {r.retrievedChunks && r.retrievedChunks.length > 0 && (
                                    <div className="mt-2 pt-2 border-t border-border-subtle">
                                      <div className="text-[10px] text-text-tertiary uppercase tracking-wider mb-1.5">
                                        检索到的知识片段
                                      </div>
                                      {r.retrievedChunks.map((chunk, i) => (
                                        <div key={i} className="text-xs text-text-secondary mb-1 p-2 rounded bg-bg-base border border-border-subtle">
                                          <div className="flex items-center justify-between mb-0.5">
                                            <span className="font-mono text-text-tertiary">#{i + 1}</span>
                                            <span className="font-mono text-text-tertiary">
                                              相似度: {(chunk.score * 100).toFixed(1)}%
                                            </span>
                                          </div>
                                          <pre className="whitespace-pre-wrap break-words text-xs text-text-secondary font-mono">
                                            {chunk.content}
                                          </pre>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                  {Object.keys(r.scores).length > 0 && (
                                    <HumanScoring
                                      rubric={run.rubric}
                                      judgeScores={r.scores}
                                      humanScores={r.humanScores}
                                      onSave={(scores) =>
                                        handleSaveHumanScores(r.id, scores)
                                      }
                                    />
                                  )}
                                  {r.judgeReasoning && (
                                    <div className="text-xs text-text-tertiary mt-2 italic">
                                      Judge: {r.judgeReasoning}
                                    </div>
                                  )}
                                </>
                              ) : (
                                <div className="text-xs text-text-tertiary">
                                  无数据
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </Section>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <SpotlightCard className="p-6 mb-6">
      <h2 className="text-base font-semibold text-text-primary mb-4">
        {title}
      </h2>
      {children}
    </SpotlightCard>
  );
}

function safeFilename(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, "_").replace(/\s+/g, "_");
}

function InfoTip({ content }: { content: React.ReactNode }) {
  return (
    <InfoTooltip>
      <TooltipTrigger
        render={
          <button
            type="button"
            className="text-text-tertiary/60 hover:text-primary transition-colors inline-flex items-center"
            aria-label="说明"
          >
            <Info className="w-3 h-3" />
          </button>
        }
      />
      <TooltipContent className="max-w-[280px] text-left normal-case tracking-normal font-normal leading-relaxed">
        {content}
      </TooltipContent>
    </InfoTooltip>
  );
}

function HumanScoring({
  rubric,
  judgeScores,
  humanScores,
  onSave,
}: {
  rubric: RubricDimension[];
  judgeScores: Record<string, number>;
  humanScores?: Record<string, number>;
  onSave: (scores: Record<string, number>) => void;
}) {
  const [draft, setDraft] = useState<Record<string, number>>(
    humanScores ?? {}
  );
  const [saving, setSaving] = useState(false);

  const humanOverall = useMemo(() => {
    const vals = Object.values(draft).filter((v) => v > 0);
    return vals.length > 0
      ? vals.reduce((a, b) => a + b, 0) / vals.length
      : null;
  }, [draft]);

  const judgeOverall = useMemo(() => {
    const vals = rubric.map((d) => judgeScores[d.name] ?? 0).filter((v) => v > 0);
    return vals.length > 0
      ? vals.reduce((a, b) => a + b, 0) / vals.length
      : null;
  }, [rubric, judgeScores]);

  return (
    <div className="mt-2 pt-2 border-t border-border-subtle">
      <div className="text-[10px] text-text-tertiary uppercase tracking-wider mb-2 flex items-center justify-between">
        <span>人工评分</span>
        {humanOverall !== null && (
          <span className="font-mono">
            综合{" "}
            <span
              className={cn(
                "font-semibold",
                (humanOverall - (judgeOverall ?? 0)) >= 0
                  ? "text-success"
                  : "text-danger"
              )}
            >
              {humanOverall.toFixed(1)}
            </span>
            {" · Judge "}
            <span className="text-text-secondary">
              {judgeOverall?.toFixed(1) ?? "—"}
            </span>
          </span>
        )}
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1.5">
        {rubric.map((d) => {
          const jv = judgeScores[d.name] ?? 0;
          const hv = draft[d.name] ?? 0;
          return (
            <div key={d.name} className="flex items-center gap-1.5">
              <span className="text-[10px] text-text-tertiary w-12 truncate">
                {d.name}
              </span>
              <span className="text-[10px] font-mono text-text-tertiary/60 w-4 text-center">
                {jv}
              </span>
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() =>
                    setDraft((prev) => ({ ...prev, [d.name]: n }))
                  }
                  className={cn(
                    "w-5 h-5 rounded text-[10px] font-mono transition-colors border",
                    hv === n
                      ? "bg-primary text-primary-foreground border-primary"
                      : jv === n
                      ? "bg-bg-hover text-text-tertiary border-border-subtle ring-1 ring-border-strong"
                      : "bg-bg-base text-text-tertiary border-border-subtle hover:border-border-strong"
                  )}
                  title={
                    jv === n ? `Judge 给了 ${n} 分` : `打 ${n} 分`
                  }
                >
                  {n}
                </button>
              ))}
            </div>
          );
        })}
      </div>
      <button
        type="button"
        onClick={async () => {
          setSaving(true);
          await onSave(draft);
          setSaving(false);
        }}
        disabled={saving || Object.keys(draft).length === 0}
        className="mt-2 text-[10px] text-primary hover:text-primary-hover transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {saving ? "保存中..." : "保存评分"}
      </button>
    </div>
  );
}
