"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Plus,
  Trash2,
  Pencil,
  Tag as TagIcon,
  Eraser,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { SpotlightCard } from "@/components/ui/spotlight-card";

import { ImportTestCasesDialog } from "@/components/test-suites/import-dialog";
import { TestCaseDialog } from "@/components/test-suites/test-case-dialog";

import {
  getTestSuite,
  listTestCases,
  deleteTestCase,
  deleteTestSuite,
  clearTestCases,
} from "@/lib/db/test-suites";
import type { TestSuite, TestCase } from "@/lib/types";
import { formatDate } from "@/lib/utils/format";

interface Props {
  params: Promise<{ id: string }>;
}

export default function TestSuiteDetailPage({ params }: Props) {
  const router = useRouter();
  const [id, setId] = useState<string | null>(null);
  const [suite, setSuite] = useState<TestSuite | null>(null);
  const [cases, setCases] = useState<TestCase[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTags, setActiveTags] = useState<string[]>([]);

  const [editingCase, setEditingCase] = useState<TestCase | null>(null);
  const [adding, setAdding] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<TestCase | null>(null);
  const [confirmDeleteSuite, setConfirmDeleteSuite] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);

  // 分页
  const PAGE_SIZE = 20;
  const [page, setPage] = useState(0);

  useEffect(() => {
    params.then((p) => setId(p.id));
  }, [params]);

  const refresh = useCallback(async () => {
    if (!id) return;
    try {
      const [s, list] = await Promise.all([
        getTestSuite(id),
        listTestCases(id),
      ]);
      if (!s) {
        toast.error("测试集不存在");
        router.push("/test-suites");
        return;
      }
      setSuite(s);
      setCases(list);
    } catch (e) {
      toast.error(`加载失败：${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setLoading(false);
    }
  }, [id, router]);

  useEffect(() => {
    if (id) void Promise.resolve().then(() => refresh());
  }, [id, refresh]);

  // 收集所有标签
  const allTags = useMemo(() => {
    const set = new Set<string>();
    for (const c of cases) for (const t of c.tags) set.add(t);
    return Array.from(set);
  }, [cases]);

  const filtered = useMemo(() => {
    if (activeTags.length === 0) return cases;
    return cases.filter((c) => activeTags.every((t) => c.tags.includes(t)));
  }, [cases, activeTags]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages - 1);

  const paged = useMemo(() => {
    const start = currentPage * PAGE_SIZE;
    return filtered.slice(start, start + PAGE_SIZE);
  }, [filtered, currentPage]);

  function toggleTag(tag: string) {
    setPage(0);
    setActiveTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  }

  async function handleDeleteCase(tc: TestCase) {
    try {
      await deleteTestCase(tc.id);
      toast.success("已删除");
      setConfirmDelete(null);
      refresh();
    } catch (e) {
      toast.error(`删除失败：${e instanceof Error ? e.message : String(e)}`);
    }
  }

  async function handleDeleteSuite() {
    if (!suite) return;
    try {
      await deleteTestSuite(suite.id);
      toast.success(`已删除"${suite.name}"`);
      router.push("/test-suites");
    } catch (e) {
      toast.error(`删除失败：${e instanceof Error ? e.message : String(e)}`);
    }
  }

  async function handleClearCases() {
    if (!suite) return;
    try {
      const count = await clearTestCases(suite.id);
      toast.success(`已清空 ${count} 条用例`);
      setConfirmClear(false);
      refresh();
    } catch (e) {
      toast.error(`清空失败：${e instanceof Error ? e.message : String(e)}`);
    }
  }

  if (loading || !suite) {
    return (
      <div className="px-6 sm:px-10 lg:px-12 py-8 max-w-6xl mx-auto">
        <Skeleton className="h-8 w-64 mb-4" />
        <Skeleton className="h-32 mb-6" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  return (
    <div className="px-6 sm:px-10 lg:px-12 py-8 max-w-6xl mx-auto">
      {/* Top bar */}
      <div className="flex items-center justify-between gap-4 flex-wrap mb-6">
        <Link
          href="/test-suites"
          className="text-sm text-text-secondary hover:text-text-primary transition-colors flex items-center gap-1"
        >
          <ArrowLeft className="w-4 h-4" />
          返回测试集
        </Link>
        <div className="flex items-center gap-2">
          <Button
            variant="destructive"
            size="sm"
            onClick={() => setConfirmDeleteSuite(true)}
          >
            <Trash2 className="w-4 h-4" />
            删除测试集
          </Button>
        </div>
      </div>

      {/* Suite info */}
      <SpotlightCard className="p-6 mb-6">
        <div className="flex items-start gap-3 mb-2">
          <span className="text-2xl">📦</span>
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl font-bold text-text-primary tracking-tight mb-1">
              {suite.name}
            </h1>
            <div className="flex items-center gap-2 flex-wrap">
              <Badge
                variant="secondary"
                className="bg-primary-muted text-primary border-[rgba(124,92,252,0.2)]"
              >
                {suite.type === "single-turn" ? "单轮对话" : "多轮对话"}
              </Badge>
              <span className="text-xs text-text-tertiary">
                创建于 {formatDate(suite.createdAt)}
              </span>
            </div>
          </div>
        </div>
        {suite.description && (
          <p className="text-sm text-text-secondary mt-3 leading-relaxed">
            {suite.description}
          </p>
        )}
      </SpotlightCard>

      {/* Cases */}
      <div className="flex items-center justify-between gap-4 flex-wrap mb-4">
        <div className="flex items-center gap-2 flex-wrap">
          <h2 className="text-lg font-semibold text-text-primary">
            测试用例
          </h2>
          <span className="text-sm text-text-tertiary font-mono">
            {filtered.length} / {cases.length} 条
            {filtered.length > PAGE_SIZE && (
              <span className="ml-2">
                第 {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, filtered.length)} 条
              </span>
            )}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <ImportTestCasesDialog
            testSuiteId={suite.id}
            onImported={refresh}
          />
          {cases.length > 0 && (
            <Button
              variant="outline"
              onClick={() => setConfirmClear(true)}
              className="text-text-secondary hover:text-danger"
            >
              <Eraser className="w-4 h-4" />
              清空用例
            </Button>
          )}
          <Button onClick={() => setAdding(true)}>
            <Plus className="w-4 h-4" />
            添加用例
          </Button>
        </div>
      </div>

      {/* Tag filter */}
      {allTags.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap mb-4 px-3 py-2 bg-bg-card border border-border-subtle rounded-md">
          <TagIcon className="w-3.5 h-3.5 text-text-tertiary shrink-0" />
          <span className="text-xs text-text-tertiary mr-1">标签：</span>
          {allTags.map((tag) => {
            const active = activeTags.includes(tag);
            return (
              <button
                key={tag}
                onClick={() => toggleTag(tag)}
                className={`text-xs px-2 py-0.5 rounded-full border transition-colors ${
                  active
                    ? "bg-primary-muted text-primary border-[rgba(124,92,252,0.4)]"
                    : "bg-bg-hover text-text-secondary border-border-default hover:border-border-strong"
                }`}
              >
                {tag}
              </button>
            );
          })}
          {activeTags.length > 0 && (
            <button
              onClick={() => setActiveTags([])}
              className="text-xs text-text-tertiary hover:text-text-primary ml-1"
            >
              清除
            </button>
          )}
        </div>
      )}

      {/* Cases table */}
      {cases.length === 0 ? (
        <SpotlightCard className="border-dashed">
          <div className="py-16 text-center">
            <div className="w-14 h-14 rounded-xl bg-bg-card border border-border-subtle flex items-center justify-center mx-auto mb-4">
              <Plus className="w-6 h-6 text-text-tertiary" />
            </div>
            <h3 className="text-base font-semibold text-text-primary mb-1">
              还没有用例
            </h3>
            <p className="text-sm text-text-secondary mb-5">
              手动添加，或批量导入 JSON / CSV
            </p>
            <div className="flex items-center justify-center gap-2">
              <ImportTestCasesDialog
                testSuiteId={suite.id}
                onImported={refresh}
              />
              <Button onClick={() => setAdding(true)}>
                <Plus className="w-4 h-4" />
                添加用例
              </Button>
            </div>
          </div>
        </SpotlightCard>
      ) : (
        <SpotlightCard className="overflow-hidden p-0" borderHighlight={false}>
          <div className="max-h-[calc(100vh-420px)] min-h-[300px] overflow-auto">
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-bg-card backdrop-blur-sm">
                <TableRow className="border-b border-border-default hover:bg-transparent">
                  <TableHead className="w-12 text-text-secondary uppercase text-xs">
                    #
                  </TableHead>
                  <TableHead className="text-text-secondary uppercase text-xs">
                    输入
                  </TableHead>
                  <TableHead className="text-text-secondary uppercase text-xs">
                    期望
                  </TableHead>
                  <TableHead className="text-text-secondary uppercase text-xs">
                    标签
                  </TableHead>
                  <TableHead className="w-24 text-right text-text-secondary uppercase text-xs">
                    操作
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paged.map((tc) => (
                  <TableRow
                    key={tc.id}
                    className="border-b border-border-subtle group"
                  >
                    <TableCell className="text-text-tertiary font-mono text-xs">
                      {tc.order}
                    </TableCell>
                    <TableCell className="max-w-xs">
                      <div className="text-sm text-text-primary line-clamp-2">
                        {tc.input}
                      </div>
                    </TableCell>
                    <TableCell className="max-w-xs">
                      <div className="text-sm text-text-secondary line-clamp-2">
                        {tc.expected || (
                          <span className="text-text-tertiary italic">
                            未填写
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {tc.tags.length > 0 ? (
                          tc.tags.map((t) => (
                            <span
                              key={t}
                              className="text-xs px-1.5 py-0.5 rounded bg-bg-hover text-text-secondary"
                            >
                              {t}
                            </span>
                          ))
                        ) : (
                          <span className="text-text-tertiary text-xs">—</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => setEditingCase(tc)}
                          className="w-7 h-7 rounded-md flex items-center justify-center text-text-tertiary hover:text-text-primary hover:bg-bg-hover"
                          aria-label="编辑"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => setConfirmDelete(tc)}
                          className="w-7 h-7 rounded-md flex items-center justify-center text-text-tertiary hover:text-danger hover:bg-bg-hover"
                          aria-label="删除"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          {/* 分页 */}
          {filtered.length > PAGE_SIZE && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-border-subtle bg-bg-card">
              <span className="text-xs text-text-tertiary">
                共 {filtered.length} 条 · 第 {currentPage + 1}/{totalPages} 页
              </span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPage(Math.max(0, currentPage - 1))}
                  disabled={currentPage === 0}
                  className="h-7 px-2 rounded-md text-xs text-text-secondary hover:text-text-primary hover:bg-bg-hover disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  上一页
                </button>
                {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                  let pageNum: number;
                  if (totalPages <= 7) {
                    pageNum = i;
                  } else if (currentPage <= 3) {
                    pageNum = i;
                  } else if (currentPage >= totalPages - 4) {
                    pageNum = totalPages - 7 + i;
                  } else {
                    pageNum = currentPage - 3 + i;
                  }
                  return (
                    <button
                      key={pageNum}
                      onClick={() => setPage(pageNum)}
                      className={`h-7 w-7 rounded-md text-xs font-mono transition-colors ${
                        pageNum === currentPage
                          ? "bg-primary-muted text-primary"
                          : "text-text-secondary hover:text-text-primary hover:bg-bg-hover"
                      }`}
                    >
                      {pageNum + 1}
                    </button>
                  );
                })}
                <button
                  onClick={() => setPage(Math.min(totalPages - 1, currentPage + 1))}
                  disabled={currentPage >= totalPages - 1}
                  className="h-7 px-2 rounded-md text-xs text-text-secondary hover:text-text-primary hover:bg-bg-hover disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  下一页
                </button>
              </div>
            </div>
          )}
        </SpotlightCard>
      )}

      {/* Add dialog */}
      {adding && (
        <TestCaseDialog
          key="add"
          open={adding}
          onOpenChange={setAdding}
          testSuiteId={suite.id}
          suiteType={suite.type}
          onSaved={refresh}
        />
      )}

      {/* Edit dialog */}
      {editingCase && (
        <TestCaseDialog
          key={`edit-${editingCase.id}`}
          open={!!editingCase}
          onOpenChange={(o) => !o && setEditingCase(null)}
          testSuiteId={suite.id}
          suiteType={suite.type}
          initial={editingCase}
          onSaved={refresh}
        />
      )}

      {/* Delete case confirm */}
      <Dialog
        open={!!confirmDelete}
        onOpenChange={(o) => !o && setConfirmDelete(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>删除用例？</DialogTitle>
            <DialogDescription>
              确定删除第 {confirmDelete?.order} 条用例？此操作不可撤销。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmDelete(null)}>
              取消
            </Button>
            <Button
              variant="destructive"
              onClick={() => confirmDelete && handleDeleteCase(confirmDelete)}
            >
              删除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete suite confirm */}
      <Dialog
        open={confirmDeleteSuite}
        onOpenChange={setConfirmDeleteSuite}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>删除整个测试集？</DialogTitle>
            <DialogDescription>
              将删除「{suite.name}」及其下 {cases.length} 条用例，无法恢复。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setConfirmDeleteSuite(false)}
            >
              取消
            </Button>
            <Button variant="destructive" onClick={handleDeleteSuite}>
              确认删除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Clear cases confirm */}
      <Dialog open={confirmClear} onOpenChange={setConfirmClear}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>清空全部用例？</DialogTitle>
            <DialogDescription>
              将删除「{suite.name}」下的全部 {cases.length} 条用例，但保留测试集本身。此操作不可撤销。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmClear(false)}>
              取消
            </Button>
            <Button variant="destructive" onClick={handleClearCases}>
              确认清空
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
