"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Plus, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { createTestCase, updateTestCase } from "@/lib/db/test-suites";
import type { TestCase, Turn } from "@/lib/types";

interface TestCaseDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  testSuiteId: string;
  suiteType?: "single-turn" | "multi-turn";
  initial?: TestCase;
  onSaved?: () => void;
}

export function TestCaseDialog({
  open,
  onOpenChange,
  testSuiteId,
  suiteType,
  initial,
  onSaved,
}: TestCaseDialogProps) {
  const isEdit = !!initial;
  const isMulti = suiteType === "multi-turn";
  const [input, setInput] = useState(initial?.input ?? "");
  const [expected, setExpected] = useState(initial?.expected ?? "");
  const [tagsText, setTagsText] = useState(initial?.tags.join(", ") ?? "");
  const [turns, setTurns] = useState<Turn[]>(initial?.turns ?? []);
  const [submitting, setSubmitting] = useState(false);

  // 每次打开重置
  if (open && !submitting && initial) {
    // noop — 初始值在初次渲染时设置；如需切换不同 case，外层应通过 key 强制重新挂载
  }

  async function handleSubmit() {
    if (!input.trim() && turns.length === 0) {
      toast.error("input 必填");
      return;
    }
    setSubmitting(true);
    try {
      const tags = tagsText
        .split(/[,，;；]/)
        .map((t) => t.trim())
        .filter(Boolean);
      const cleanTurns = isMulti
        ? turns.filter((t) => t.content.trim())
        : undefined;

      if (isEdit && initial) {
        await updateTestCase(initial.id, {
          input: input.trim(),
          expected: expected.trim(),
          tags,
          turns: cleanTurns,
        });
        toast.success("已更新");
      } else {
        await createTestCase({
          testSuiteId,
          input: input.trim(),
          expected: expected.trim(),
          tags,
          turns: cleanTurns,
        });
        toast.success("已添加");
        setInput("");
        setExpected("");
        setTagsText("");
        setTurns([]);
      }
      onSaved?.();
      onOpenChange(false);
    } catch (e) {
      toast.error(`保存失败：${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "编辑用例" : "添加用例"}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4 py-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor="tc-input">输入 (input) *</Label>
            <Textarea
              id="tc-input"
              placeholder="用户的输入内容"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              rows={3}
              autoFocus
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="tc-expected">期望 (expected)</Label>
            <Textarea
              id="tc-expected"
              placeholder="可选：期望的回复方向、关键点等"
              value={expected}
              onChange={(e) => setExpected(e.target.value)}
              rows={3}
            />
          </div>
          {/* Multi-turn turns editor */}
          {isMulti && (
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <Label>对话轮次</Label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    setTurns((prev) => [
                      ...prev,
                      { role: "user" as const, content: "" },
                    ])
                  }
                  className="h-7 px-2 text-xs"
                >
                  <Plus className="w-3 h-3" />
                  添加轮次
                </Button>
              </div>
              {turns.length === 0 && (
                <p className="text-[11px] text-text-tertiary">
                  不填则使用上方 input 作为单条用户消息
                </p>
              )}
              <div className="space-y-2">
                {turns.map((turn, idx) => (
                  <div key={idx} className="flex items-start gap-2">
                    <select
                      value={turn.role}
                      onChange={(e) =>
                        setTurns((prev) =>
                          prev.map((t, i) =>
                            i === idx
                              ? { ...t, role: e.target.value as "user" | "assistant" }
                              : t
                          )
                        )
                      }
                      className="h-8 w-20 shrink-0 rounded-md border border-border-subtle bg-bg-card text-xs text-text-primary px-1.5"
                    >
                      <option value="user">User</option>
                      <option value="assistant">助手</option>
                    </select>
                    <Textarea
                      value={turn.content}
                      onChange={(e) =>
                        setTurns((prev) =>
                          prev.map((t, i) =>
                            i === idx ? { ...t, content: e.target.value } : t
                          )
                        )
                      }
                      placeholder={turn.role === "user" ? "用户消息" : "AI 回复"}
                      rows={2}
                      className="flex-1 min-w-0 text-xs"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setTurns((prev) => prev.filter((_, i) => i !== idx))
                      }
                      className="w-6 h-6 rounded flex items-center justify-center text-text-tertiary hover:text-danger shrink-0 mt-1"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex flex-col gap-2">
            <Label htmlFor="tc-tags">标签</Label>
            <Input
              id="tc-tags"
              placeholder="逗号分隔，例如：退款, 政策"
              value={tagsText}
              onChange={(e) => setTagsText(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            取消
          </Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting ? "保存中..." : isEdit ? "保存" : "添加"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
