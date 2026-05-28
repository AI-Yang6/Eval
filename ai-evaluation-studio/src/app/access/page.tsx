"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { ArrowRight, LockKeyhole, Shield } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SpotlightCard } from "@/components/ui/spotlight-card";

function AccessForm() {
  const router = useRouter();
  const search = useSearchParams();
  const next = search.get("next") || "/";
  const [code, setCode] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    if (!code.trim()) {
      toast.error("请输入访问码");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/access", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code: code.trim() }),
      });
      const data = await res.json();
      if (!data.ok) {
        toast.error(data.error ?? "访问码不正确");
        return;
      }
      router.replace(next);
      router.refresh();
    } catch (e) {
      toast.error(`验证失败：${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen px-6 py-10 bg-bg-base text-text-primary flex items-center justify-center">
      <div className="w-full max-w-md">
        <SpotlightCard className="p-6 sm:p-8">
          <div className="w-12 h-12 rounded-md bg-primary-muted border border-[rgba(124,92,252,0.2)] flex items-center justify-center mb-5">
            <LockKeyhole className="w-6 h-6 text-primary" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight mb-2">
            访问 AI Evaluation Studio
          </h1>
          <p className="text-sm text-text-secondary leading-relaxed mb-6">
            这是公开演示版。请输入访问码后继续使用，避免未授权访问模型评估接口。
          </p>

          <div className="space-y-2 mb-5">
            <Label htmlFor="access-code">访问码</Label>
            <Input
              id="access-code"
              type="password"
              autoFocus
              value={code}
              onChange={(e) => setCode(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void submit();
              }}
              placeholder="输入访问码"
            />
          </div>

          <Button
            className="w-full"
            onClick={submit}
            disabled={submitting}
          >
            {submitting ? "验证中..." : "进入工作台"}
            <ArrowRight className="w-4 h-4" />
          </Button>

          <div className="mt-5 pt-5 border-t border-border-subtle flex items-start gap-2 text-xs text-text-tertiary leading-relaxed">
            <Shield className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <p>
              数据默认保存在你的浏览器 IndexedDB 中。API Key 由用户自持，仅在调用所选模型 Provider 时转发。
              <Link href="/privacy" className="text-primary hover:underline ml-1">
                查看隐私说明
              </Link>
            </p>
          </div>
        </SpotlightCard>
      </div>
    </div>
  );
}

export default function AccessPage() {
  return (
    <Suspense fallback={null}>
      <AccessForm />
    </Suspense>
  );
}
