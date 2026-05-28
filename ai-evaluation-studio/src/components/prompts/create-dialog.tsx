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
import { createPrompt } from "@/lib/db/prompts";

interface CreatePromptDialogProps {
  trigger?: React.ReactNode;
  onCreated?: () => void;
}

export function CreatePromptDialog({
  trigger,
  onCreated,
}: CreatePromptDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    if (!name.trim()) {
      toast.error("请填写 Prompt 名称");
      return;
    }
    setSubmitting(true);
    try {
      const p = await createPrompt({ name: name.trim() });
      toast.success("Prompt 已创建");
      setOpen(false);
      setName("");
      onCreated?.();
      router.push(`/prompts/${p.id}`);
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
            新建 Prompt
          </Button>
        )}
      </span>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>新建 Prompt</DialogTitle>
            <DialogDescription>
              先起个名字，下一步进入详情页编辑 system prompt 和模板。
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2 py-2">
            <Label htmlFor="p-name">名称 *</Label>
            <Input
              id="p-name"
              placeholder="例如：客服回复-prompt"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={100}
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSubmit();
              }}
            />
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
