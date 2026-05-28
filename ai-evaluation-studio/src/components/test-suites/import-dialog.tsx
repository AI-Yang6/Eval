"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Upload, FileJson, FileText, AlertCircle, CheckCircle2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { bulkCreateTestCases } from "@/lib/db/test-suites";
import { parseJSONCases, parseCSVCases } from "@/lib/utils/import-parser";

interface ImportTestCasesDialogProps {
  testSuiteId: string;
  trigger?: React.ReactNode;
  onImported?: () => void;
}

const JSON_PLACEHOLDER = `[
  {"input": "我想退款", "expected": "引导退款流程", "tags": ["退款"]},
  {"input": "退款多久到账", "expected": "说明时效", "tags": ["退款", "政策"]}
]`;

const CSV_PLACEHOLDER = `input,expected,tags
我想退款,引导退款流程,退款
退款多久到账,说明时效,退款;政策`;

export function ImportTestCasesDialog({
  testSuiteId,
  trigger,
  onImported,
}: ImportTestCasesDialogProps) {
  const [open, setOpen] = useState(false);
  const [format, setFormat] = useState<"json" | "csv">("json");
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const content = await file.text();
    setText(content);
    if (file.name.endsWith(".csv")) setFormat("csv");
    else if (file.name.endsWith(".json")) setFormat("json");
  }

  async function handleSubmit() {
    if (!text.trim()) {
      toast.error("请粘贴或上传内容");
      return;
    }
    const result =
      format === "json" ? parseJSONCases(text) : parseCSVCases(text);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    if (result.cases.length === 0) {
      toast.error("未解析到任何用例");
      return;
    }

    setSubmitting(true);
    try {
      const count = await bulkCreateTestCases(testSuiteId, result.cases);
      toast.success(`成功导入 ${count} 条用例`);
      setOpen(false);
      setText("");
      onImported?.();
    } catch (e) {
      toast.error(`导入失败：${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setSubmitting(false);
    }
  }

  // 实时解析
  const parseResult = (() => {
    if (!text.trim()) return null;
    return format === "json" ? parseJSONCases(text) : parseCSVCases(text);
  })();

  return (
    <>
      <span onClick={() => setOpen(true)} className="inline-block">
        {trigger ?? (
          <Button variant="outline">
            <Upload className="w-4 h-4" />
            导入
          </Button>
        )}
      </span>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-2xl p-0 gap-0 flex flex-col max-h-[85vh]">
          {/* Header */}
          <DialogHeader className="px-6 pt-6 pb-4 border-b border-border-subtle shrink-0">
            <DialogTitle>导入测试用例</DialogTitle>
            <DialogDescription>
              支持 JSON / CSV 格式，可直接粘贴或上传文件
            </DialogDescription>
          </DialogHeader>

          {/* Format tabs + Status banner（粘性，始终可见） */}
          <div className="px-6 pt-4 pb-3 border-b border-border-subtle shrink-0 space-y-3">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <Tabs
                value={format}
                onValueChange={(v) => setFormat(v as "json" | "csv")}
              >
                <TabsList>
                  <TabsTrigger value="json">
                    <FileJson className="w-4 h-4" />
                    JSON
                  </TabsTrigger>
                  <TabsTrigger value="csv">
                    <FileText className="w-4 h-4" />
                    CSV
                  </TabsTrigger>
                </TabsList>
              </Tabs>
              <label className="text-xs text-primary hover:text-primary-hover cursor-pointer transition-colors flex items-center gap-1">
                <Upload className="w-3 h-3" />
                <input
                  type="file"
                  accept=".json,.csv"
                  onChange={handleFileUpload}
                  className="hidden"
                />
                选择文件...
              </label>
            </div>

            {/* 实时状态 banner */}
            {parseResult && (
              <div
                className={`flex items-start gap-2 px-3 py-2 rounded-md text-xs ${
                  parseResult.error
                    ? "bg-[rgba(239,68,68,0.08)] border border-[rgba(239,68,68,0.2)] text-danger"
                    : "bg-[rgba(16,185,129,0.08)] border border-[rgba(16,185,129,0.2)] text-success"
                }`}
              >
                {parseResult.error ? (
                  <>
                    <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                    <span>{parseResult.error}</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                    <span>
                      已解析 <strong>{parseResult.cases.length}</strong> 条用例，可点击下方导入
                    </span>
                  </>
                )}
              </div>
            )}

            {!parseResult && (
              <div className="text-xs text-text-tertiary">
                {format === "json" ? (
                  <>
                    每条用例为对象，必填{" "}
                    <code className="text-primary">input</code>，可选{" "}
                    <code className="text-primary">expected</code>、
                    <code className="text-primary">tags</code>（数组）。
                  </>
                ) : (
                  <>
                    第一行为表头：
                    <code className="text-primary">input,expected,tags</code>，tags 用分号分隔。
                  </>
                )}
              </div>
            )}
          </div>

          {/* 内容区（可滚动） */}
          <div className="flex-1 overflow-y-auto px-6 py-4 min-h-0">
            <div className="flex flex-col gap-2">
              <Label htmlFor="import-text">内容</Label>
              <Textarea
                id="import-text"
                placeholder={
                  format === "json" ? JSON_PLACEHOLDER : CSV_PLACEHOLDER
                }
                value={text}
                onChange={(e) => setText(e.target.value)}
                className="font-mono text-xs min-h-[180px] max-h-[240px] resize-none"
              />
            </div>

            {/* 预览（独立滚动） */}
            {parseResult && !parseResult.error && parseResult.cases.length > 0 && (
              <div className="mt-4 bg-bg-base border border-border-subtle rounded-md overflow-hidden">
                <div className="px-3 py-2 border-b border-border-subtle bg-bg-card flex items-center justify-between">
                  <span className="text-xs text-text-secondary font-medium">
                    预览全部 {parseResult.cases.length} 条
                  </span>
                  <span className="text-xs text-text-tertiary">↕ 可滚动</span>
                </div>
                <div className="max-h-[200px] overflow-y-auto">
                  <div className="divide-y divide-border-subtle">
                    {parseResult.cases.map((c, i) => (
                      <div
                        key={i}
                        className="px-3 py-2 text-xs hover:bg-bg-hover/50 transition-colors"
                      >
                        <div className="flex items-start gap-2">
                          <span className="text-text-tertiary font-mono shrink-0 w-6">
                            {i + 1}.
                          </span>
                          <div className="flex-1 min-w-0">
                            <div className="text-text-primary truncate">
                              {c.input}
                            </div>
                            {c.expected && (
                              <div className="text-text-tertiary truncate mt-0.5">
                                → {c.expected}
                              </div>
                            )}
                            {c.tags && c.tags.length > 0 && (
                              <div className="flex flex-wrap gap-1 mt-1">
                                {c.tags.map((t) => (
                                  <span
                                    key={t}
                                    className="text-[10px] px-1.5 py-0.5 rounded bg-primary-muted text-primary"
                                  >
                                    {t}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <DialogFooter className="px-6 py-4 border-t border-border-subtle shrink-0">
            <Button
              variant="ghost"
              onClick={() => setOpen(false)}
              disabled={submitting}
            >
              取消
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={
                submitting ||
                !parseResult ||
                !!parseResult.error ||
                parseResult.cases.length === 0
              }
            >
              {submitting
                ? "导入中..."
                : parseResult && !parseResult.error
                  ? `导入 ${parseResult.cases.length} 条`
                  : "导入"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
