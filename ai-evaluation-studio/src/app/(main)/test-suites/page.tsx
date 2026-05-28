"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Database, Inbox, Trash2, Clock, MoreHorizontal } from "lucide-react";
import { toast } from "sonner";

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

import { CreateTestSuiteDialog } from "@/components/test-suites/create-dialog";
import {
  listTestSuites,
  getTestSuiteStats,
  deleteTestSuite,
} from "@/lib/db/test-suites";
import type { TestSuite } from "@/lib/types";
import { formatRelativeTime } from "@/lib/utils/format";

export default function TestSuitesPage() {
  const [suites, setSuites] = useState<TestSuite[]>([]);
  const [stats, setStats] = useState<Record<string, { count: number }>>({});
  const [loading, setLoading] = useState(true);
  const [confirmDelete, setConfirmDelete] = useState<TestSuite | null>(null);

  async function refresh() {
    try {
      const [list, statMap] = await Promise.all([
        listTestSuites(),
        getTestSuiteStats(),
      ]);
      setSuites(list);
      setStats(statMap);
    } catch (e) {
      toast.error(`加载失败：${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void Promise.resolve().then(refresh);
  }, []);

  async function handleDelete(suite: TestSuite) {
    try {
      await deleteTestSuite(suite.id);
      toast.success(`已删除"${suite.name}"`);
      setConfirmDelete(null);
      refresh();
    } catch (e) {
      toast.error(`删除失败：${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return (
    <div className="px-6 sm:px-10 lg:px-12 py-8 max-w-6xl mx-auto">
      <PageHeader
        icon={Database}
        title="测试集"
        description="管理用例集合，每次评估都用同一组 case 跑出结果，确保对比公平。"
        actions={<CreateTestSuiteDialog onCreated={refresh} />}
      />

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-32 rounded-lg" />
          ))}
        </div>
      ) : suites.length === 0 ? (
        <SpotlightCard className="border-dashed">
          <EmptyState
            icon={Inbox}
            title="还没有测试集"
            description="创建你的第一个测试集，开始管理评估用例"
            action={<CreateTestSuiteDialog onCreated={refresh} />}
          />
        </SpotlightCard>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {suites.map((suite) => {
            const count = stats[suite.id]?.count ?? 0;
            return (
              <SpotlightCard key={suite.id} className="group">
                <Link
                  href={`/test-suites/${suite.id}`}
                  className="block p-5"
                >
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div className="text-2xl shrink-0">📦</div>
                    {/* 占位，给绝对定位的菜单按钮让位 */}
                    <span className="w-7 h-7 shrink-0" aria-hidden />
                  </div>
                  <div className="flex items-center gap-2 mb-1 min-w-0 pr-2">
                    <span className="font-semibold text-text-primary truncate">
                      {suite.name}
                    </span>
                    <Badge
                      variant="secondary"
                      className="bg-primary-muted text-primary border-[rgba(124,92,252,0.2)] shrink-0 text-[10px] px-1.5 py-0"
                    >
                      {suite.type === "single-turn" ? "单轮" : "多轮"}
                    </Badge>
                  </div>
                  {suite.description ? (
                    <div className="text-xs text-text-secondary line-clamp-2 mb-3 min-h-[2rem]">
                      {suite.description}
                    </div>
                  ) : (
                    <div className="text-xs text-text-tertiary italic mb-3 min-h-[2rem]">
                      暂无描述
                    </div>
                  )}
                  <div className="flex items-center justify-between text-xs text-text-tertiary mt-3 pt-3 border-t border-border-subtle">
                    <span className="font-mono">{count} 条用例</span>
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {formatRelativeTime(suite.updatedAt)}
                    </span>
                  </div>
                </Link>
                {/* 操作菜单：固定显示在右上角 */}
                <div className="absolute top-4 right-4 z-10">
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                      }}
                      className="w-7 h-7 rounded-md flex items-center justify-center text-text-tertiary hover:text-text-primary hover:bg-bg-hover transition-colors outline-none focus-visible:bg-bg-hover data-[state=open]:bg-bg-hover data-[state=open]:text-text-primary"
                      aria-label="更多操作"
                    >
                      <MoreHorizontal className="w-4 h-4" />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="min-w-[140px]">
                      <DropdownMenuItem
                        onClick={(e) => {
                          e.preventDefault();
                          setTimeout(() => setConfirmDelete(suite), 0);
                        }}
                        className="text-danger focus:text-danger focus:bg-[rgba(239,68,68,0.08)]"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        删除
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </SpotlightCard>
            );
          })}
        </div>
      )}

      {/* 删除确认 */}
      <Dialog
        open={!!confirmDelete}
        onOpenChange={(o) => !o && setConfirmDelete(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>删除测试集？</DialogTitle>
            <DialogDescription>
              确定要删除「{confirmDelete?.name}」吗？此操作不可撤销，将一并删除该测试集下的所有用例。
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
