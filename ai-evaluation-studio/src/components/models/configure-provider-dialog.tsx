"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Eye, EyeOff, Loader2, CheckCircle2, AlertCircle, Link as LinkIcon } from "lucide-react";

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
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

import {
  MODEL_PRESETS,
  PROVIDER_LABELS,
  PROVIDER_DEFAULT_BASE_URL,
  PROVIDER_KEY_PLACEHOLDER,
} from "@/lib/model-adapters/presets";
import { upsertModelConfig, getModelConfig } from "@/lib/db/models";
import type { ModelProvider } from "@/lib/types";

interface ConfigureProviderDialogProps {
  provider: ModelProvider;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: () => void;
}

type TestState =
  | { status: "idle" }
  | { status: "testing" }
  | { status: "ok"; sample: string }
  | { status: "error"; message: string };

export function ConfigureProviderDialog({
  provider,
  open,
  onOpenChange,
  onSaved,
}: ConfigureProviderDialogProps) {
  const presets = MODEL_PRESETS[provider];
  const defaultBase = PROVIDER_DEFAULT_BASE_URL[provider];
  const [apiKey, setApiKey] = useState("");
  const [baseURL, setBaseURL] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [enabledIds, setEnabledIds] = useState<Set<string>>(new Set());
  const [test, setTest] = useState<TestState>({ status: "idle" });
  const [saving, setSaving] = useState(false);

  // 打开时加载已有配置
  useEffect(() => {
    if (!open) return;
    let active = true;
    (async () => {
      const cfg = await getModelConfig(provider);
      if (!active) return;
      if (cfg) {
        setApiKey(cfg.apiKey);
        setBaseURL(cfg.baseURL ?? "");
        setEnabledIds(
          new Set(cfg.models.filter((m) => m.enabled).map((m) => m.modelId))
        );
      } else {
        setApiKey("");
        setBaseURL("");
        setEnabledIds(new Set(presets.map((p) => p.modelId)));
      }
      setTest({ status: "idle" });
      setShowKey(false);
    })();
    return () => {
      active = false;
    };
  }, [open, provider, presets]);

  function toggleModel(modelId: string) {
    setEnabledIds((prev) => {
      const next = new Set(prev);
      if (next.has(modelId)) next.delete(modelId);
      else next.add(modelId);
      return next;
    });
  }

  async function handleTest() {
    if (!apiKey.trim()) {
      toast.error("请先填写 API Key");
      return;
    }
    setTest({ status: "testing" });
    try {
      const res = await fetch("/api/test-connection", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          provider,
          apiKey: apiKey.trim(),
          baseURL: baseURL.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        setTest({ status: "ok", sample: data.sample ?? "" });
      } else {
        setTest({ status: "error", message: data.error ?? "未知错误" });
      }
    } catch (e) {
      setTest({
        status: "error",
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }

  async function handleSave() {
    if (!apiKey.trim()) {
      toast.error("API Key 不能为空");
      return;
    }
    if (enabledIds.size === 0) {
      toast.error("至少勾选一个模型");
      return;
    }
    setSaving(true);
    try {
      await upsertModelConfig({
        provider,
        apiKey: apiKey.trim(),
        baseURL: baseURL.trim() || undefined,
        enabledModelIds: Array.from(enabledIds),
      });
      toast.success(`${PROVIDER_LABELS[provider]} 配置已保存`);
      onSaved?.();
      onOpenChange(false);
    } catch (e) {
      toast.error(`保存失败：${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg overflow-hidden">
        <DialogHeader>
          <DialogTitle>配置 {PROVIDER_LABELS[provider]}</DialogTitle>
          <DialogDescription className="break-words">
            填入 API Key 并勾选要使用的模型，所有数据仅保存在浏览器本地。
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-5 py-2 min-w-0">
          {/* API Key */}
          <div className="flex flex-col gap-2">
            <Label htmlFor="api-key">API Key *</Label>
            <div className="relative">
              <Input
                id="api-key"
                type={showKey ? "text" : "password"}
                placeholder={PROVIDER_KEY_PLACEHOLDER[provider]}
                value={apiKey}
                onChange={(e) => {
                  setApiKey(e.target.value);
                  setTest({ status: "idle" });
                }}
                className="pr-10 font-mono"
                autoComplete="off"
              />
              <button
                type="button"
                onClick={() => setShowKey((v) => !v)}
                className="absolute top-1/2 right-2 -translate-y-1/2 text-text-tertiary hover:text-text-primary p-1"
                aria-label={showKey ? "隐藏" : "显示"}
              >
                {showKey ? (
                  <EyeOff className="w-4 h-4" />
                ) : (
                  <Eye className="w-4 h-4" />
                )}
              </button>
            </div>
          </div>

          {/* BaseURL（仅对 OpenAI 兼容协议显示） */}
          {provider !== "anthropic" && (
            <div className="flex flex-col gap-2">
              <Label htmlFor="base-url" className="flex items-center gap-1.5">
                <LinkIcon className="w-3.5 h-3.5 text-text-tertiary" />
                Base URL
                <span className="text-xs text-text-tertiary font-normal">
                  （可选，留空使用默认）
                </span>
              </Label>
              <Input
                id="base-url"
                type="text"
                placeholder={defaultBase ?? "https://api.openai.com/v1"}
                value={baseURL}
                onChange={(e) => {
                  setBaseURL(e.target.value);
                  setTest({ status: "idle" });
                }}
                className="font-mono text-xs"
                autoComplete="off"
              />
              {defaultBase && !baseURL && (
                <p className="text-[11px] text-text-tertiary font-mono">
                  默认：{defaultBase}
                </p>
              )}
            </div>
          )}

          {/* 测试连接 */}
          <div className="flex items-center gap-2 flex-wrap min-w-0">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleTest}
              disabled={test.status === "testing" || !apiKey.trim()}
            >
              {test.status === "testing" ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : null}
              {test.status === "testing" ? "测试中..." : "测试连接"}
            </Button>
            {test.status === "ok" && (
              <span className="flex items-center gap-1.5 text-xs text-success">
                <CheckCircle2 className="w-3.5 h-3.5" />
                连接成功
              </span>
            )}
            {test.status === "error" && (
              <span className="flex items-center gap-1.5 text-xs text-danger min-w-0 flex-1">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate" title={test.message}>
                  {test.message}
                </span>
              </span>
            )}
          </div>

          {/* Models */}
          <div className="flex flex-col gap-2">
            <Label>启用模型 *</Label>
            <div className="border border-border-subtle rounded-md divide-y divide-border-subtle max-h-[260px] overflow-y-auto">
              {presets.map((p) => {
                const checked = enabledIds.has(p.modelId);
                return (
                  <button
                    key={p.modelId}
                    type="button"
                    onClick={() => toggleModel(p.modelId)}
                    className={cn(
                      "w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors",
                      checked
                        ? "bg-primary-muted/40"
                        : "hover:bg-bg-hover"
                    )}
                  >
                    <span
                      className={cn(
                        "w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors",
                        checked
                          ? "bg-primary border-primary"
                          : "border-border-default"
                      )}
                    >
                      {checked && (
                        <svg
                          viewBox="0 0 12 12"
                          className="w-3 h-3 text-white"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                        >
                          <path d="M2.5 6.5l2.5 2.5 4.5-5" />
                        </svg>
                      )}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-sm font-medium text-text-primary">
                          {p.label}
                        </span>
                        <Badge
                          variant="secondary"
                          className="bg-bg-hover text-text-tertiary border-border-subtle font-mono text-[10px] px-1.5 py-0 max-w-[140px] truncate"
                        >
                          {p.modelId}
                        </Badge>
                      </div>
                      <div className="text-[11px] text-text-tertiary font-mono">
                        in ${p.inputPricePer1k}/1k · out ${p.outputPricePer1k}/1k
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
            <p className="text-xs text-text-tertiary">
              已勾选 <span className="text-primary font-medium">{enabledIds.size}</span> /{" "}
              {presets.length} 个预设模型
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            取消
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "保存中..." : "保存配置"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
