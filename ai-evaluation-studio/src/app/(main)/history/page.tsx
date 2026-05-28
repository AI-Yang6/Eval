"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  History,
  Trash2,
  MoreHorizontal,
  TrendingUp,
  Eye,
} from "lucide-react";
import { toast } from "sonner";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/layout/empty-state";
import { SpotlightCard } from "@/components/ui/spotlight-card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import {
  listEvalRuns,
  listResultsByRun,
  deleteEvalRun,
} from "@/lib/db/evaluations";
import { findModelDef } from "@/lib/db/models";
import { getDB } from "@/lib/db";
import { overallScore } from "@/lib/eval/judge";
import { formatRelativeTime } from "@/lib/utils/format";
import { cn } from "@/lib/utils";
import type { EvalRun } from "@/lib/types";

interface RunWithScore extends EvalRun {
  overallScore: number | null;
  promptName: string;
  modelLabels: string[];
}

const LINE_COLORS = [
  "#7c5cfc",
  "#3b82f6",
  "#10b981",
  "#f59e0b",
  "#ef4444",
  "#ec4899",
];

export default function HistoryPage() {
  const [runs, setRuns] = useState<RunWithScore[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  // 筛选
  const [promptFilter, setPromptFilter] = useState<string>("all");
  const [modelFilter, setModelFilter] = useState<string>("all");

  async function refresh() {
    try {
      const list = await listEvalRuns();
      // 加载评分
      const enriched: RunWithScore[] = await Promise.all(
        list.map(async (r) => {
          let score: number | null = null;
          if (r.status === "completed") {
            const results = await listResultsByRun(r.id);
            const valid = results.filter(
              (res) => !res.error && Object.keys(res.scores).length > 0
            );
            if (valid.length > 0) {
              score =
                valid.reduce((a, res) => a + overallScore(res.scores), 0) /
                valid.length;
            }
          }
          // prompt name
          let promptName = "未知";
          if (r.promptVersionIds.length > 0) {
            const v = await getDB().promptVersions.get(r.promptVersionIds[0]);
            if (v) {
              const p = await getDB().prompts.get(v.promptId);
              promptName = p?.name ?? "未知";
            }
          }
          // model labels
          const modelLabels: string[] = [];
          for (const mid of r.modelDefIds) {
            const m = await findModelDef(mid);
            if (m) modelLabels.push(m.def.label);
          }

          return { ...r, overallScore: score, promptName, modelLabels };
        })
      );
      setRuns(enriched);
    } catch (e) {
      toast.error(`加载失败：${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void Promise.resolve().then(refresh);
  }, []);

  async function handleDelete(id: string) {
    try {
      await deleteEvalRun(id);
      toast.success("评估已删除");
      setConfirmDelete(null);
      refresh();
    } catch (e) {
      toast.error(`删除失败：${e instanceof Error ? e.message : String(e)}`);
    }
  }

  // 筛选项
  const promptOptions = useMemo(() => {
    const s = new Set<string>();
    runs.forEach((r) => s.add(r.promptName));
    return Array.from(s);
  }, [runs]);

  const modelOptions = useMemo(() => {
    const s = new Set<string>();
    runs.forEach((r) => r.modelLabels.forEach((l) => s.add(l)));
    return Array.from(s);
  }, [runs]);

  const filteredRuns = useMemo(() => {
    return runs.filter((r) => {
      if (promptFilter !== "all" && r.promptName !== promptFilter) return false;
      if (
        modelFilter !== "all" &&
        !r.modelLabels.includes(modelFilter)
      )
        return false;
      return true;
    });
  }, [runs, promptFilter, modelFilter]);

  // 趋势图数据：按 prompt + model 组合分组，时间作为 x 轴
  const chartData = useMemo<{
    series: { key: string; label: string }[];
    data: Record<string, string | number>[];
  }>(() => {
    const completed = filteredRuns.filter(
      (r) => r.overallScore !== null && r.status === "completed"
    );
    if (completed.length < 2) return { series: [], data: [] };

    // 按 prompt + model 组合分组
    const groups = new Map<
      string,
      { label: string; points: { x: string; y: number }[] }
    >();
    for (const r of completed) {
      for (const ml of r.modelLabels) {
        const key = `${r.promptName}::${ml}`;
        if (!groups.has(key)) {
          groups.set(key, {
            label: `${r.promptName} · ${ml}`,
            points: [],
          });
        }
        groups.get(key)!.points.push({
          x: formatRelativeTime(r.createdAt),
          y: Number(r.overallScore!.toFixed(2)),
        });
      }
    }

    // 取点最多的几组
    const sorted = [...groups.entries()]
      .sort((a, b) => b[1].points.length - a[1].points.length)
      .slice(0, 4);

    if (sorted.length === 0) return { series: [], data: [] };

    // 合并 x 轴
    const allX = new Set<string>();
    sorted.forEach(([, g]) => g.points.forEach((p) => allX.add(p.x)));
    const xLabels = [...allX];

    return {
      series: sorted.map(([key, g]) => ({ key, label: g.label })),
      data: xLabels.map((x) => {
        const row: Record<string, number | string> = { x };
        sorted.forEach(([key, g]) => {
          const pt = g.points.find((p) => p.x === x);
          row[key] = pt ? pt.y : 0;
        });
        return row;
      }),
    };
  }, [filteredRuns]);

  const deleteRun = runs.find((r) => r.id === confirmDelete);

  return (
    <div className="px-6 sm:px-10 lg:px-12 py-8 max-w-6xl mx-auto">
      <PageHeader
        icon={History}
        title="评估历史"
        description="回溯每次评估的得分趋势，追踪优化方向"
      />

      {loading ? (
        <div className="space-y-4">
          <Skeleton className="h-48 rounded-lg" />
          <Skeleton className="h-64 rounded-lg" />
        </div>
      ) : runs.length === 0 ? (
        <SpotlightCard className="border-dashed">
          <EmptyState
            icon={History}
            title="还没有评估记录"
            description="运行第一次评估后，历史记录会出现在这里"
            action={
              <Button onClick={() => window.location.href = "/evaluations/new"}>
                新建评估
              </Button>
            }
          />
        </SpotlightCard>
      ) : (
        <>
          {/* 趋势图 */}
          {chartData.series.length > 0 && (
            <SpotlightCard className="p-6 mb-6">
              <div className="flex items-center gap-2 mb-4">
                <TrendingUp className="w-4 h-4 text-primary" />
                <span className="text-sm font-semibold text-text-primary">
                  综合得分趋势
                </span>
              </div>
              <div className="h-[260px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData.data}>
                    <CartesianGrid stroke="rgba(255,255,255,0.05)" />
                    <XAxis
                      dataKey="x"
                      tick={{ fill: "#71717a", fontSize: 11 }}
                      stroke="rgba(255,255,255,0.05)"
                    />
                    <YAxis
                      domain={[0, 5]}
                      tick={{ fill: "#71717a", fontSize: 11 }}
                      stroke="rgba(255,255,255,0.05)"
                    />
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
                    {chartData.series.map((s, idx) => (
                      <Line
                        key={s.key}
                        type="monotone"
                        dataKey={s.key}
                        name={s.label}
                        stroke={LINE_COLORS[idx % LINE_COLORS.length]}
                        strokeWidth={2}
                        dot={{
                          r: 4,
                          fill: LINE_COLORS[idx % LINE_COLORS.length],
                        }}
                        activeDot={{ r: 6 }}
                      />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </SpotlightCard>
          )}

          {/* 筛选 */}
          <div className="flex items-center gap-3 mb-4 flex-wrap">
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-text-tertiary">Prompt:</span>
              <select
                value={promptFilter}
                onChange={(e) => setPromptFilter(e.target.value)}
                className="h-7 px-2 rounded-md text-xs bg-bg-card border border-border-subtle text-text-primary outline-none focus:border-primary"
              >
                <option value="all">全部</option>
                {promptOptions.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-text-tertiary">模型:</span>
              <select
                value={modelFilter}
                onChange={(e) => setModelFilter(e.target.value)}
                className="h-7 px-2 rounded-md text-xs bg-bg-card border border-border-subtle text-text-primary outline-none focus:border-primary"
              >
                <option value="all">全部</option>
                {modelOptions.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* 历史列表 */}
          <div className="border border-border-subtle rounded-md overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-text-tertiary text-xs uppercase tracking-wider border-b border-border-subtle bg-bg-card">
                  <th className="text-left font-medium px-4 py-2.5">时间</th>
                  <th className="text-left font-medium px-4 py-2.5">名称</th>
                  <th className="text-left font-medium px-4 py-2.5">Prompt</th>
                  <th className="text-left font-medium px-4 py-2.5">模型</th>
                  <th className="text-right font-medium px-4 py-2.5">综合分</th>
                  <th className="text-center font-medium px-4 py-2.5">状态</th>
                  <th className="text-center font-medium px-4 py-2.5">操作</th>
                </tr>
              </thead>
              <tbody>
                {filteredRuns.map((r) => (
                  <tr
                    key={r.id}
                    className="border-b border-border-subtle last:border-0 hover:bg-bg-hover/40 transition-colors"
                  >
                    <td className="px-4 py-3 text-xs text-text-tertiary whitespace-nowrap">
                      {formatRelativeTime(r.createdAt)}
                    </td>
                    <td className="px-4 py-3 text-text-primary font-medium max-w-[200px] truncate">
                      {r.name}
                    </td>
                    <td className="px-4 py-3 text-text-secondary text-xs truncate max-w-[120px]">
                      {r.promptName}
                    </td>
                    <td className="px-4 py-3 text-xs">
                      <div className="flex flex-wrap gap-1">
                        {r.modelLabels.slice(0, 2).map((l) => (
                          <Badge
                            key={l}
                            variant="secondary"
                            className="bg-bg-hover text-text-tertiary border-border-subtle text-[10px] px-1.5 py-0"
                          >
                            {l}
                          </Badge>
                        ))}
                        {r.modelLabels.length > 2 && (
                          <span className="text-text-tertiary text-[10px]">
                            +{r.modelLabels.length - 2}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right font-mono">
                      {r.overallScore !== null ? (
                        <span
                          className={cn(
                            "font-semibold",
                            r.overallScore >= 4
                              ? "text-success"
                              : r.overallScore >= 3
                              ? "text-text-primary"
                              : "text-danger"
                          )}
                        >
                          {r.overallScore.toFixed(2)}
                        </span>
                      ) : (
                        <span className="text-text-tertiary">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <StatusBadge status={r.status} />
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex items-center justify-center gap-1">
                        {r.status === "completed" && (
                          <Link
                            href={`/reports/${r.id}`}
                            className="h-7 px-2 rounded-md inline-flex items-center gap-1 text-xs text-text-secondary hover:text-primary hover:bg-bg-hover transition-colors"
                            aria-label="查看报告"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            查看
                          </Link>
                        )}
                        {r.status !== "completed" && (
                          <Link
                            href={`/evaluations/${r.id}`}
                            className="h-7 px-2 rounded-md inline-flex items-center gap-1 text-xs text-text-secondary hover:text-primary hover:bg-bg-hover transition-colors"
                            aria-label={
                              r.status === "running" ? "查看进度" : "查看详情"
                            }
                          >
                            <Eye className="w-3.5 h-3.5" />
                            查看
                          </Link>
                        )}
                        <DropdownMenu>
                          <DropdownMenuTrigger
                            className="h-7 w-7 rounded-md flex items-center justify-center text-text-tertiary hover:text-text-primary hover:bg-bg-hover transition-colors outline-none"
                            aria-label="更多操作"
                          >
                            <MoreHorizontal className="w-3.5 h-3.5" />
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="min-w-[120px]">
                            <DropdownMenuItem
                              onClick={() => setTimeout(() => setConfirmDelete(r.id), 0)}
                              className="text-danger focus:text-danger focus:bg-[rgba(239,68,68,0.08)]"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              删除
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <Dialog
        open={!!confirmDelete}
        onOpenChange={(o) => !o && setConfirmDelete(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>删除评估？</DialogTitle>
            <DialogDescription>
              将删除「{deleteRun?.name}」及其全部结果，无法恢复。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmDelete(null)}>
              取消
            </Button>
            <Button
              variant="destructive"
              onClick={() => confirmDelete && handleDelete(confirmDelete)}
            >
              确认删除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StatusBadge({ status }: { status: EvalRun["status"] }) {
  if (status === "running") {
    return (
      <Badge
        variant="secondary"
        className="bg-primary-muted text-primary border-[rgba(124,92,252,0.3)]"
      >
        运行中
      </Badge>
    );
  }
  if (status === "completed") {
    return (
      <Badge
        variant="secondary"
        className="bg-[rgba(16,185,129,0.12)] text-success border-[rgba(16,185,129,0.3)]"
      >
        完成
      </Badge>
    );
  }
  if (status === "cancelled") {
    return (
      <Badge
        variant="secondary"
        className="bg-bg-hover text-text-tertiary border-border-default"
      >
        已中止
      </Badge>
    );
  }
  return (
    <Badge
      variant="secondary"
      className="bg-[rgba(239,68,68,0.12)] text-danger border-[rgba(239,68,68,0.3)]"
    >
      失败
    </Badge>
  );
}
