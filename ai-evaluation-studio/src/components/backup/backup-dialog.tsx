"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Download, Upload, AlertCircle, Database } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { exportAll, importAll, type BackupPayload } from "@/lib/db/backup";

interface BackupDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImported?: () => void;
}

export function BackupDialog({
  open,
  onOpenChange,
  onImported,
}: BackupDialogProps) {
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [pendingFile, setPendingFile] = useState<{
    payload: BackupPayload;
    fileName: string;
  } | null>(null);
  const [confirmMode, setConfirmMode] = useState<"merge" | "replace">("merge");

  async function handleExport() {
    setExporting(true);
    try {
      const payload = await exportAll();
      const blob = new Blob([JSON.stringify(payload, null, 2)], {
        type: "application/json;charset=utf-8",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
      a.href = url;
      a.download = `eval-studio-backup-${ts}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(
        `已导出 ${payload.testSuites.length} 个测试集、${payload.prompts.length} 个 Prompt、${payload.knowledgeBases.length} 个知识库、${payload.evalRuns.length} 次评估` +
        (payload.embedConfig ? "、Embedding 统一配置" : "")
      );
    } catch (e) {
      toast.error(`导出失败：${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setExporting(false);
    }
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const payload = JSON.parse(text) as BackupPayload;
      if (typeof payload !== "object" || !payload || !payload.version) {
        throw new Error("文件格式不正确");
      }
      setPendingFile({ payload, fileName: file.name });
    } catch (err) {
      toast.error(`文件解析失败：${err instanceof Error ? err.message : String(err)}`);
    }
    // reset 让同一个文件能重复选
    e.target.value = "";
  }

  async function confirmImport() {
    if (!pendingFile) return;
    setImporting(true);
    try {
      const summary = await importAll(pendingFile.payload, confirmMode);
      toast.success(
        `导入完成：${summary.testSuites} 个测试集 · ${summary.prompts} 个 Prompt · ${summary.knowledgeBases} 个知识库 · ${summary.evalRuns} 次评估${summary.embedConfig ? " · Embedding 统一配置" : ""}`
      );
      setPendingFile(null);
      onImported?.();
      onOpenChange(false);
    } catch (e) {
      toast.error(`导入失败：${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setImporting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Database className="w-4 h-4" />
            数据备份与恢复
          </DialogTitle>
          <DialogDescription>
            所有数据存在浏览器 IndexedDB
            里。建议定期导出备份；换设备、清缓存前务必先导出。
          </DialogDescription>
        </DialogHeader>

        {!pendingFile ? (
          <div className="flex flex-col gap-3 py-2">
            <div className="rounded-md border border-border-subtle bg-bg-base p-4">
              <div className="flex items-start gap-3 mb-3">
                <div className="w-8 h-8 rounded-md bg-primary-muted border border-[rgba(124,92,252,0.2)] flex items-center justify-center shrink-0">
                  <Download className="w-4 h-4 text-primary" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-text-primary">
                    导出全部数据
                  </div>
                  <div className="text-xs text-text-tertiary mt-0.5">
                    打包成 JSON，包含测试集、Prompt、模型配置、评估历史
                  </div>
                </div>
              </div>
              <Button
                onClick={handleExport}
                disabled={exporting}
                variant="outline"
                size="sm"
                className="w-full"
              >
                {exporting ? "导出中..." : "下载备份文件"}
              </Button>
            </div>

            <div className="rounded-md border border-border-subtle bg-bg-base p-4">
              <div className="flex items-start gap-3 mb-3">
                <div className="w-8 h-8 rounded-md bg-primary-muted border border-[rgba(124,92,252,0.2)] flex items-center justify-center shrink-0">
                  <Upload className="w-4 h-4 text-primary" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-text-primary">
                    从备份恢复
                  </div>
                  <div className="text-xs text-text-tertiary mt-0.5">
                    上传之前导出的 JSON 文件
                  </div>
                </div>
              </div>
              <label className="block">
                <input
                  type="file"
                  accept=".json,application/json"
                  onChange={handleFileChange}
                  className="hidden"
                />
                <span className="block text-center h-7 px-2.5 rounded-md text-[0.8rem] font-medium border border-border bg-background hover:bg-muted cursor-pointer leading-7 text-text-primary">
                  选择备份文件...
                </span>
              </label>
            </div>

            <div className="text-[11px] text-text-tertiary leading-relaxed px-1">
              API Key 也会被打包到备份文件里，请妥善保管。
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-3 py-2">
            <div className="rounded-md border border-border-subtle bg-bg-base p-4">
              <div className="text-xs text-text-tertiary mb-2">
                文件：
                <span className="font-mono text-text-secondary ml-1">
                  {pendingFile.fileName}
                </span>
              </div>
              <div className="text-xs text-text-tertiary">
                导出时间：
                <span className="text-text-secondary ml-1">
                  {new Date(pendingFile.payload.exportedAt).toLocaleString()}
                </span>
              </div>
              <div className="text-xs text-text-tertiary mt-2">
                包含：
                <span className="text-text-secondary ml-1">
                  {pendingFile.payload.testSuites.length} 个测试集 ·{" "}
                  {pendingFile.payload.prompts.length} 个 Prompt ·{" "}
                  {pendingFile.payload.knowledgeBases.length} 个知识库 ·{" "}
                  {pendingFile.payload.evalRuns.length} 次评估
                  {pendingFile.payload.embedConfig ? " · Embedding 统一配置" : ""}
                </span>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <label className="flex items-start gap-2 cursor-pointer p-2 rounded-md hover:bg-bg-hover">
                <input
                  type="radio"
                  checked={confirmMode === "merge"}
                  onChange={() => setConfirmMode("merge")}
                  className="mt-1"
                />
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-text-primary">合并到现有数据</div>
                  <div className="text-xs text-text-tertiary">
                    保留本地已有数据，相同 ID 的会被备份内容覆盖
                  </div>
                </div>
              </label>
              <label className="flex items-start gap-2 cursor-pointer p-2 rounded-md hover:bg-bg-hover">
                <input
                  type="radio"
                  checked={confirmMode === "replace"}
                  onChange={() => setConfirmMode("replace")}
                  className="mt-1"
                />
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-text-primary">
                    清空并替换
                    <span className="text-danger ml-1.5 text-xs">慎选</span>
                  </div>
                  <div className="text-xs text-text-tertiary">
                    先删除本地全部数据，再导入备份。无法恢复
                  </div>
                </div>
              </label>
            </div>

            {confirmMode === "replace" && (
              <div className="flex items-start gap-2 px-3 py-2 rounded-md bg-[rgba(239,68,68,0.08)] border border-[rgba(239,68,68,0.2)] text-xs text-danger">
                <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                <span>本地全部数据将被永久删除</span>
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          {pendingFile ? (
            <>
              <Button
                variant="ghost"
                onClick={() => setPendingFile(null)}
                disabled={importing}
              >
                返回
              </Button>
              <Button
                onClick={confirmImport}
                disabled={importing}
                variant={confirmMode === "replace" ? "destructive" : "default"}
              >
                {importing
                  ? "导入中..."
                  : confirmMode === "replace"
                  ? "确认替换"
                  : "确认导入"}
              </Button>
            </>
          ) : (
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              关闭
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
