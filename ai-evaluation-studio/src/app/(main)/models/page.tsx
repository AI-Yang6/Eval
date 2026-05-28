"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Cpu,
  Plus,
  Settings,
  Trash2,
  CheckCircle2,
  Circle,
  Inbox,
  MoreHorizontal,
  X,
} from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/layout/empty-state";
import { SpotlightCard } from "@/components/ui/spotlight-card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import { ConfigureProviderDialog } from "@/components/models/configure-provider-dialog";
import { EmbedConfigCard } from "@/components/models/embed-config-card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  MODEL_PRESETS,
  PROVIDER_LABELS,
  PROVIDER_GLYPH,
} from "@/lib/model-adapters/presets";
import {
  listModelConfigs,
  deleteModelConfig,
  toggleModelEnabled,
  addCustomModel,
  removeCustomModel,
} from "@/lib/db/models";
import type { ModelConfig, ModelProvider } from "@/lib/types";
import { cn } from "@/lib/utils";

const PROVIDERS: ModelProvider[] = [
  "openai",
  "anthropic",
  "deepseek",
  "qwen",
  "glm",
  "kimi",
  "doubao",
  "minimax",
];

function maskKey(key: string): string {
  if (!key) return "";
  if (key.length <= 10) return "•".repeat(key.length);
  return `${key.slice(0, 5)}${"•".repeat(8)}${key.slice(-4)}`;
}

export default function ModelsPage() {
  const [configs, setConfigs] = useState<ModelConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingProvider, setEditingProvider] = useState<ModelProvider | null>(
    null
  );
  const [confirmDelete, setConfirmDelete] = useState<ModelProvider | null>(null);
  const [addCustomProvider, setAddCustomProvider] =
    useState<ModelProvider | null>(null);
  const [customForm, setCustomForm] = useState({
    modelId: "",
    label: "",
    inputPricePer1k: "0",
    outputPricePer1k: "0",
  });
  const [addingCustom, setAddingCustom] = useState(false);

  async function refresh() {
    try {
      const list = await listModelConfigs();
      setConfigs(list);
    } catch (e) {
      toast.error(`加载失败：${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void Promise.resolve().then(refresh);
  }, []);

  const configByProvider = new Map<ModelProvider, ModelConfig>();
  for (const c of configs) configByProvider.set(c.provider, c);

  async function handleToggle(
    provider: ModelProvider,
    modelId: string,
    enabled: boolean
  ) {
    try {
      await toggleModelEnabled(provider, modelId, enabled);
      refresh();
    } catch (e) {
      toast.error(`更新失败：${e instanceof Error ? e.message : String(e)}`);
    }
  }

  async function handleDelete(provider: ModelProvider) {
    try {
      await deleteModelConfig(provider);
      toast.success(`已删除 ${PROVIDER_LABELS[provider]} 配置`);
      setConfirmDelete(null);
      refresh();
    } catch (e) {
      toast.error(`删除失败：${e instanceof Error ? e.message : String(e)}`);
    }
  }

  async function handleAddCustomModel() {
    if (!addCustomProvider) return;
    const id = customForm.modelId.trim();
    if (!id) {
      toast.error("Model ID 不能为空");
      return;
    }
    const inP = Number(customForm.inputPricePer1k);
    const outP = Number(customForm.outputPricePer1k);
    if (Number.isNaN(inP) || Number.isNaN(outP) || inP < 0 || outP < 0) {
      toast.error("价格必须是非负数字");
      return;
    }
    setAddingCustom(true);
    try {
      await addCustomModel(addCustomProvider, {
        modelId: id,
        label: customForm.label.trim() || id,
        inputPricePer1k: inP,
        outputPricePer1k: outP,
      });
      toast.success(`已添加 ${customForm.label.trim() || id}`);
      setAddCustomProvider(null);
      setCustomForm({ modelId: "", label: "", inputPricePer1k: "0", outputPricePer1k: "0" });
      refresh();
    } catch (e) {
      toast.error(`添加失败：${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setAddingCustom(false);
    }
  }

  async function handleRemoveCustomModel(provider: ModelProvider, modelId: string) {
    try {
      await removeCustomModel(provider, modelId);
      toast.success("已移除自定义模型");
      refresh();
    } catch (e) {
      toast.error(`移除失败：${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return (
    <div className="px-6 sm:px-10 lg:px-12 py-8 max-w-6xl mx-auto">
      <PageHeader
        icon={Cpu}
        title="模型"
        description="配置 OpenAI、Anthropic 与国产 Provider 的 API Key，选择评估时可调用的模型。所有数据仅保存在浏览器本地。"
      />

      {loading ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-64 rounded-lg" />
          ))}
        </div>
      ) : configs.length === 0 ? (
        <SpotlightCard className="border-dashed">
          <EmptyState
            icon={Inbox}
            title="还没有配置任何模型"
            description="选择一个 Provider 开始配置 API Key（国产 Provider 走 OpenAI 兼容协议，可在弹窗内自定义 Base URL）"
            action={
              <div className="flex items-center gap-2 flex-wrap justify-center max-w-2xl">
                {PROVIDERS.map((p) => (
                  <Button
                    key={p}
                    variant="outline"
                    size="sm"
                    onClick={() => setEditingProvider(p)}
                  >
                    <span>{PROVIDER_GLYPH[p]}</span>
                    {PROVIDER_LABELS[p]}
                  </Button>
                ))}
              </div>
            }
          />
        </SpotlightCard>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {PROVIDERS.map((provider) => {
            const cfg = configByProvider.get(provider);
            const presets = MODEL_PRESETS[provider];
            const enabledCount = cfg
              ? cfg.models.filter((m) => m.enabled).length
              : 0;

            return (
              <SpotlightCard key={provider} className="p-5">
                <div className="flex items-start justify-between gap-2 mb-4">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="text-2xl shrink-0">
                      {PROVIDER_GLYPH[provider]}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="font-semibold text-text-primary">
                          {PROVIDER_LABELS[provider]}
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
                      <div className="text-xs text-text-tertiary font-mono">
                        {cfg ? maskKey(cfg.apiKey) : `${presets.length} 个可用模型`}
                      </div>
                    </div>
                  </div>

                  {cfg ? (
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        className="w-7 h-7 rounded-md flex items-center justify-center text-text-tertiary hover:text-text-primary hover:bg-bg-hover transition-colors outline-none focus-visible:bg-bg-hover data-[state=open]:bg-bg-hover data-[state=open]:text-text-primary"
                        aria-label="更多操作"
                      >
                        <MoreHorizontal className="w-4 h-4" />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="min-w-[140px]">
                        <DropdownMenuItem
                          onClick={() => {
                            // 延迟一帧，等 menu 完成关闭再开 Dialog，避免焦点冲突
                            setTimeout(() => setEditingProvider(provider), 0);
                          }}
                        >
                          <Settings className="w-3.5 h-3.5" />
                          编辑配置
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => {
                            setTimeout(() => setConfirmDelete(provider), 0);
                          }}
                          className="text-danger focus:text-danger focus:bg-[rgba(239,68,68,0.08)]"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          删除
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  ) : (
                    <Button
                      size="sm"
                      onClick={() => setEditingProvider(provider)}
                    >
                      <Plus className="w-3.5 h-3.5" />
                      配置
                    </Button>
                  )}
                </div>

                {/* Model list */}
                <div className="border border-border-subtle rounded-md divide-y divide-border-subtle">
                  {presets.map((p) => {
                    const def = cfg?.models.find((m) => m.modelId === p.modelId);
                    const enabled = def?.enabled ?? false;
                    const disabled = !cfg;
                    return (
                      <button
                        key={p.modelId}
                        type="button"
                        disabled={disabled}
                        onClick={() =>
                          def && handleToggle(provider, p.modelId, !enabled)
                        }
                        className={cn(
                          "w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors",
                          disabled
                            ? "opacity-50 cursor-not-allowed"
                            : enabled
                            ? "hover:bg-primary-muted/30"
                            : "hover:bg-bg-hover"
                        )}
                      >
                        {enabled ? (
                          <CheckCircle2 className="w-4 h-4 text-primary shrink-0" />
                        ) : (
                          <Circle className="w-4 h-4 text-text-tertiary shrink-0" />
                        )}
                        <div className="flex-1 min-w-0 flex items-center gap-2">
                          <span
                            className={cn(
                              "text-sm",
                              enabled
                                ? "text-text-primary font-medium"
                                : "text-text-secondary"
                            )}
                          >
                            {p.label}
                          </span>
                          <span className="text-[10px] font-mono text-text-tertiary">
                            in ${p.inputPricePer1k}/1k · out ${p.outputPricePer1k}/1k
                          </span>
                        </div>
                      </button>
                    );
                  })}
                  {cfg?.models
                    .filter((m) => m.isCustom)
                    .map((m) => {
                      const enabled = m.enabled;
                      return (
                        <div
                          key={m.modelId}
                          className="flex items-center gap-1"
                        >
                          <button
                            type="button"
                            onClick={() =>
                              handleToggle(provider, m.modelId, !enabled)
                            }
                            className={cn(
                              "flex-1 flex items-center gap-2.5 px-3 py-2 text-left transition-colors min-w-0",
                              enabled
                                ? "hover:bg-primary-muted/30"
                                : "hover:bg-bg-hover"
                            )}
                          >
                            {enabled ? (
                              <CheckCircle2 className="w-4 h-4 text-primary shrink-0" />
                            ) : (
                              <Circle className="w-4 h-4 text-text-tertiary shrink-0" />
                            )}
                            <div className="flex-1 min-w-0 flex items-center gap-2">
                              <span
                                className={cn(
                                  "text-sm truncate",
                                  enabled
                                    ? "text-text-primary font-medium"
                                    : "text-text-secondary"
                                )}
                              >
                                {m.label}
                              </span>
                              <span className="text-[9px] font-mono text-text-tertiary truncate max-w-[120px]">
                                {m.modelId}
                              </span>
                              <span className="text-[10px] font-mono text-text-tertiary truncate hidden sm:inline">
                                in ${m.inputPricePer1k}/1k · out $
                                {m.outputPricePer1k}/1k
                              </span>
                            </div>
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              handleRemoveCustomModel(provider, m.modelId)
                            }
                            className="w-6 h-6 rounded flex items-center justify-center text-text-tertiary hover:text-danger hover:bg-[rgba(239,68,68,0.08)] transition-colors shrink-0 mr-1"
                            aria-label="删除自定义模型"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      );
                    })}
                </div>

                <div className="mt-3 flex items-center justify-between gap-2">
                  <div className="text-xs text-text-tertiary">
                    {cfg ? (
                      <span>
                        已启用{" "}
                        <span className="text-primary font-medium">
                          {enabledCount}
                        </span>{" "}
                        / {cfg.models.length} 个模型
                      </span>
                    ) : (
                      <span className="italic">未配置 API Key</span>
                    )}
                  </div>
                  {cfg && (
                    <button
                      type="button"
                      onClick={() => {
                        setCustomForm({ modelId: "", label: "", inputPricePer1k: "0", outputPricePer1k: "0" });
                        setAddCustomProvider(provider);
                      }}
                      className="text-[11px] text-text-tertiary hover:text-primary transition-colors flex items-center gap-1 shrink-0"
                    >
                      <Plus className="w-3 h-3" />
                      添加自定义
                    </button>
                  )}
                </div>
              </SpotlightCard>
            );
          })}
        </div>
      )}

      {/* Embedding 统一配置 */}
      <div className="mt-8">
        <EmbedConfigCard onChanged={refresh} />
      </div>

      {/* Configure dialog */}
      {editingProvider && (
        <ConfigureProviderDialog
          provider={editingProvider}
          open={!!editingProvider}
          onOpenChange={(o) => !o && setEditingProvider(null)}
          onSaved={refresh}
        />
      )}

      {/* Delete confirm */}
      <Dialog
        open={!!confirmDelete}
        onOpenChange={(o) => !o && setConfirmDelete(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>删除 Provider 配置？</DialogTitle>
            <DialogDescription>
              将删除{" "}
              {confirmDelete ? PROVIDER_LABELS[confirmDelete] : ""} 的 API
              Key 与模型勾选状态，无法恢复（已使用此 Provider 的历史评估记录不受影响）。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmDelete(null)}>
              取消
            </Button>
            <Button
              variant="destructive"
              onClick={() => confirmDelete && handleDelete(confirmDelete)}
            >
              确认删除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add custom model dialog */}
      <Dialog
        open={!!addCustomProvider}
        onOpenChange={(o) => {
          if (!o) {
            setAddCustomProvider(null);
            setCustomForm({ modelId: "", label: "", inputPricePer1k: "0", outputPricePer1k: "0" });
          }
        }}
      >
        <DialogContent className="sm:max-w-sm overflow-hidden">
          <DialogHeader>
            <DialogTitle>
              添加自定义模型
              {addCustomProvider && (
                <span className="text-text-tertiary font-normal">
                  {" "}· {PROVIDER_LABELS[addCustomProvider]}
                </span>
              )}
            </DialogTitle>
            <DialogDescription>
              填入模型标识与价格，适配火山方舟接入点、未预设型号、私有部署等场景。
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4 py-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="cm-modelId">Model ID *</Label>
              <Input
                id="cm-modelId"
                value={customForm.modelId}
                onChange={(e) =>
                  setCustomForm((f) => ({ ...f, modelId: e.target.value }))
                }
                placeholder="如 ep-20250101000000-xxxxx"
                className="font-mono text-xs"
                autoComplete="off"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="cm-label">显示名</Label>
              <Input
                id="cm-label"
                value={customForm.label}
                onChange={(e) =>
                  setCustomForm((f) => ({ ...f, label: e.target.value }))
                }
                placeholder="如 Doubao Pro 32K（留空则用 Model ID）"
                className="text-xs"
                autoComplete="off"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="cm-in-price">输入价 ($/1k tokens)</Label>
                <Input
                  id="cm-in-price"
                  type="number"
                  step="0.0001"
                  min="0"
                  value={customForm.inputPricePer1k}
                  onChange={(e) =>
                    setCustomForm((f) => ({
                      ...f,
                      inputPricePer1k: e.target.value,
                    }))
                  }
                  placeholder="0"
                  className="font-mono text-xs"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="cm-out-price">输出价 ($/1k tokens)</Label>
                <Input
                  id="cm-out-price"
                  type="number"
                  step="0.0001"
                  min="0"
                  value={customForm.outputPricePer1k}
                  onChange={(e) =>
                    setCustomForm((f) => ({
                      ...f,
                      outputPricePer1k: e.target.value,
                    }))
                  }
                  placeholder="0"
                  className="font-mono text-xs"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => {
                setAddCustomProvider(null);
                setCustomForm({ modelId: "", label: "", inputPricePer1k: "0", outputPricePer1k: "0" });
              }}
              disabled={addingCustom}
            >
              取消
            </Button>
            <Button onClick={handleAddCustomModel} disabled={addingCustom}>
              {addingCustom ? "添加中..." : "添加"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
