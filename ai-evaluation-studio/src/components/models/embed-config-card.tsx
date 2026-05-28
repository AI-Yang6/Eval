"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Eye, EyeOff, Save, Trash2, CheckCircle2, Circle } from "lucide-react";

import { SpotlightCard } from "@/components/ui/spotlight-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  getEmbedConfig,
  upsertEmbedConfig,
  deleteEmbedConfig,
} from "@/lib/db/embed-config";
import type { EmbedConfig } from "@/lib/types";

function maskKey(key: string): string {
  if (!key) return "";
  if (key.length <= 10) return "•".repeat(key.length);
  return `${key.slice(0, 5)}${"•".repeat(8)}${key.slice(-4)}`;
}

interface Props {
  onChanged: () => void;
}

export function EmbedConfigCard({ onChanged }: Props) {
  const [cfg, setCfg] = useState<EmbedConfig | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [baseURL, setBaseURL] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    getEmbedConfig().then((c) => {
      setCfg(c ?? null);
    });
  }, []);

  async function handleSave() {
    if (!apiKey.trim()) {
      toast.error("API Key 不能为空");
      return;
    }
    setSaving(true);
    try {
      await upsertEmbedConfig({ apiKey: apiKey.trim(), baseURL: baseURL.trim() || undefined });
      toast.success("Embedding 统一配置已保存");
      setCfg({ id: "global", apiKey: apiKey.trim(), baseURL: baseURL.trim() || undefined });
      setEditing(false);
      onChanged();
    } catch (e) {
      toast.error(`保存失败：${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setSaving(false);
    }
  }

  async function handleClear() {
    try {
      await deleteEmbedConfig();
      toast.success("Embedding 统一配置已清除");
      setCfg(null);
      setApiKey("");
      setBaseURL("");
      setEditing(false);
      onChanged();
    } catch (e) {
      toast.error(`清除失败：${e instanceof Error ? e.message : String(e)}`);
    }
  }

  function startEdit() {
    setApiKey(cfg?.apiKey ?? "");
    setBaseURL(cfg?.baseURL ?? "");
    setShowKey(false);
    setEditing(true);
  }

  return (
    <SpotlightCard className="p-5">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="font-semibold text-text-primary">
              Embedding 统一配置
            </span>
            {cfg ? (
              <Badge
                variant="secondary"
                className="bg-primary-muted text-primary border-[rgba(124,92,252,0.2)] text-[10px] px-1.5 py-0"
              >
                已配置
              </Badge>
            ) : (
              <Badge
                variant="secondary"
                className="bg-bg-hover text-text-tertiary border-border-subtle text-[10px] px-1.5 py-0"
              >
                未配置
              </Badge>
            )}
          </div>
          <p className="text-xs text-text-tertiary mt-1 leading-relaxed">
            配置后优先用于知识库 Embedding 调用。如未配置，则使用各 Provider 自身的 API Key。
          </p>
        </div>
        {!editing && (
          <Button size="sm" variant="outline" onClick={startEdit}>
            配置
          </Button>
        )}
      </div>

      {editing ? (
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>API Key</Label>
            <div className="relative">
              <Input
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                type={showKey ? "text" : "password"}
                placeholder="sk-..."
                className="pr-9 font-mono text-sm"
                autoComplete="off"
              />
              <button
                type="button"
                onClick={() => setShowKey(!showKey)}
                className="absolute right-2 top-1/2 -translate-y-1/2 w-6 h-6 flex items-center justify-center text-text-tertiary hover:text-text-primary transition-colors"
                tabIndex={-1}
              >
                {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Base URL（可选）</Label>
            <Input
              value={baseURL}
              onChange={(e) => setBaseURL(e.target.value)}
              placeholder="https://api.openai.com/v1"
              className="font-mono text-sm"
              autoComplete="off"
            />
            <p className="text-[11px] text-text-tertiary">
              留空则使用各 Provider 默认地址
            </p>
          </div>
          <div className="flex items-center gap-2 pt-1">
            <Button size="sm" onClick={handleSave} disabled={saving}>
              <Save className="w-3.5 h-3.5" />
              {saving ? "保存中..." : "保存"}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
              取消
            </Button>
            {cfg && (
              <Button size="sm" variant="destructive" onClick={handleClear} className="ml-auto">
                <Trash2 className="w-3.5 h-3.5" />
                清除
              </Button>
            )}
          </div>
        </div>
      ) : cfg ? (
        <div className="flex items-center gap-2 text-sm">
          <CheckCircle2 className="w-4 h-4 text-primary shrink-0" />
          <span className="text-text-secondary font-mono">{maskKey(cfg.apiKey)}</span>
          {cfg.baseURL && (
            <>
              <span className="text-text-tertiary">·</span>
              <span className="text-text-tertiary font-mono text-xs truncate max-w-[300px]">
                {cfg.baseURL}
              </span>
            </>
          )}
        </div>
      ) : (
        <div className="flex items-center gap-2 text-sm text-text-tertiary">
          <Circle className="w-4 h-4 shrink-0" />
          <span>未配置，将使用各 Provider 自身的 API Key</span>
        </div>
      )}
    </SpotlightCard>
  );
}
