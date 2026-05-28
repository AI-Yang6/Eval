"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Trash2,
  Pencil,
  Save,
  X,
  Zap,
  GitBranch,
  Clock,
  FileText,
  Check,
  GitCompare,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SpotlightCard } from "@/components/ui/spotlight-card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import {
  getPrompt,
  listVersions,
  createVersion,
  deletePrompt,
  deleteVersion,
  updatePromptName,
} from "@/lib/db/prompts";
import { getDB } from "@/lib/db";
import { overallScore } from "@/lib/eval/judge";
import type { Prompt, PromptVersion } from "@/lib/types";
import { formatDate } from "@/lib/utils/format";
import { cn } from "@/lib/utils";
import { diffLines, type DiffLine } from "@/lib/utils/text-diff";

const DEFAULT_TEMPLATE = "{{input}}";

interface Props {
  params: Promise<{ id: string }>;
}

export default function PromptDetailPage({ params }: Props) {
  const router = useRouter();
  const [id, setId] = useState<string | null>(null);
  const [prompt, setPrompt] = useState<Prompt | null>(null);
  const [versions, setVersions] = useState<PromptVersion[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeVersionId, setActiveVersionId] = useState<string | null>(null);

  // 编辑态
  const [editing, setEditing] = useState(false);
  const [editSystem, setEditSystem] = useState("");
  const [editTemplate, setEditTemplate] = useState(DEFAULT_TEMPLATE);
  const [savingVersion, setSavingVersion] = useState(false);

  // 重命名
  const [renaming, setRenaming] = useState(false);
  const [nameDraft, setNameDraft] = useState("");

  const [confirmDeletePrompt, setConfirmDeletePrompt] = useState(false);
  const [confirmDeleteVersion, setConfirmDeleteVersion] =
    useState<PromptVersion | null>(null);

  // Diff
  const [diffLeft, setDiffLeft] = useState<string>("");
  const [diffRight, setDiffRight] = useState<string>("");
  const [showDiff, setShowDiff] = useState(false);

  // 关联评估
  const [versionEvalInfo, setVersionEvalInfo] = useState<
    Record<string, { count: number; bestScore: number | null }>
  >({});

  useEffect(() => {
    params.then((p) => setId(p.id));
  }, [params]);

  const refresh = useCallback(async (preferVersionId?: string) => {
    if (!id) return;
    try {
      const [p, list] = await Promise.all([getPrompt(id), listVersions(id)]);
      if (!p) {
        toast.error("Prompt 不存在");
        router.push("/prompts");
        return;
      }
      setPrompt(p);
      setVersions(list);

      // 查询关联评估
      if (list.length > 0) {
        const versionIds = new Set(list.map((v) => v.id));
        const allRuns = await getDB().evalRuns.toArray();
        const info: Record<string, { count: number; bestScore: number | null }> = {};
        for (const vid of versionIds) info[vid] = { count: 0, bestScore: null };
        for (const run of allRuns) {
          if (run.status !== "completed") continue;
          const matched = run.promptVersionIds.find((v) => versionIds.has(v));
          if (!matched) continue;
          info[matched].count++;
          // 计算本次评估的综合分
          const results = await getDB().evalResults
            .where("evalRunId")
            .equals(run.id)
            .filter((r) => !r.error && Object.keys(r.scores).length > 0)
            .toArray();
          if (results.length > 0) {
            const overall =
              results.reduce((a, r) => a + overallScore(r.scores), 0) /
              results.length;
            if (info[matched].bestScore === null || overall > info[matched].bestScore) {
              info[matched].bestScore = overall;
            }
          }
        }
        setVersionEvalInfo(info);
      }
      if (preferVersionId && list.find((v) => v.id === preferVersionId)) {
        setActiveVersionId(preferVersionId);
      } else if (list.length > 0) {
        setActiveVersionId((prev) =>
          prev && list.find((v) => v.id === prev) ? prev : list[0].id
        );
      } else {
        setActiveVersionId(null);
      }
    } catch (e) {
      toast.error(`加载失败：${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setLoading(false);
    }
  }, [id, router]);

  useEffect(() => {
    if (id) void Promise.resolve().then(() => refresh());
  }, [id, refresh]);

  const activeVersion = useMemo(
    () => versions.find((v) => v.id === activeVersionId) ?? null,
    [versions, activeVersionId]
  );

  function startEdit() {
    if (activeVersion) {
      setEditSystem(activeVersion.systemPrompt);
      setEditTemplate(activeVersion.userPromptTemplate);
    } else {
      setEditSystem("");
      setEditTemplate(DEFAULT_TEMPLATE);
    }
    setEditing(true);
  }

  function cancelEdit() {
    setEditing(false);
  }

  async function saveAsNewVersion() {
    if (!prompt) return;
    if (!editSystem.trim()) {
      toast.error("System Prompt 不能为空");
      return;
    }
    if (!editTemplate.trim()) {
      toast.error("User Prompt 模板不能为空");
      return;
    }
    if (
      activeVersion &&
      editSystem === activeVersion.systemPrompt &&
      editTemplate === activeVersion.userPromptTemplate
    ) {
      toast.info("内容没有变化，无需保存新版本");
      return;
    }
    setSavingVersion(true);
    try {
      const v = await createVersion({
        promptId: prompt.id,
        systemPrompt: editSystem,
        userPromptTemplate: editTemplate,
      });
      toast.success(`已保存为 v${v.versionNumber}`);
      setEditing(false);
      await refresh(v.id);
    } catch (e) {
      toast.error(`保存失败：${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setSavingVersion(false);
    }
  }

  async function handleRename() {
    if (!prompt || !nameDraft.trim()) {
      setRenaming(false);
      return;
    }
    if (nameDraft.trim() === prompt.name) {
      setRenaming(false);
      return;
    }
    try {
      await updatePromptName(prompt.id, nameDraft.trim());
      toast.success("名称已更新");
      setRenaming(false);
      refresh(activeVersionId ?? undefined);
    } catch (e) {
      toast.error(`更新失败：${e instanceof Error ? e.message : String(e)}`);
    }
  }

  async function handleDeletePrompt() {
    if (!prompt) return;
    try {
      await deletePrompt(prompt.id);
      toast.success(`已删除"${prompt.name}"`);
      router.push("/prompts");
    } catch (e) {
      toast.error(`删除失败：${e instanceof Error ? e.message : String(e)}`);
    }
  }

  async function handleDeleteVersion(v: PromptVersion) {
    try {
      await deleteVersion(v.id);
      toast.success(`已删除 v${v.versionNumber}`);
      setConfirmDeleteVersion(null);
      refresh();
    } catch (e) {
      toast.error(`删除失败：${e instanceof Error ? e.message : String(e)}`);
    }
  }

  if (loading || !prompt) {
    return (
      <div className="px-6 sm:px-10 lg:px-12 py-8 max-w-6xl mx-auto">
        <Skeleton className="h-8 w-64 mb-4" />
        <Skeleton className="h-32 mb-6" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  const latestVersionNum =
    versions.length === 0 ? 0 : Math.max(...versions.map((v) => v.versionNumber));

  return (
    <div className="px-6 sm:px-10 lg:px-12 py-8 max-w-6xl mx-auto">
      {/* Top bar */}
      <div className="flex items-center justify-between gap-4 flex-wrap mb-6">
        <Link
          href="/prompts"
          className="text-sm text-text-secondary hover:text-text-primary transition-colors flex items-center gap-1"
        >
          <ArrowLeft className="w-4 h-4" />
          返回 Prompt 列表
        </Link>
        <div className="flex items-center gap-2">
          <Button
            variant="destructive"
            size="sm"
            onClick={() => setConfirmDeletePrompt(true)}
          >
            <Trash2 className="w-4 h-4" />
            删除 Prompt
          </Button>
        </div>
      </div>

      {/* Header */}
      <SpotlightCard className="p-6 mb-6">
        <div className="flex items-start gap-3">
          <span className="text-2xl shrink-0">📝</span>
          <div className="flex-1 min-w-0">
            {renaming ? (
              <div className="flex items-center gap-2 mb-1">
                <Input
                  autoFocus
                  value={nameDraft}
                  onChange={(e) => setNameDraft(e.target.value)}
                  onBlur={handleRename}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleRename();
                    if (e.key === "Escape") setRenaming(false);
                  }}
                  className="text-2xl font-bold h-10"
                  maxLength={100}
                />
              </div>
            ) : (
              <button
                onClick={() => {
                  setNameDraft(prompt.name);
                  setRenaming(true);
                }}
                className="group/title flex items-center gap-2 mb-1"
              >
                <h1 className="text-2xl font-bold text-text-primary tracking-tight group-hover/title:text-primary transition-colors">
                  {prompt.name}
                </h1>
                <Pencil className="w-3.5 h-3.5 text-text-tertiary opacity-0 group-hover/title:opacity-100 transition-opacity" />
              </button>
            )}
            <div className="flex items-center gap-3 text-xs text-text-tertiary flex-wrap">
              <span>创建于 {formatDate(prompt.createdAt)}</span>
              <span className="flex items-center gap-1">
                <GitBranch className="w-3 h-3" />
                {versions.length} 个版本
                {versions.length > 0 && (
                  <span className="text-primary ml-0.5">
                    · 最新 v{latestVersionNum}
                  </span>
                )}
              </span>
            </div>
          </div>
        </div>
      </SpotlightCard>

      {/* Empty state */}
      {versions.length === 0 && !editing && (
        <SpotlightCard className="border-dashed">
          <div className="py-16 text-center">
            <div className="w-14 h-14 rounded-xl bg-bg-card border border-border-subtle flex items-center justify-center mx-auto mb-4">
              <FileText className="w-6 h-6 text-text-tertiary" />
            </div>
            <h3 className="text-base font-semibold text-text-primary mb-1">
              还没有任何版本
            </h3>
            <p className="text-sm text-text-secondary mb-5">
              填写 system prompt 和模板，保存为 v1
            </p>
            <Button onClick={startEdit}>
              <Pencil className="w-4 h-4" />
              开始编辑
            </Button>
          </div>
        </SpotlightCard>
      )}

      {/* Version tabs + content */}
      {(versions.length > 0 || editing) && (
        <>
          {/* Version selector */}
          {versions.length > 0 && !editing && (
            <div className="flex items-center justify-between mb-3 flex-wrap gap-3">
              <div className="flex items-center gap-1 flex-wrap">
                <span className="text-xs text-text-tertiary uppercase tracking-wider mr-2">
                  版本
                </span>
                {versions.map((v) => (
                  <button
                    key={v.id}
                    onClick={() => setActiveVersionId(v.id)}
                    className={cn(
                      "h-8 px-3 rounded-md text-sm font-mono transition-colors flex items-center gap-1.5",
                      v.id === activeVersionId
                        ? "bg-primary-muted text-primary border border-[rgba(124,92,252,0.3)]"
                        : "text-text-secondary hover:text-text-primary hover:bg-bg-hover border border-transparent"
                    )}
                  >
                    v{v.versionNumber}
                    {v.versionNumber === latestVersionNum && (
                      <Check className="w-3 h-3" />
                    )}
                    {versionEvalInfo[v.id]?.count > 0 && (
                      <span className="text-[10px] text-text-tertiary ml-1 font-normal">
                        · {versionEvalInfo[v.id].count}次
                        {versionEvalInfo[v.id].bestScore !== null && (
                          <span className={cn(
                            "ml-0.5",
                            versionEvalInfo[v.id].bestScore! >= 4
                              ? "text-success"
                              : versionEvalInfo[v.id].bestScore! >= 3
                                ? "text-text-secondary"
                                : "text-danger"
                          )}>
                          </span>
                        )}
                      </span>
                    )}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2">
                {activeVersion && versions.length >= 2 && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      // 默认：当前选中的 vs 上一个版本
                      const idx = versions.findIndex(
                        (v) => v.id === activeVersionId
                      );
                      const other =
                        idx > 0 ? versions[idx - 1] : versions[idx + 1];
                      setDiffLeft(other.id);
                      setDiffRight(activeVersion.id);
                      setShowDiff(true);
                    }}
                  >
                    <GitCompare className="w-3.5 h-3.5" />
                    对比
                  </Button>
                )}
                {activeVersion && (
                  <>
                    <Button variant="outline" size="sm" onClick={startEdit}>
                      <Pencil className="w-3.5 h-3.5" />
                      基于此版本编辑
                    </Button>
                    {versions.length > 1 && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setConfirmDeleteVersion(activeVersion)}
                        className="text-danger hover:text-danger"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        删除版本
                      </Button>
                    )}
                    <Button
                      size="sm"
                      onClick={() =>
                        router.push(
                          `/evaluations/new?promptVersionId=${activeVersion.id}`
                        )
                      }
                    >
                      <Zap className="w-3.5 h-3.5" />
                      用此版本评估
                    </Button>
                  </>
                )}
              </div>
            </div>
          )}

          {/* Editing banner */}
          {editing && (
            <div className="flex items-center justify-between gap-3 px-4 py-2.5 mb-3 rounded-md bg-primary-muted border border-[rgba(124,92,252,0.3)] flex-wrap">
              <div className="flex items-center gap-2 text-sm text-primary">
                <Pencil className="w-4 h-4" />
                正在编辑（保存后会生成{" "}
                <span className="font-semibold">v{latestVersionNum + 1}</span>）
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={cancelEdit}
                  disabled={savingVersion}
                >
                  <X className="w-3.5 h-3.5" />
                  取消
                </Button>
                <Button
                  size="sm"
                  onClick={saveAsNewVersion}
                  disabled={savingVersion}
                >
                  <Save className="w-3.5 h-3.5" />
                  {savingVersion
                    ? "保存中..."
                    : `保存为 v${latestVersionNum + 1}`}
                </Button>
              </div>
            </div>
          )}

          {/* Editor / Viewer */}
          <div className="grid grid-cols-1 gap-4">
            <SpotlightCard
              className="p-6"
              borderHighlight={!editing}
            >
              <div className="flex items-center justify-between mb-3">
                <Label className="text-sm font-semibold text-text-primary">
                  System Prompt
                </Label>
                {!editing && activeVersion && (
                  <Badge
                    variant="secondary"
                    className="bg-bg-hover text-text-secondary border-border-default font-mono"
                  >
                    v{activeVersion.versionNumber}
                  </Badge>
                )}
              </div>
              {editing ? (
                <Textarea
                  value={editSystem}
                  onChange={(e) => setEditSystem(e.target.value)}
                  placeholder="你是一个客服助手，请用亲切的语气回复用户..."
                  className="min-h-[200px] font-mono text-sm"
                />
              ) : activeVersion ? (
                <pre className="font-mono text-sm text-text-primary whitespace-pre-wrap break-words bg-bg-base border border-border-subtle rounded-md p-4 max-h-[400px] overflow-y-auto">
                  {activeVersion.systemPrompt}
                </pre>
              ) : null}
            </SpotlightCard>

            <SpotlightCard className="p-6" borderHighlight={!editing}>
              <div className="flex items-center justify-between mb-3">
                <Label className="text-sm font-semibold text-text-primary">
                  User Prompt 模板
                </Label>
                <span className="text-xs text-text-tertiary">
                  使用 <code className="text-primary">{"{{input}}"}</code> 占位用户输入
                </span>
              </div>
              {editing ? (
                <Textarea
                  value={editTemplate}
                  onChange={(e) => setEditTemplate(e.target.value)}
                  placeholder="{{input}}"
                  className="min-h-[100px] font-mono text-sm"
                />
              ) : activeVersion ? (
                <pre className="font-mono text-sm text-text-primary whitespace-pre-wrap break-words bg-bg-base border border-border-subtle rounded-md p-4">
                  {activeVersion.userPromptTemplate}
                </pre>
              ) : null}
            </SpotlightCard>

            {/* Version meta */}
            {!editing && activeVersion && (
              <div className="flex items-center justify-between gap-3 text-xs text-text-tertiary px-1 flex-wrap">
                <span className="flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  保存于 {formatDate(activeVersion.createdAt)}
                </span>
                {versionEvalInfo[activeVersion.id]?.count > 0 && (
                  <span className="flex items-center gap-1">
                    <Zap className="w-3 h-3" />
                    {versionEvalInfo[activeVersion.id].count} 次评估
                    {versionEvalInfo[activeVersion.id].bestScore !== null && (
                      <span className={cn(
                        "font-semibold",
                        versionEvalInfo[activeVersion.id].bestScore! >= 4
                          ? "text-success"
                          : versionEvalInfo[activeVersion.id].bestScore! >= 3
                            ? "text-text-primary"
                            : "text-danger"
                      )}>
                        · 最高 {versionEvalInfo[activeVersion.id].bestScore!.toFixed(2)}
                      </span>
                    )}
                  </span>
                )}
              </div>
            )}
          </div>
        </>
      )}

      {/* Delete prompt confirm */}
      <Dialog
        open={confirmDeletePrompt}
        onOpenChange={setConfirmDeletePrompt}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>删除整个 Prompt？</DialogTitle>
            <DialogDescription>
              将删除「{prompt.name}」及其下 {versions.length} 个版本，无法恢复。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setConfirmDeletePrompt(false)}
            >
              取消
            </Button>
            <Button variant="destructive" onClick={handleDeletePrompt}>
              确认删除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete version confirm */}
      <Dialog
        open={!!confirmDeleteVersion}
        onOpenChange={(o) => !o && setConfirmDeleteVersion(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>删除版本？</DialogTitle>
            <DialogDescription>
              将删除 v{confirmDeleteVersion?.versionNumber}，此操作不可撤销。已被评估历史引用的版本不会被删除。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setConfirmDeleteVersion(null)}
            >
              取消
            </Button>
            <Button
              variant="destructive"
              onClick={() =>
                confirmDeleteVersion && handleDeleteVersion(confirmDeleteVersion)
              }
            >
              确认删除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Diff dialog */}
      {showDiff && (
        <VersionDiffDialog
          versions={versions}
          leftId={diffLeft}
          rightId={diffRight}
          open={showDiff}
          onOpenChange={(o) => !o && setShowDiff(false)}
        />
      )}
    </div>
  );
}

function VersionDiffDialog({
  versions,
  leftId,
  rightId,
  open,
  onOpenChange,
}: {
  versions: PromptVersion[];
  leftId: string;
  rightId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [left, setLeft] = useState(leftId);
  const [right, setRight] = useState(rightId);

  const a = versions.find((v) => v.id === left) ?? null;
  const b = versions.find((v) => v.id === right) ?? null;

  const systemDiff =
    a && b ? diffLines(a.systemPrompt, b.systemPrompt) : [];
  const userDiff =
    a && b
      ? diffLines(a.userPromptTemplate, b.userPromptTemplate)
      : [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl max-h-[85vh] flex flex-col">
        <DialogHeader className="shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <GitCompare className="w-4 h-4" />
            版本对比
          </DialogTitle>
          <DialogDescription>
            查看两个版本之间的变化
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-4 py-2 shrink-0">
          <div className="flex-1">
            <select
              value={left}
              onChange={(e) => setLeft(e.target.value)}
              className="w-full h-9 px-3 rounded-md text-sm bg-bg-card border border-border-subtle text-text-primary outline-none focus:border-primary font-mono"
            >
              {versions.map((v) => (
                <option key={v.id} value={v.id}>
                  v{v.versionNumber} — {new Date(v.createdAt).toLocaleDateString("zh-CN")}
                </option>
              ))}
            </select>
          </div>
          <span className="text-text-tertiary text-sm">vs</span>
          <div className="flex-1">
            <select
              value={right}
              onChange={(e) => setRight(e.target.value)}
              className="w-full h-9 px-3 rounded-md text-sm bg-bg-card border border-border-subtle text-text-primary outline-none focus:border-primary font-mono"
            >
              {versions.map((v) => (
                <option key={v.id} value={v.id}>
                  v{v.versionNumber} — {new Date(v.createdAt).toLocaleDateString("zh-CN")}
                </option>
              ))}
            </select>
          </div>
        </div>

        {a && b ? (
          <div className="flex-1 overflow-y-auto min-h-0 space-y-4">
            {/* System Prompt diff */}
            <div>
              <div className="text-xs font-semibold text-text-secondary mb-2 uppercase tracking-wider">
                System Prompt
              </div>
              <DiffView diff={systemDiff} />
            </div>
            {/* User Template diff */}
            <div>
              <div className="text-xs font-semibold text-text-secondary mb-2 uppercase tracking-wider">
                User Prompt 模板
              </div>
              <DiffView diff={userDiff} />
            </div>
          </div>
        ) : (
          <div className="text-sm text-text-tertiary text-center py-8">
            请选择两个版本
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function DiffView({ diff }: { diff: DiffLine[] }) {
  return (
    <pre className="text-xs font-mono rounded-md border border-border-subtle overflow-hidden">
      {diff.map((line, i) => (
        <div
          key={i}
          className={cn(
            "px-3 py-0.5 leading-relaxed",
            line.type === "added" &&
              "bg-[rgba(16,185,129,0.1)] text-success",
            line.type === "removed" &&
              "bg-[rgba(239,68,68,0.1)] text-danger",
            line.type === "same" && "text-text-tertiary"
          )}
        >
          <span className="inline-block w-5 mr-2 select-none text-text-tertiary/50">
            {line.type === "added" ? "+" : line.type === "removed" ? "-" : " "}
          </span>
          {line.text || " "}
        </div>
      ))}
    </pre>
  );
}
