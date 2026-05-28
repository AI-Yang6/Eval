"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Zap,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Trash2,
  Ban,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { SpotlightCard } from "@/components/ui/spotlight-card";
import { CenterFlow } from "@/components/ui/center-flow";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import {
  getEvalRun,
  listResultsByRun,
  deleteEvalRun,
  updateEvalRunStatus,
} from "@/lib/db/evaluations";
import { listTestCases } from "@/lib/db/test-suites";
import { findModelDef } from "@/lib/db/models";
import { getDB } from "@/lib/db";
import { requestCancelEvaluation, retryFailedInEvaluation } from "@/lib/eval/runner";
import { formatDate } from "@/lib/utils/format";
import { cn } from "@/lib/utils";
import type {
  EvalRun,
  EvalResult,
  ModelDefinition,
  PromptVersion,
} from "@/lib/types";

interface Props {
  params: Promise<{ id: string }>;
}

interface ComboInfo {
  promptVersion: PromptVersion;
  modelDef: ModelDefinition;
  promptName: string;
}

export default function EvalRunPage({ params }: Props) {
  const router = useRouter();
  const [id, setId] = useState<string | null>(null);
  const [run, setRun] = useState<EvalRun | null>(null);
  const [results, setResults] = useState<EvalResult[]>([]);
  const [totalCases, setTotalCases] = useState(0);
  const [combos, setCombos] = useState<ComboInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [pollKey, setPollKey] = useState(0);

  useEffect(() => {
    params.then((p) => setId(p.id));
  }, [params]);

  // 初次加载结构信息
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
        setRun(r);
        const cases = await listTestCases(r.testSuiteId);
        setTotalCases(cases.length);

        const list: ComboInfo[] = [];
        for (const vid of r.promptVersionIds) {
          const v = await getDB().promptVersions.get(vid);
          if (!v) continue;
          const p = await getDB().prompts.get(v.promptId);
          for (const mid of r.modelDefIds) {
            const m = await findModelDef(mid);
            if (!m) continue;
            list.push({
              promptVersion: v,
              modelDef: m.def,
              promptName: p?.name ?? "未知 Prompt",
            });
          }
        }
        setCombos(list);
      } catch (e) {
        toast.error(`加载失败：${e instanceof Error ? e.message : String(e)}`);
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // 轮询 results & status（每 1.5 s，运行中才轮询）
  useEffect(() => {
    if (!id) return;
    let stopped = false;

    async function tick() {
      const [r, list] = await Promise.all([
        getEvalRun(id!),
        listResultsByRun(id!),
      ]);
      if (stopped) return;
      if (r) setRun(r);
      setResults(list);

      if (r && r.status === "running") {
        setTimeout(tick, 1500);
      } else if (r && r.status === "completed") {
        // 完成后跳转报告
        setTimeout(() => {
          if (!stopped) router.push(`/reports/${id}`);
        }, 800);
      }
    }
    tick();

    return () => {
      stopped = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, pollKey]);

  const totalCalls = combos.length * totalCases;
  const completedCalls = results.length;
  const failedCalls = results.filter((r) => r.error).length;
  const overallPct =
    totalCalls === 0 ? 0 : Math.round((completedCalls / totalCalls) * 100);

  // 每组合的进度
  const comboStats = useMemo(() => {
    const map = new Map<
      string,
      { done: number; failed: number; total: number }
    >();
    for (const c of combos) {
      const key = `${c.promptVersion.id}::${c.modelDef.id}`;
      map.set(key, { done: 0, failed: 0, total: totalCases });
    }
    for (const r of results) {
      const key = `${r.promptVersionId}::${r.modelDefId}`;
      const cur = map.get(key);
      if (!cur) continue;
      cur.done++;
      if (r.error) cur.failed++;
    }
    return map;
  }, [combos, results, totalCases]);

  async function handleDelete() {
    if (!id) return;
    try {
      await deleteEvalRun(id);
      toast.success("评估已删除");
      router.push("/history");
    } catch (e) {
      toast.error(`删除失败：${e instanceof Error ? e.message : String(e)}`);
    }
  }

  async function handleCancel() {
    if (!id) return;
    setCancelling(true);
    try {
      // 通知内存中的 runner 提前退出
      requestCancelEvaluation(id);
      // 同时把 DB 状态置为 cancelled，避免 runner 已经游离（页面刷新过）的情况
      await updateEvalRunStatus(id, "cancelled");
      const r = await getEvalRun(id);
      if (r) setRun(r);
      toast.success("评估已中止");
      setConfirmCancel(false);
    } catch (e) {
      toast.error(`中止失败：${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setCancelling(false);
    }
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
      toast.success(`已重试 ${retried} 条失败 case`);
      // 触发轮询重新启动：把 run 拉回来
      const r = await getEvalRun(id);
      if (r) setRun(r);
      setPollKey((k) => k + 1);
    } catch (e) {
      toast.error(`重试失败：${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setRetrying(false);
    }
  }

  if (loading || !run) {
    return (
      <div className="px-6 sm:px-10 lg:px-12 py-8 max-w-4xl mx-auto">
        <Skeleton className="h-8 w-64 mb-4" />
        <Skeleton className="h-32 mb-6" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  return (
    <div className="px-6 sm:px-10 lg:px-12 py-8 max-w-4xl mx-auto">
      <div className="flex items-center justify-between gap-4 flex-wrap mb-6">
        <Link
          href="/history"
          className="text-sm text-text-secondary hover:text-text-primary transition-colors flex items-center gap-1"
        >
          <ArrowLeft className="w-4 h-4" />
          返回历史
        </Link>
        {run.status === "running" ? (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setConfirmCancel(true)}
            className="text-text-secondary"
          >
            <Ban className="w-4 h-4" />
            中止评估
          </Button>
        ) : (
          <div className="flex items-center gap-2">
            {failedCalls > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleRetry}
                disabled={retrying}
              >
                <RefreshCw
                  className={cn("w-4 h-4", retrying && "animate-spin")}
                />
                {retrying ? "重试中..." : `重试 ${failedCalls} 条失败`}
              </Button>
            )}
            {run.status === "completed" && (
              <Button
                size="sm"
                onClick={() => router.push(`/reports/${run.id}`)}
              >
                查看报告
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setConfirmDelete(true)}
              className="text-danger hover:text-danger hover:bg-[rgba(239,68,68,0.08)]"
            >
              <Trash2 className="w-4 h-4" />
              删除
            </Button>
          </div>
        )}
      </div>

      {run.status === "running" && (
        <div className="mb-6">
          <CenterFlow
            label="EVALUATION IN PROGRESS"
            title="正在生成评测结果"
            description={`已完成 ${completedCalls} / ${totalCalls} 次调用，正在并发请求模型并由 Judge 评分，请稍候…`}
          />
        </div>
      )}

      <SpotlightCard className="p-6 mb-6">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-md bg-primary-muted border border-[rgba(124,92,252,0.2)] flex items-center justify-center shrink-0">
            <Zap className="w-5 h-5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <h1 className="text-xl font-bold text-text-primary tracking-tight truncate">
                {run.name}
              </h1>
              <StatusBadge status={run.status} />
            </div>
            <div className="text-xs text-text-tertiary">
              创建于 {formatDate(run.createdAt)}
              {run.completedAt && (
                <> · 完成于 {formatDate(run.completedAt)}</>
              )}
            </div>
          </div>
        </div>

        {/* Overall progress */}
        <div className="mt-5">
          <div className="flex items-center justify-between text-xs text-text-tertiary mb-1.5">
            <span>整体进度</span>
            <span className="font-mono">
              {completedCalls} / {totalCalls}
              {failedCalls > 0 && (
                <span className="text-danger ml-2">{failedCalls} 失败</span>
              )}
            </span>
          </div>
          <ProgressBar pct={overallPct} status={run.status} />
        </div>
      </SpotlightCard>

      {/* 组合进度 */}
      <SpotlightCard className="p-6">
        <div className="text-sm font-semibold text-text-primary mb-4">
          各组合进度（{combos.length} 个）
        </div>
        <div className="space-y-3">
          {combos.map((c) => {
            const key = `${c.promptVersion.id}::${c.modelDef.id}`;
            const stat = comboStats.get(key) ?? {
              done: 0,
              failed: 0,
              total: totalCases,
            };
            const pct =
              stat.total === 0
                ? 0
                : Math.round((stat.done / stat.total) * 100);
            return (
              <div key={key}>
                <div className="flex items-center justify-between mb-1.5 gap-2 flex-wrap">
                  <div className="flex items-center gap-2 min-w-0">
                    <Badge
                      variant="secondary"
                      className="bg-bg-hover text-text-secondary border-border-subtle font-mono text-[10px] px-1.5 py-0"
                    >
                      v{c.promptVersion.versionNumber}
                    </Badge>
                    <span className="text-sm text-text-secondary truncate">
                      {c.promptName}
                    </span>
                    <span className="text-text-tertiary text-xs">×</span>
                    <span className="text-sm text-text-primary font-medium">
                      {c.modelDef.label}
                    </span>
                  </div>
                  <span className="text-xs font-mono text-text-tertiary">
                    {stat.done}/{stat.total}
                    {stat.failed > 0 && (
                      <span className="text-danger ml-1.5">
                        · {stat.failed} ⚠
                      </span>
                    )}
                  </span>
                </div>
                <ProgressBar
                  pct={pct}
                  status={
                    stat.done === stat.total
                      ? "completed"
                      : run.status === "failed"
                      ? "failed"
                      : run.status === "cancelled"
                      ? "cancelled"
                      : "running"
                  }
                />
              </div>
            );
          })}
        </div>
      </SpotlightCard>

      {failedCalls > 0 && (
        <div className="mt-4 px-4 py-3 rounded-md bg-[rgba(239,68,68,0.08)] border border-[rgba(239,68,68,0.2)] text-sm text-danger flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          有 {failedCalls} 条调用失败 — 报告页中可查看具体错误（不阻塞其他 case）
        </div>
      )}

      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>删除此次评估？</DialogTitle>
            <DialogDescription>
              将删除「{run.name}」及其全部 {results.length} 条结果，无法恢复。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmDelete(false)}>
              取消
            </Button>
            <Button variant="destructive" onClick={handleDelete}>
              确认删除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmCancel} onOpenChange={setConfirmCancel}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>中止此次评估？</DialogTitle>
            <DialogDescription>
              已生成的 {results.length} 条结果会保留，但本次评估不再继续调用模型。中止后无法恢复，需要重新创建评估。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setConfirmCancel(false)}
              disabled={cancelling}
            >
              继续运行
            </Button>
            <Button
              variant="destructive"
              onClick={handleCancel}
              disabled={cancelling}
            >
              {cancelling ? "中止中..." : "确认中止"}
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
        className="bg-primary-muted text-primary border-[rgba(124,92,252,0.3)] flex items-center gap-1"
      >
        <Loader2 className="w-3 h-3 animate-spin" />
        运行中
      </Badge>
    );
  }
  if (status === "completed") {
    return (
      <Badge
        variant="secondary"
        className="bg-[rgba(16,185,129,0.12)] text-success border-[rgba(16,185,129,0.3)] flex items-center gap-1"
      >
        <CheckCircle2 className="w-3 h-3" />
        已完成
      </Badge>
    );
  }
  if (status === "cancelled") {
    return (
      <Badge
        variant="secondary"
        className="bg-bg-hover text-text-tertiary border-border-default flex items-center gap-1"
      >
        <Ban className="w-3 h-3" />
        已中止
      </Badge>
    );
  }
  return (
    <Badge
      variant="secondary"
      className="bg-[rgba(239,68,68,0.12)] text-danger border-[rgba(239,68,68,0.3)] flex items-center gap-1"
    >
      <AlertCircle className="w-3 h-3" />
      失败
    </Badge>
  );
}

function ProgressBar({
  pct,
  status,
}: {
  pct: number;
  status: EvalRun["status"];
}) {
  return (
    <div className="h-1.5 rounded-full bg-bg-base overflow-hidden">
      <div
        className={cn(
          "h-full transition-all duration-500 rounded-full",
          status === "completed"
            ? "bg-success"
            : status === "failed"
            ? "bg-danger"
            : status === "cancelled"
            ? "bg-text-tertiary"
            : "bg-gradient-to-r from-primary to-[#3b82f6]"
        )}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
