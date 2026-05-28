"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Trash2,
  Upload,
  FileText,
  BookOpen,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { SpotlightCard } from "@/components/ui/spotlight-card";

import {
  getKnowledgeBase,
  listDocuments,
  deleteKnowledgeBase,
  deleteDocument,
  addDocument,
} from "@/lib/db/knowledge";
import { PROVIDER_LABELS } from "@/lib/model-adapters/presets";
import type { KnowledgeBase, KBDocument } from "@/lib/types";
import { formatDate } from "@/lib/utils/format";

interface Props {
  params: Promise<{ id: string }>;
}

export default function KnowledgeDetailPage({ params }: Props) {
  const router = useRouter();
  const [id, setId] = useState<string | null>(null);
  const [kb, setKb] = useState<KnowledgeBase | null>(null);
  const [docs, setDocs] = useState<KBDocument[]>([]);
  const [loading, setLoading] = useState(true);

  // upload
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadContent, setUploadContent] = useState("");
  const [uploadFilename, setUploadFilename] = useState("");
  const [uploading, setUploading] = useState(false);

  // confirm
  const [confirmDeleteKb, setConfirmDeleteKb] = useState(false);
  const [confirmDeleteDoc, setConfirmDeleteDoc] = useState<KBDocument | null>(null);

  useEffect(() => {
    params.then((p) => setId(p.id));
  }, [params]);

  const refresh = useCallback(async () => {
    if (!id) return;
    try {
      const [k, list] = await Promise.all([
        getKnowledgeBase(id),
        listDocuments(id),
      ]);
      if (!k) {
        toast.error("知识库不存在");
        router.push("/knowledge");
        return;
      }
      setKb(k);
      setDocs(list);
    } catch (e) {
      toast.error(`加载失败：${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setLoading(false);
    }
  }, [id, router]);

  useEffect(() => {
    if (id) void Promise.resolve().then(() => refresh());
  }, [id, refresh]);

  async function handleDeleteKb() {
    if (!kb) return;
    try {
      await deleteKnowledgeBase(kb.id);
      toast.success(`已删除"${kb.name}"`);
      router.push("/knowledge");
    } catch (e) {
      toast.error(`删除失败：${e instanceof Error ? e.message : String(e)}`);
    }
  }

  async function handleDeleteDoc(doc: KBDocument) {
    try {
      await deleteDocument(doc.id);
      toast.success("文档已删除");
      setConfirmDeleteDoc(null);
      refresh();
    } catch (e) {
      toast.error(`删除失败：${e instanceof Error ? e.message : String(e)}`);
    }
  }

  async function handleUpload() {
    if (!uploadContent.trim()) {
      toast.error("文档内容不能为空");
      return;
    }
    setUploading(true);
    try {
      const result = await addDocument(
        id!,
        uploadFilename.trim() || "未命名文档",
        uploadContent
      );
      if (result.error) {
        toast.warning(`上传完成，但 ${result.error}`);
      } else {
        toast.success(`已上传，共 ${result.chunkCount} 个片段`);
      }
      setUploadOpen(false);
      setUploadContent("");
      setUploadFilename("");
      refresh();
    } catch (e) {
      toast.error(`上传失败：${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setUploading(false);
    }
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadFilename(file.name);
    const reader = new FileReader();
    reader.onload = (ev) => {
      setUploadContent(ev.target?.result as string);
    };
    reader.readAsText(file);
  }

  if (loading || !kb) {
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
          href="/knowledge"
          className="text-sm text-text-secondary hover:text-text-primary transition-colors flex items-center gap-1"
        >
          <ArrowLeft className="w-4 h-4" />
          返回知识库
        </Link>
        <div className="flex items-center gap-2">
          <Button
            variant="destructive"
            size="sm"
            onClick={() => setConfirmDeleteKb(true)}
          >
            <Trash2 className="w-4 h-4" />
            删除知识库
          </Button>
        </div>
      </div>

      {/* KB info */}
      <SpotlightCard className="p-6 mb-6">
        <div className="flex items-start gap-3 mb-2">
          <div className="w-10 h-10 rounded-lg bg-primary-muted border border-[rgba(124,92,252,0.2)] flex items-center justify-center shrink-0">
            <BookOpen className="w-5 h-5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl font-bold text-text-primary tracking-tight mb-1">
              {kb.name}
            </h1>
            <div className="flex items-center gap-2 flex-wrap">
              <Badge
                variant="secondary"
                className="bg-bg-hover text-text-tertiary border-border-default"
              >
                {PROVIDER_LABELS[kb.embeddingProvider]}
              </Badge>
              <Badge
                variant="secondary"
                className="bg-primary-muted text-primary border-[rgba(124,92,252,0.2)] font-mono"
              >
                {kb.embeddingModel}
              </Badge>
              <span className="text-xs text-text-tertiary">
                {kb.chunkCount} 个向量片段
              </span>
              <span className="text-xs text-text-tertiary">
                创建于 {formatDate(kb.createdAt)}
              </span>
            </div>
          </div>
        </div>
        {kb.description && (
          <p className="text-sm text-text-secondary mt-3 leading-relaxed">
            {kb.description}
          </p>
        )}
      </SpotlightCard>

      {/* Documents */}
      <div className="flex items-center justify-between gap-4 flex-wrap mb-4">
        <h2 className="text-lg font-semibold text-text-primary">
          文档
        </h2>
        <Button onClick={() => setUploadOpen(true)}>
          <Upload className="w-4 h-4" />
          上传文档
        </Button>
      </div>

      {docs.length === 0 ? (
        <SpotlightCard className="border-dashed">
          <div className="py-16 text-center">
            <div className="w-14 h-14 rounded-xl bg-bg-card border border-border-subtle flex items-center justify-center mx-auto mb-4">
              <FileText className="w-6 h-6 text-text-tertiary" />
            </div>
            <h3 className="text-base font-semibold text-text-primary mb-1">
              还没有文档
            </h3>
            <p className="text-sm text-text-secondary mb-5">
              上传 .txt 或 .md 文件，系统会自动切片并向量化
            </p>
            <Button onClick={() => setUploadOpen(true)}>
              <Upload className="w-4 h-4" />
              上传文档
            </Button>
          </div>
        </SpotlightCard>
      ) : (
        <SpotlightCard className="overflow-hidden p-0" borderHighlight={false}>
          <div className="max-h-[calc(100vh-340px)] min-h-[200px] overflow-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-text-tertiary text-xs uppercase tracking-wider border-b border-border-subtle bg-bg-card">
                  <th className="text-left font-medium px-4 py-2.5">名称</th>
                  <th className="text-right font-medium px-4 py-2.5">字符数</th>
                  <th className="text-right font-medium px-4 py-2.5">片段数</th>
                  <th className="text-right font-medium px-4 py-2.5">上传时间</th>
                  <th className="text-center font-medium px-4 py-2.5 w-20">操作</th>
                </tr>
              </thead>
              <tbody>
                {docs.map((doc) => (
                  <tr
                    key={doc.id}
                    className="border-b border-border-subtle last:border-0 hover:bg-bg-hover/40 transition-colors group"
                  >
                    <td className="px-4 py-3 text-text-primary max-w-[300px] truncate">
                      <div className="flex items-center gap-2">
                        <FileText className="w-3.5 h-3.5 text-text-tertiary shrink-0" />
                        <span className="truncate">{doc.filename}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right text-text-secondary font-mono text-xs">
                      {doc.charCount.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-right text-text-secondary font-mono text-xs">
                      {doc.chunkCount}
                    </td>
                    <td className="px-4 py-3 text-right text-text-tertiary text-xs whitespace-nowrap">
                      {formatDate(doc.createdAt)}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={() => setConfirmDeleteDoc(doc)}
                        className="w-7 h-7 rounded-md flex items-center justify-center text-text-tertiary hover:text-danger hover:bg-bg-hover opacity-0 group-hover:opacity-100 transition-opacity mx-auto"
                        aria-label="删除"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SpotlightCard>
      )}

      {/* Upload dialog */}
      <Dialog
        open={uploadOpen}
        onOpenChange={(o) => {
          if (!o) { setUploadOpen(false); setUploadContent(""); setUploadFilename(""); }
        }}
      >
        <DialogContent className="sm:max-w-xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>上传文档</DialogTitle>
            <DialogDescription>
              支持 .txt / .md / .jsonl 文件格式，系统会自动切片并调用 {PROVIDER_LABELS[kb.embeddingProvider]} Embedding 向量化。
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>选择文件</Label>
              <input
                type="file"
                accept=".txt,.md,.mdx,.json,.jsonl"
                onChange={handleFileSelect}
                className="block w-full text-sm text-text-secondary file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:text-xs file:font-medium file:bg-primary-muted file:text-primary hover:file:bg-primary-muted/80"
              />
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label>或直接粘贴内容</Label>
                {uploadFilename && (
                  <span className="text-xs text-text-tertiary">{uploadFilename}</span>
                )}
              </div>
              <Textarea
                value={uploadContent}
                onChange={(e) => setUploadContent(e.target.value)}
                placeholder="在此粘贴文档内容..."
                rows={8}
                className="font-mono text-sm max-h-[40vh]"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => { setUploadOpen(false); setUploadContent(""); setUploadFilename(""); }}>
              取消
            </Button>
            <Button onClick={handleUpload} disabled={uploading || !uploadContent.trim()}>
              {uploading ? "处理中..." : "上传并向量化"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete KB confirm */}
      <Dialog
        open={confirmDeleteKb}
        onOpenChange={setConfirmDeleteKb}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>删除整个知识库？</DialogTitle>
            <DialogDescription>
              将删除「{kb.name}」及其下所有文档和向量片段，无法恢复。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmDeleteKb(false)}>
              取消
            </Button>
            <Button variant="destructive" onClick={handleDeleteKb}>
              确认删除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete doc confirm */}
      <Dialog
        open={!!confirmDeleteDoc}
        onOpenChange={(o) => !o && setConfirmDeleteDoc(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>删除文档？</DialogTitle>
            <DialogDescription>
              将删除「{confirmDeleteDoc?.filename}」及其全部向量片段，此操作不可撤销。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmDeleteDoc(null)}>
              取消
            </Button>
            <Button
              variant="destructive"
              onClick={() => confirmDeleteDoc && handleDeleteDoc(confirmDeleteDoc)}
            >
              确认删除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}