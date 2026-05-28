"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createTestSuite } from "@/lib/db/test-suites";

interface CreateTestSuiteDialogProps {
  trigger?: React.ReactNode;
  onCreated?: () => void;
}

export function CreateTestSuiteDialog({
  trigger,
  onCreated,
}: CreateTestSuiteDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [type, setType] = useState<"single-turn" | "multi-turn">("single-turn");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    if (!name.trim()) {
      toast.error("请填写测试集名称");
      return;
    }
    setSubmitting(true);
    try {
      const suite = await createTestSuite({
        name: name.trim(),
        description: description.trim(),
        type,
      });
      toast.success("测试集已创建");
      setOpen(false);
      setName("");
      setDescription("");
      setType("single-turn");
      onCreated?.();
      router.push(`/test-suites/${suite.id}`);
    } catch (e) {
      toast.error(`创建失败：${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <span onClick={() => setOpen(true)} className="inline-block">
        {trigger ?? (
          <Button>
            <Plus className="w-4 h-4" />
            新建测试集
          </Button>
        )}
      </span>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>新建测试集</DialogTitle>
            <DialogDescription>
              测试集是一组用例的集合，用于多次评估的公平对比。
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4 py-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="ts-name">名称 *</Label>
              <Input
                id="ts-name"
                placeholder="例如：客服场景-退款流程"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={100}
                autoFocus
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="ts-desc">描述</Label>
              <Textarea
                id="ts-desc"
                placeholder="可选：这个测试集覆盖什么场景？"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                maxLength={500}
                rows={3}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="ts-type">类型</Label>
              <Select
                value={type}
                onValueChange={(v) =>
                  setType(v as "single-turn" | "multi-turn")
                }
              >
                <SelectTrigger id="ts-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="single-turn">单轮对话</SelectItem>
                  <SelectItem value="multi-turn">对话序列（多轮）</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setOpen(false)}
              disabled={submitting}
            >
              取消
            </Button>
            <Button onClick={handleSubmit} disabled={submitting}>
              {submitting ? "创建中..." : "创建"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
