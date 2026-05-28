"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Database,
  FileText,
  Cpu,
  Zap,
  ArrowRight,
  Sparkles,
  Trophy,
  History as HistoryIcon,
  Plus,
  TrendingUp,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Ban,
} from "lucide-react";

import { SpotlightCard } from "@/components/ui/spotlight-card";
import { buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { getDB } from "@/lib/db";
import { listEvalRuns, listResultsByRun } from "@/lib/db/evaluations";
import { findModelDef } from "@/lib/db/models";
import { overallScore } from "@/lib/eval/judge";
import { formatRelativeTime } from "@/lib/utils/format";
import { cn } from "@/lib/utils";
import type { EvalRun } from "@/lib/types";

const QUICK_ACTIONS = [
  {
    href: "/test-suites",
    label: "管理测试集",
    desc: "导入或手写测试用例",
    icon: Database,
    step: "01",
  },
  {
    href: "/prompts",
    label: "编辑 Prompt",
    desc: "保存版本，迭代优化",
    icon: FileText,
    step: "02",
  },
  {
    href: "/models",
    label: "配置模型",
    desc: "OpenAI / Anthropic / 国产 Provider",
    icon: Cpu,
    step: "03",
  },
  {
    href: "/evaluations/new",
    label: "运行评估",
    desc: "并行对比 prompt × 模型",
    icon: Zap,
    step: "04",
  },
];

interface DashboardData {
  testSuiteCount: number;
  promptCount: number;
  modelEnabledCount: number;
  evalRuns: EvalRun[];
  // 每次 run 的综合分（仅 completed）
  runScores: Map<string, number | null>;
  runMeta: Map<
    string,
    { promptName: string; modelLabels: string[]; bestComboLabel?: string; bestComboScore?: number }
  >;
  // 全局最优组合（综合分最高的 prompt × model）
  bestCombo: {
    promptName: string;
    versionNumber: number;
    modelLabel: string;
    score: number;
    runId: string;
  } | null;
}

export default function HomePage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const db = getDB();
        const [testSuites, prompts, modelConfigs, evalRuns] = await Promise.all([
          db.testSuites.count(),
          db.prompts.count(),
          db.modelConfigs.toArray(),
          listEvalRuns(),
        ]);

        const modelEnabledCount = modelConfigs.reduce(
          (acc, c) => acc + c.models.filter((m) => m.enabled).length,
          0
        );

        // 算每个 run 的综合分 + 最优组合
        const runScores = new Map<string, number | null>();
        const runMeta = new Map<
          string,
          {
            promptName: string;
            modelLabels: string[];
            bestComboLabel?: string;
            bestComboScore?: number;
          }
        >();

        let bestCombo: DashboardData["bestCombo"] = null;

        for (const r of evalRuns) {
          // prompt name (取第一个 version 对应的 prompt)
          let promptName = "—";
          if (r.promptVersionIds.length > 0) {
            const v = await db.promptVersions.get(r.promptVersionIds[0]);
            if (v) {
              const p = await db.prompts.get(v.promptId);
              promptName = p?.name ?? "—";
            }
          }
          const modelLabels: string[] = [];
          for (const mid of r.modelDefIds) {
            const m = await findModelDef(mid);
            if (m) modelLabels.push(m.def.label);
          }

          if (r.status !== "completed") {
            runScores.set(r.id, null);
            runMeta.set(r.id, { promptName, modelLabels });
            continue;
          }

          const results = await listResultsByRun(r.id);
          const valid = results.filter(
            (res) => !res.error && Object.keys(res.scores).length > 0
          );
          if (valid.length === 0) {
            runScores.set(r.id, null);
            runMeta.set(r.id, { promptName, modelLabels });
            continue;
          }
          const overall =
            valid.reduce((a, res) => a + overallScore(res.scores), 0) /
            valid.length;
          runScores.set(r.id, overall);

          // 该 run 内每个 (promptVersion × modelDef) 组合的得分
          const comboMap = new Map<
            string,
            {
              promptVersionId: string;
              modelDefId: string;
              total: number;
              count: number;
            }
          >();
          for (const res of valid) {
            const key = `${res.promptVersionId}::${res.modelDefId}`;
            const cur = comboMap.get(key) ?? {
              promptVersionId: res.promptVersionId,
              modelDefId: res.modelDefId,
              total: 0,
              count: 0,
            };
            cur.total += overallScore(res.scores);
            cur.count++;
            comboMap.set(key, cur);
          }
          let bestKey = "";
          let bestScore = -Infinity;
          for (const [key, c] of comboMap) {
            const avg = c.total / c.count;
            if (avg > bestScore) {
              bestScore = avg;
              bestKey = key;
            }
          }
          let bestLabel: string | undefined;
          if (bestKey) {
            const cur = comboMap.get(bestKey)!;
            const v = await db.promptVersions.get(cur.promptVersionId);
            const m = await findModelDef(cur.modelDefId);
            if (v && m) {
              const p = await db.prompts.get(v.promptId);
              bestLabel = `v${v.versionNumber} · ${m.def.label}`;
              if (
                !bestCombo ||
                bestScore > bestCombo.score
              ) {
                bestCombo = {
                  promptName: p?.name ?? "—",
                  versionNumber: v.versionNumber,
                  modelLabel: m.def.label,
                  score: bestScore,
                  runId: r.id,
                };
              }
            }
          }
          runMeta.set(r.id, {
            promptName,
            modelLabels,
            bestComboLabel: bestLabel,
            bestComboScore: bestScore,
          });
        }

        setData({
          testSuiteCount: testSuites,
          promptCount: prompts,
          modelEnabledCount,
          evalRuns,
          runScores,
          runMeta,
          bestCombo,
        });
      } catch (e) {
        console.error("[dashboard] load failed:", e);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) {
    return (
      <div className="px-6 sm:px-10 lg:px-12 py-10 max-w-6xl mx-auto">
        <Skeleton className="h-12 w-72 mb-3" />
        <Skeleton className="h-5 w-96 mb-8" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-28 rounded-lg" />
          ))}
        </div>
        <Skeleton className="h-64 rounded-lg" />
      </div>
    );
  }

  // 空状态：保留 4 步引导
  if (!data || data.evalRuns.length === 0) {
    return <EmptyDashboard hasAnyData={!!data && (data.testSuiteCount + data.promptCount + data.modelEnabledCount > 0)} />;
  }

  const completedCount = data.evalRuns.filter(
    (r) => r.status === "completed"
  ).length;
  const runningCount = data.evalRuns.filter(
    (r) => r.status === "running"
  ).length;
  const recentRuns = data.evalRuns.slice(0, 5);

  return (
    <div className="px-6 sm:px-10 lg:px-12 py-10 max-w-6xl mx-auto">
      {/* Hero */}
      <div className="flex items-end justify-between gap-4 flex-wrap mb-8">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary-muted text-primary text-xs font-medium mb-4 border border-[rgba(124,92,252,0.2)]">
            <Sparkles className="w-3 h-3" />
            AI Evaluation Studio
          </div>
          <h1 className="text-3xl font-bold tracking-tight bg-gradient-to-r from-[#f0f0f5] via-[#c4b5fd] to-[#7c5cfc] bg-clip-text text-transparent mb-1">
            概览
          </h1>
          <p className="text-text-secondary text-sm">
            一眼看清当前的资产、最近评估与最优组合
          </p>
        </div>
        <Link href="/evaluations/new" className={buttonVariants()}>
          <Plus className="w-4 h-4" />
          新建评估
        </Link>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <KpiCard
          icon={Database}
          label="测试集"
          value={data.testSuiteCount}
          href="/test-suites"
        />
        <KpiCard
          icon={FileText}
          label="Prompt"
          value={data.promptCount}
          href="/prompts"
        />
        <KpiCard
          icon={Cpu}
          label="启用模型"
          value={data.modelEnabledCount}
          href="/models"
        />
        <KpiCard
          icon={HistoryIcon}
          label="评估总数"
          value={data.evalRuns.length}
          extra={
            runningCount > 0
              ? `${runningCount} 进行中`
              : `${completedCount} 完成`
          }
          href="/history"
        />
      </div>

      {/* Best combo + recent runs */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-8">
        {/* 当前最优组合 */}
        <SpotlightCard className="p-6 lg:col-span-1 relative overflow-hidden">
          <div
            className="absolute -top-20 -right-20 w-48 h-48 rounded-full opacity-20 pointer-events-none"
            style={{
              background:
                "radial-gradient(circle, rgba(124,92,252,0.35), transparent 70%)",
            }}
          />
          <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-text-tertiary mb-3 relative">
            <Trophy className="w-3.5 h-3.5 text-primary" />
            当前最优组合
          </div>
          {data.bestCombo ? (
            <Link
              href={`/reports/${data.bestCombo.runId}`}
              className="block group relative"
            >
              <div className="text-3xl font-mono font-bold text-text-primary mb-2 tabular-nums">
                {data.bestCombo.score.toFixed(2)}
                <span className="text-sm text-text-tertiary font-normal ml-1">
                  / 5.00
                </span>
              </div>
              <div className="text-sm text-text-primary font-medium truncate">
                {data.bestCombo.promptName}
              </div>
              <div className="text-xs text-text-tertiary flex items-center gap-1.5 mt-1">
                <Badge
                  variant="secondary"
                  className="bg-bg-hover text-text-secondary border-border-subtle font-mono text-[10px] px-1.5 py-0"
                >
                  v{data.bestCombo.versionNumber}
                </Badge>
                <span>×</span>
                <span className="truncate">{data.bestCombo.modelLabel}</span>
              </div>
              <div className="mt-3 text-xs text-primary inline-flex items-center gap-1 group-hover:translate-x-0.5 transition-transform">
                查看报告
                <ArrowRight className="w-3 h-3" />
              </div>
            </Link>
          ) : (
            <div className="text-sm text-text-tertiary">
              尚未有完成的评估，跑一次即可看到这里。
            </div>
          )}
        </SpotlightCard>

        {/* 最近评估 */}
        <SpotlightCard className="p-6 lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-text-tertiary">
              <TrendingUp className="w-3.5 h-3.5 text-primary" />
              最近评估
            </div>
            <Link
              href="/history"
              className="text-xs text-text-tertiary hover:text-primary inline-flex items-center gap-1 transition-colors"
            >
              全部历史
              <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
          <div className="divide-y divide-border-subtle -mx-2">
            {recentRuns.map((r) => {
              const score = data.runScores.get(r.id);
              const meta = data.runMeta.get(r.id);
              const href =
                r.status === "completed"
                  ? `/reports/${r.id}`
                  : `/evaluations/${r.id}`;
              return (
                <Link
                  key={r.id}
                  href={href}
                  className="flex items-center gap-3 px-2 py-2.5 rounded-md hover:bg-bg-hover/40 transition-colors group"
                >
                  <RunStatusIcon status={r.status} />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm text-text-primary font-medium truncate">
                      {r.name}
                    </div>
                    <div className="text-xs text-text-tertiary truncate">
                      {meta?.promptName ?? "—"}
                      {meta && meta.modelLabels.length > 0 && (
                        <>
                          <span className="mx-1.5">·</span>
                          {meta.modelLabels.slice(0, 2).join(" / ")}
                          {meta.modelLabels.length > 2 &&
                            ` +${meta.modelLabels.length - 2}`}
                        </>
                      )}
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    {score !== null && score !== undefined ? (
                      <div
                        className={cn(
                          "text-sm font-mono font-bold tabular-nums",
                          score >= 4
                            ? "text-success"
                            : score >= 3
                            ? "text-text-primary"
                            : "text-danger"
                        )}
                      >
                        {score.toFixed(2)}
                      </div>
                    ) : (
                      <div className="text-xs text-text-tertiary">—</div>
                    )}
                    <div className="text-[10px] text-text-tertiary mt-0.5">
                      {formatRelativeTime(r.createdAt)}
                    </div>
                  </div>
                  <ArrowRight className="w-3.5 h-3.5 text-text-tertiary group-hover:text-primary group-hover:translate-x-0.5 transition-all shrink-0" />
                </Link>
              );
            })}
          </div>
        </SpotlightCard>
      </div>

      {/* Footer quick links */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {QUICK_ACTIONS.map((a) => {
          const Icon = a.icon;
          return (
            <Link
              key={a.href}
              href={a.href}
              className="flex items-center gap-2.5 px-4 py-3 rounded-md border border-border-subtle bg-bg-card/40 hover:bg-bg-hover hover:border-border-default transition-colors group"
            >
              <div className="w-8 h-8 rounded-md bg-primary-muted border border-[rgba(124,92,252,0.2)] flex items-center justify-center shrink-0">
                <Icon className="w-4 h-4 text-primary" />
              </div>
              <div className="text-sm font-medium text-text-primary group-hover:text-primary transition-colors truncate">
                {a.label}
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

function KpiCard({
  icon: Icon,
  label,
  value,
  extra,
  href,
}: {
  icon: typeof Database;
  label: string;
  value: number;
  extra?: string;
  href: string;
}) {
  return (
    <Link href={href} className="block group">
      <SpotlightCard className="p-5 h-full">
        <div className="flex items-center justify-between mb-3">
          <div className="w-8 h-8 rounded-md bg-primary-muted border border-[rgba(124,92,252,0.2)] flex items-center justify-center">
            <Icon className="w-4 h-4 text-primary" />
          </div>
          <ArrowRight className="w-3.5 h-3.5 text-text-tertiary group-hover:text-primary group-hover:translate-x-0.5 transition-all" />
        </div>
        <div className="text-2xl font-bold text-text-primary tabular-nums">
          {value}
        </div>
        <div className="text-xs text-text-tertiary mt-0.5">
          {label}
          {extra && (
            <span className="text-text-tertiary/80 ml-1.5">· {extra}</span>
          )}
        </div>
      </SpotlightCard>
    </Link>
  );
}

function RunStatusIcon({ status }: { status: EvalRun["status"] }) {
  if (status === "running") {
    return (
      <div className="w-7 h-7 rounded-md bg-primary-muted border border-[rgba(124,92,252,0.3)] flex items-center justify-center shrink-0">
        <Loader2 className="w-3.5 h-3.5 text-primary animate-spin" />
      </div>
    );
  }
  if (status === "completed") {
    return (
      <div className="w-7 h-7 rounded-md bg-[rgba(16,185,129,0.12)] border border-[rgba(16,185,129,0.3)] flex items-center justify-center shrink-0">
        <CheckCircle2 className="w-3.5 h-3.5 text-success" />
      </div>
    );
  }
  if (status === "cancelled") {
    return (
      <div className="w-7 h-7 rounded-md bg-bg-hover border border-border-default flex items-center justify-center shrink-0">
        <Ban className="w-3.5 h-3.5 text-text-tertiary" />
      </div>
    );
  }
  return (
    <div className="w-7 h-7 rounded-md bg-[rgba(239,68,68,0.12)] border border-[rgba(239,68,68,0.3)] flex items-center justify-center shrink-0">
      <AlertCircle className="w-3.5 h-3.5 text-danger" />
    </div>
  );
}

function EmptyDashboard({ hasAnyData }: { hasAnyData: boolean }) {
  return (
    <div className="px-6 sm:px-10 lg:px-12 py-10 max-w-6xl mx-auto">
      {/* Hero */}
      <div className="mb-10">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary-muted text-primary text-xs font-medium mb-4 border border-[rgba(124,92,252,0.2)]">
          <Sparkles className="w-3 h-3" />
          AI Evaluation Studio · v0.1 MVP
        </div>
        <h1 className="text-4xl font-bold mb-3 tracking-tight">
          <span className="bg-gradient-to-r from-[#f0f0f5] via-[#c4b5fd] to-[#7c5cfc] bg-clip-text text-transparent">
            量化你的 Prompt 决策
          </span>
        </h1>
        <p className="text-text-secondary text-base max-w-2xl leading-relaxed">
          一个为 AI 产品经理打造的评估工具：管理测试集、迭代 Prompt 版本、并行对比多模型表现，用数据决定哪一版更好。
        </p>
      </div>

      {/* Quick start grid */}
      <div className="mb-10">
        <h2 className="text-xs font-medium text-text-tertiary uppercase tracking-wider mb-4">
          {hasAnyData ? "继续往下走" : "快速开始"}
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {QUICK_ACTIONS.map((action) => {
            const Icon = action.icon;
            return (
              <Link key={action.href} href={action.href} className="group block">
                <SpotlightCard className="p-6">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-3">
                        <span className="text-xs font-mono text-text-tertiary">
                          {action.step}
                        </span>
                        <div className="w-9 h-9 rounded-md bg-primary-muted border border-[rgba(124,92,252,0.2)] flex items-center justify-center">
                          <Icon className="w-4 h-4 text-primary" />
                        </div>
                      </div>
                      <div className="text-base font-semibold text-text-primary mb-1">
                        {action.label}
                      </div>
                      <div className="text-sm text-text-secondary">
                        {action.desc}
                      </div>
                    </div>
                    <ArrowRight className="w-4 h-4 text-text-tertiary group-hover:text-primary group-hover:translate-x-0.5 transition-all" />
                  </div>
                </SpotlightCard>
              </Link>
            );
          })}
        </div>
      </div>

      <SpotlightCard
        className="p-6 border-[rgba(124,92,252,0.25)]"
        spotlightColor="rgba(124, 92, 252, 0.22)"
      >
        <div className="flex items-center justify-between gap-6 flex-wrap relative">
          <div>
            <div className="text-base font-semibold text-text-primary mb-1">
              第一次使用？
            </div>
            <div className="text-sm text-text-secondary">
              建议按上述顺序：建测试集 → 写 Prompt → 配模型 → 跑评估，5 分钟内拿到第一份报告。
            </div>
          </div>
          <Link href="/test-suites" className={buttonVariants()}>
            从测试集开始
          </Link>
        </div>
      </SpotlightCard>
    </div>
  );
}
