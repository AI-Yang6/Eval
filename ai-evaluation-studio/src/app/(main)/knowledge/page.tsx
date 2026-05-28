"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { BookOpen, Trash2, Clock, Plus, Library } from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/layout/empty-state";
import { SpotlightCard } from "@/components/ui/spotlight-card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
  listKnowledgeBases,
  deleteKnowledgeBase,
  createKnowledgeBase,
} from "@/lib/db/knowledge";
import {
  PROVIDER_LABELS,
  EMBEDDING_MODELS,
} from "@/lib/model-adapters/presets";
import type { KnowledgeBase, ModelProvider } from "@/lib/types";
import { formatRelativeTime } from "@/lib/utils/format";

export default function KnowledgePage() {
  const [kbs, setKbs] = useState<KnowledgeBase[]>([]);
  const [stats, setStats] = useState<Record<string, { docs: number; chunks: number }>>({});
  const [loading, setLoading] = useState(true);
  const [confirmDelete, setConfirmDelete] = useState<KnowledgeBase | null>(null);

  // create dialog
  const [createOpen, setCreateOpen] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createDesc, setCreateDesc] = useState("");
  const [createModel, setCreateModel] = useState("");
  const [createModelCustom, setCreateModelCustom] = useState(false);
  const [creating, setCreating] = useState(false);

  // 扁平化所有 Embedding 模型列表（按 provider 分组）
  const allEmbeddingModels = (Object.entries(EMBEDDING_MODELS) as [ModelProvider, string[]][])
    .filter(([, models]) => models.length > 0)
    .flatMap(([provider, models]) =>
      models.map((model) => ({ provider, model, providerLabel: PROVIDER_LABELS[provider] }))
    );

  function toggleCustom() {
    if (createModelCustom) {
      // 切回预设模式
      setCreateModelCustom(false);
      setCreateModel("");
    } else {
      setCreateModelCustom(true);
      setCreateModel("");
    }
  }

  async function refresh() {
    try {
      const list = await listKnowledgeBases();
      setKbs(list);
      // compute stats per KB
      const map: Record<string, { docs: number; chunks: number }> = {};
      for (const kb of list) {
        const db = (await import("@/lib/db")).getDB();
        const docs = await db.kbDocuments.where("knowledgeBaseId").equals(kb.id).count();
        map[kb.id] = { docs, chunks: kb.chunkCount };
      }
      setStats(map);
    } catch (e) {
      toast.error(`加载失败：${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void Promise.resolve().then(refresh);
  }, []);

  // reset create form
  function resetCreate() {
    setCreateName("");
    setCreateDesc("");
    setCreateModel("");
    setCreateModelCustom(false);
  }

  async function handleCreate() {
    if (!createName.trim()) {
      toast.error("请输入知识库名称");
      return;
    }
    if (!createModel) {
      toast.error("请选择 Embedding 模型");
      return;
    }
    // 从预设模型自动推导服务商，自定义模式默认 openai
    const entry = allEmbeddingModels.find((e) => e.model === createModel);
    const provider: ModelProvider = entry?.provider ?? "openai";
    setCreating(true);
    try {
      await createKnowledgeBase({
        name: createName.trim(),
        description: createDesc.trim(),
        embeddingProvider: provider,
        embeddingModel: createModel,
      });
      toast.success("知识库已创建");
      setCreateOpen(false);
      resetCreate();
      refresh();
    } catch (e) {
      toast.error(`创建失败：${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(kb: KnowledgeBase) {
    try {
      await deleteKnowledgeBase(kb.id);
      toast.success(`已删除"${kb.name}"`);
      setConfirmDelete(null);
      refresh();
    } catch (e) {
      toast.error(`删除失败：${e instanceof Error ? e.message : String(e)}`);
    }
  }


  return (
    <div className="px-6 sm:px-10 lg:px-12 py-8 max-w-6xl mx-auto">
      <PageHeader
        icon={Library}
        title="知识库"
        description="上传文档并向量化，评测时通过 {{context}} 注入相关知识，测试 RAG 效果。"
        actions={
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="w-4 h-4" />
            创建知识库
          </Button>
        }
      />

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-32 rounded-lg" />
          ))}
        </div>
      ) : kbs.length === 0 ? (
        <SpotlightCard className="border-dashed">
          <EmptyState
            icon={BookOpen}
            title="还没有知识库"
            description="创建知识库并上传文档，即可在评测中使用 RAG 能力"
            action={
              <Button onClick={() => setCreateOpen(true)}>
                <Plus className="w-4 h-4" />
                创建知识库
              </Button>
            }
          />
        </SpotlightCard>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {kbs.map((kb) => (
            <SpotlightCard key={kb.id} className="group">
              <Link
                href={`/knowledge/${kb.id}`}
                className="block p-5"
              >
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div className="w-10 h-10 rounded-lg bg-primary-muted border border-[rgba(124,92,252,0.2)] flex items-center justify-center shrink-0">
                    <BookOpen className="w-5 h-5 text-primary" />
                  </div>
                  <span className="w-7 h-7 shrink-0" aria-hidden />
                </div>
                <div className="font-semibold text-text-primary truncate mb-1">
                  {kb.name}
                </div>
                {kb.description ? (
                  <div className="text-xs text-text-secondary line-clamp-2 mb-3 min-h-[2rem]">
                    {kb.description}
                  </div>
                ) : (
                  <div className="text-xs text-text-tertiary italic mb-3 min-h-[2rem]">
                    暂无描述
                  </div>
                )}
                <div className="flex items-center gap-2 flex-wrap mb-2">
                  <Badge
                    variant="secondary"
                    className="bg-bg-hover text-text-tertiary border-border-default text-[10px] px-1.5 py-0"
                  >
                    {PROVIDER_LABELS[kb.embeddingProvider]}
                  </Badge>
                  <Badge
                    variant="secondary"
                    className="bg-primary-muted text-primary border-[rgba(124,92,252,0.2)] text-[10px] px-1.5 py-0 font-mono"
                  >
                    {kb.embeddingModel}
                  </Badge>
                </div>
                <div className="flex items-center justify-between text-xs text-text-tertiary mt-3 pt-3 border-t border-border-subtle">
                  <span className="font-mono">
                    {stats[kb.id]?.docs ?? 0} 文档 · {kb.chunkCount} 片段
                  </span>
                  <span className="flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {formatRelativeTime(kb.updatedAt)}
                  </span>
                </div>
              </Link>
              <div className="absolute top-4 right-4 z-10">
                <DropdownMenu>
                  <DropdownMenuTrigger
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
                    className="w-7 h-7 rounded-md flex items-center justify-center text-text-tertiary hover:text-text-primary hover:bg-bg-hover transition-colors outline-none focus-visible:bg-bg-hover data-[state=open]:bg-bg-hover data-[state=open]:text-text-primary"
                    aria-label="更多操作"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="min-w-[140px]">
                    <DropdownMenuItem
                      onClick={(e) => {
                        e.preventDefault();
                        setTimeout(() => setConfirmDelete(kb), 0);
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

      {/* Create dialog */}
      <Dialog open={createOpen} onOpenChange={(o) => { setCreateOpen(o); if (!o) resetCreate(); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>创建知识库</DialogTitle>
            <DialogDescription>
              选择 Embedding 模型后，上传的文档会自动向量化存储。凭证在「模型」页面统一配置。
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>名称</Label>
              <Input
                value={createName}
                onChange={(e) => setCreateName(e.target.value)}
                placeholder="客服知识库"
                maxLength={100}
              />
            </div>
            <div className="space-y-1.5">
              <Label>描述（可选）</Label>
              <Textarea
                value={createDesc}
                onChange={(e) => setCreateDesc(e.target.value)}
                placeholder="用于客服场景的 FAQ 文档集合"
                rows={2}
              />
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label>Embedding 模型</Label>
                <button
                  type="button"
                  onClick={toggleCustom}
                  className="text-[11px] text-text-tertiary hover:text-primary transition-colors"
                >
                  {createModelCustom ? "预设模型" : "自定义模型"}
                </button>
              </div>
              {createModelCustom ? (
                <Input
                  value={createModel}
                  onChange={(e) => setCreateModel(e.target.value)}
                  placeholder="输入模型名称（凭证在模型页统一配置）"
                  className="font-mono text-sm"
                />
              ) : (
                <select
                  value={createModel}
                  onChange={(e) => setCreateModel(e.target.value)}
                  className="w-full h-9 px-3 rounded-md text-sm bg-bg-card border border-border-subtle text-text-primary outline-none focus:border-primary"
                >
                  <option value="">选择模型</option>
                  {allEmbeddingModels.map((e) => (
                    <option key={e.model} value={e.model}>
                      {e.providerLabel} — {e.model}
                    </option>
                  ))}
                </select>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => { setCreateOpen(false); resetCreate(); }}>
              取消
            </Button>
            <Button onClick={handleCreate} disabled={creating}>
              {creating ? "创建中..." : "创建"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <Dialog
        open={!!confirmDelete}
        onOpenChange={(o) => !o && setConfirmDelete(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>删除知识库？</DialogTitle>
            <DialogDescription>
              确定要删除「{confirmDelete?.name}」吗？所有文档和向量数据将被一并删除，此操作不可撤销。
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