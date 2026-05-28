"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { FileText, Inbox, Trash2, Clock, MoreHorizontal, GitBranch } from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/layout/empty-state";
import { SpotlightCard } from "@/components/ui/spotlight-card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
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

import { CreatePromptDialog } from "@/components/prompts/create-dialog";
import {
  listPromptsWithStats,
  deletePrompt,
  type PromptWithStats,
} from "@/lib/db/prompts";
import { formatRelativeTime } from "@/lib/utils/format";

export default function PromptsPage() {
  const [prompts, setPrompts] = useState<PromptWithStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirmDelete, setConfirmDelete] = useState<PromptWithStats | null>(
    null
  );

  async function refresh() {
    try {
      const list = await listPromptsWithStats();
      setPrompts(list);
    } catch (e) {
      toast.error(`加载失败：${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void Promise.resolve().then(refresh);
  }, []);

  async function handleDelete(p: PromptWithStats) {
    try {
      await deletePrompt(p.id);
      toast.success(`已删除"${p.name}"`);
      setConfirmDelete(null);
      refresh();
    } catch (e) {
      toast.error(`删除失败：${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return (
    <div className="px-6 sm:px-10 lg:px-12 py-8 max-w-6xl mx-auto">
      <PageHeader
        icon={FileText}
        title="Prompt"
        description="管理 Prompt 与版本，迭代后随时可用旧版本对比新版本表现。"
        actions={<CreatePromptDialog onCreated={refresh} />}
      />

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-32 rounded-lg" />
          ))}
        </div>
      ) : prompts.length === 0 ? (
        <SpotlightCard className="border-dashed">
          <EmptyState
            icon={Inbox}
            title="还没有 Prompt"
            description="创建你的第一个 Prompt，开始版本化管理"
            action={<CreatePromptDialog onCreated={refresh} />}
          />
        </SpotlightCard>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {prompts.map((p) => (
            <SpotlightCard key={p.id} className="group">
              <Link href={`/prompts/${p.id}`} className="block p-5">
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div className="text-2xl shrink-0">📝</div>
                  <span className="w-7 h-7 shrink-0" aria-hidden />
                </div>
                <div className="flex items-center gap-2 mb-1 min-w-0 pr-2">
                  <span className="font-semibold text-text-primary truncate">
                    {p.name}
                  </span>
                  {p.versionCount > 0 && (
                    <Badge
                      variant="secondary"
                      className="bg-primary-muted text-primary border-[rgba(124,92,252,0.2)] shrink-0 text-[10px] px-1.5 py-0"
                    >
                      v{p.latestVersion}
                    </Badge>
                  )}
                </div>
                <div className="text-xs text-text-tertiary mb-3 min-h-[2rem] flex items-center">
                  {p.versionCount === 0 ? (
                    <span className="italic">尚未保存版本</span>
                  ) : (
                    <span className="flex items-center gap-1">
                      <GitBranch className="w-3 h-3" />
                      {p.versionCount} 个版本
                    </span>
                  )}
                </div>
                <div className="flex items-center justify-between text-xs text-text-tertiary mt-3 pt-3 border-t border-border-subtle">
                  <span className="font-mono">
                    {p.versionCount > 0 ? `最新 v${p.latestVersion}` : "未发布"}
                  </span>
                  <span className="flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {formatRelativeTime(p.createdAt)}
                  </span>
                </div>
              </Link>
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
                        setTimeout(() => setConfirmDelete(p), 0);
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
          ))}
        </div>
      )}

      <Dialog
        open={!!confirmDelete}
        onOpenChange={(o) => !o && setConfirmDelete(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>删除 Prompt？</DialogTitle>
            <DialogDescription>
              将删除「{confirmDelete?.name}」及其下的{" "}
              {confirmDelete?.versionCount ?? 0} 个版本，无法恢复。
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
