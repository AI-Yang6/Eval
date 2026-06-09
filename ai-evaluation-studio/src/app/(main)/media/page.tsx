"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ExternalLink,
  ImageIcon,
  Loader2,
  Play,
  RefreshCw,
  Trash2,
  Video,
} from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/layout/page-header";
import { SpotlightCard } from "@/components/ui/spotlight-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { listModelConfigs } from "@/lib/db/models";
import {
  deleteMediaGeneration,
  listMediaGenerations,
  saveMediaGeneration,
} from "@/lib/db/media";
import { formatDate } from "@/lib/utils/format";
import {
  PROVIDER_DEFAULT_BASE_URL,
  PROVIDER_LABELS,
} from "@/lib/model-adapters/presets";
import type {
  MediaGeneration,
  ModelConfig,
  ModelDefinition,
} from "@/lib/types";

type MediaMode = "image" | "video";
const AGNES_VIDEO_MODEL_ID = "agnes-video-v1.2";

interface ModelEntry {
  config: ModelConfig;
  def: ModelDefinition;
}

type MediaState =
  | { status: "idle" }
  | { status: "loading" }
  | {
      status: "ready";
      imageURL?: string;
      videoURL?: string;
      taskId?: string;
      taskStatus?: string;
      progress?: string;
      raw?: unknown;
    }
  | { status: "error"; message: string; raw?: unknown };

const DEFAULT_PROMPT =
  "A cinematic purple-black AI evaluation dashboard, glassmorphism panels, model comparison charts, glowing neural lines, premium SaaS visual style.";

function baseFor(entry: ModelEntry | undefined): string {
  if (!entry) return "";
  return (
    entry.config.baseURL ||
    PROVIDER_DEFAULT_BASE_URL[entry.config.provider] ||
    ""
  );
}

function isAgnesEntry(entry: ModelEntry | undefined): boolean {
  return (
    entry?.config.provider === "agnes" ||
    baseFor(entry).includes("apihub.agnes-ai.com")
  );
}

function defaultEndpointFor(mode: MediaMode, entry: ModelEntry | undefined): string {
  if (mode === "image") return "/images/generations";
  return isAgnesEntry(entry) ? "/videos" : "/videos/generations";
}

function rawPreview(raw: unknown): string {
  if (!raw) return "";
  try {
    return JSON.stringify(raw, null, 2).slice(0, 3000);
  } catch {
    return String(raw).slice(0, 3000);
  }
}

function isTerminalFailure(status: string | undefined): boolean {
  if (!status) return false;
  return ["failed", "failure", "error", "cancelled", "canceled"].includes(
    status.toLowerCase()
  );
}

function isTerminalSuccess(status: string | undefined): boolean {
  if (!status) return false;
  return ["completed", "complete", "succeeded", "success", "done"].includes(
    status.toLowerCase()
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export default function MediaPage() {
  const [models, setModels] = useState<ModelEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<MediaMode>("image");
  const [modelDefId, setModelDefId] = useState("");
  const [modelIdOverride, setModelIdOverride] = useState("");
  const [baseURLOverride, setBaseURLOverride] = useState("");
  const [endpointPath, setEndpointPath] = useState("/images/generations");
  const [statusPathTemplate, setStatusPathTemplate] = useState("/videos/{id}");
  const [size, setSize] = useState("1024x1024");
  const [prompt, setPrompt] = useState(DEFAULT_PROMPT);
  const [result, setResult] = useState<MediaState>({ status: "idle" });
  const [history, setHistory] = useState<MediaGeneration[]>([]);

  useEffect(() => {
    (async () => {
      try {
        const [configs, savedHistory] = await Promise.all([
          listModelConfigs(),
          listMediaGenerations(),
        ]);
        const entries: ModelEntry[] = [];
        for (const config of configs) {
          for (const def of config.models) {
            if (def.enabled) entries.push({ config, def });
          }
        }
        setModels(entries);
        setModelDefId(entries[0]?.def.id ?? "");
        setHistory(savedHistory);
      } catch (e) {
        toast.error(`加载模型失败：${e instanceof Error ? e.message : String(e)}`);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const selected = useMemo(
    () => models.find((m) => m.def.id === modelDefId),
    [models, modelDefId]
  );
  const effectiveModelId =
    modelIdOverride.trim() ||
    selected?.def.modelId ||
    "";
  const effectiveBaseURL = baseURLOverride.trim() || baseFor(selected);

  async function persistGeneration(
    generatedMode: MediaMode,
    url: string,
    taskId?: string
  ) {
    if (!selected) return;
    try {
      const item = await saveMediaGeneration({
        ...(generatedMode === "video" && taskId ? { id: `video:${taskId}` } : {}),
        mode: generatedMode,
        url,
        prompt: prompt.trim(),
        modelId: effectiveModelId,
        provider: selected.config.provider,
        size,
        taskId,
      });
      setHistory((items) => [item, ...items.filter((x) => x.id !== item.id)]);
    } catch (e) {
      toast.error(`保存生成历史失败：${e instanceof Error ? e.message : String(e)}`);
    }
  }

  function handleModeChange(value: string) {
    const next = value as MediaMode;
    setMode(next);
    setEndpointPath(defaultEndpointFor(next, selected));
    setSize(next === "image" ? "1024x1024" : "1152x768");
    setModelIdOverride(
      next === "video" && isAgnesEntry(selected) ? AGNES_VIDEO_MODEL_ID : ""
    );
    setResult({ status: "idle" });
  }

  async function generate() {
    if (!selected) {
      toast.error("请先配置并启用一个模型");
      return;
    }
    if (!effectiveModelId) {
      toast.error("请填写图片/视频模型 ID");
      return;
    }
    if (!effectiveBaseURL) {
      toast.error("请填写 Base URL");
      return;
    }
    if (!prompt.trim()) {
      toast.error("Prompt 不能为空");
      return;
    }

    setResult({ status: "loading" });
    try {
      const res = await fetch("/api/media", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          mode,
          provider: selected.config.provider,
          apiKey: selected.config.apiKey,
          baseURL: effectiveBaseURL,
          modelId: effectiveModelId,
          prompt: prompt.trim(),
          size,
          endpointPath,
          statusPathTemplate,
        }),
      });
      const data = await res.json();
      if (!data.ok) {
        setResult({
          status: "error",
          message: data.error ?? "生成失败",
          raw: data.raw,
        });
        return;
      }
      setResult({
        status: "ready",
        imageURL: data.imageURL,
        videoURL: data.url,
        taskId: data.taskId,
        taskStatus: data.status,
        progress: data.progress,
        raw: data.raw,
      });
      const generatedURL = mode === "image" ? data.imageURL : data.url;
      if (generatedURL) {
        await persistGeneration(mode, generatedURL, data.taskId);
      }
      if (mode === "video" && data.taskId && !data.url) {
        void pollVideoUntilReady(data.taskId, data.status, data.raw);
      }
    } catch (e) {
      setResult({
        status: "error",
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }

  async function requestVideoStatus(taskId: string) {
    if (!selected) throw new Error("未选择模型");
    const res = await fetch("/api/media", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        mode: "video-status",
        provider: selected.config.provider,
        apiKey: selected.config.apiKey,
        baseURL: effectiveBaseURL,
        taskId,
        statusPathTemplate,
      }),
    });
    return res.json();
  }

  async function pollVideoOnce(taskId: string) {
    try {
      const data = await requestVideoStatus(taskId);
      if (!data.ok) {
        toast.error(data.error ?? "查询视频状态失败");
        return false;
      }
      setResult({
        status: "ready",
        videoURL: data.url,
        taskId: data.taskId || taskId,
        taskStatus: data.status,
        progress: data.progress,
        raw: data.raw,
      });
      if (data.url) {
        await persistGeneration("video", data.url, data.taskId || taskId);
      }
      if (data.providerError || isTerminalFailure(data.status)) {
        setResult({
          status: "error",
          message: data.providerError || `视频任务失败：${data.status}`,
          raw: data.raw,
        });
        return true;
      }
      return !!data.url || isTerminalSuccess(data.status);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
      return false;
    }
  }

  async function pollVideoUntilReady(
    taskId: string,
    initialStatus?: string,
    raw?: unknown
  ) {
    setResult({
      status: "ready",
      taskId,
      taskStatus: initialStatus || "queued",
      raw,
    });
    for (let i = 0; i < 60; i += 1) {
      await sleep(i < 6 ? 3000 : 6000);
      const done = await pollVideoOnce(taskId);
      if (done) return;
    }
    setResult((prev) =>
      prev.status === "ready"
        ? {
            ...prev,
            taskStatus: prev.taskStatus || "timeout",
          }
        : prev
    );
  }

  async function pollVideo() {
    if (result.status !== "ready" || !result.taskId) return;
    await pollVideoOnce(result.taskId);
  }

  async function removeHistoryItem(id: string) {
    await deleteMediaGeneration(id);
    setHistory((items) => items.filter((item) => item.id !== id));
  }

  return (
    <div className="px-6 sm:px-10 lg:px-12 py-8 max-w-6xl mx-auto">
      <PageHeader
        icon={ImageIcon}
        title="多模态生成"
        description="用已配置的 Agnes AI 或 OpenAI-compatible 端点生成图片、视频，并直接预览结果。"
      />

      <div className="mb-5 flex items-center gap-2 rounded-lg border border-border-subtle bg-bg-card p-1 w-fit">
        <button
          type="button"
          onClick={() => handleModeChange("image")}
          className={`h-8 px-3 rounded-md text-sm flex items-center gap-1.5 transition-colors ${
            mode === "image"
              ? "bg-primary text-white"
              : "text-text-secondary hover:text-text-primary hover:bg-bg-hover"
          }`}
        >
          <ImageIcon className="w-4 h-4" />
          图片
        </button>
        <button
          type="button"
          onClick={() => handleModeChange("video")}
          className={`h-8 px-3 rounded-md text-sm flex items-center gap-1.5 transition-colors ${
            mode === "video"
              ? "bg-primary text-white"
              : "text-text-secondary hover:text-text-primary hover:bg-bg-hover"
          }`}
        >
          <Video className="w-4 h-4" />
          视频
        </button>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[420px_minmax(0,1fr)] 2xl:grid-cols-[440px_minmax(0,1fr)] gap-5">
        <SpotlightCard className="p-5">
          <div className="flex items-center justify-between gap-3 mb-4">
            <div>
              <h2 className="text-base font-semibold text-text-primary">
                生成参数
              </h2>
              <p className="text-xs text-text-tertiary mt-0.5">
                当前模式：
                <span className="text-text-secondary">
                  {mode === "image" ? "图片生成" : "视频生成"}
                </span>
              </p>
            </div>
            <Badge
              variant="secondary"
              className="bg-primary-muted text-primary border-[rgba(124,92,252,0.2)]"
            >
              {mode === "image" ? (
                <>
                  <ImageIcon className="w-3.5 h-3.5" />
                  图片
                </>
              ) : (
                <>
                  <Video className="w-3.5 h-3.5" />
                  视频
                </>
              )}
            </Badge>
          </div>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label>API Key 配置</Label>
              <div className="max-h-40 overflow-y-auto rounded-md border border-border-subtle divide-y divide-border-subtle">
                {models.map((m) => {
                  const active = m.def.id === modelDefId;
                  return (
                    <button
                      key={m.def.id}
                      type="button"
                      onClick={() => {
                        setModelDefId(m.def.id);
                        setEndpointPath(defaultEndpointFor(mode, m));
                        setModelIdOverride(
                          mode === "video" && isAgnesEntry(m)
                            ? AGNES_VIDEO_MODEL_ID
                            : ""
                        );
                        setResult({ status: "idle" });
                      }}
                      className={`w-full px-3 py-2.5 text-left transition-colors ${
                        active ? "bg-primary-muted/40" : "hover:bg-bg-hover"
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-sm font-medium text-text-primary truncate">
                          {m.def.label}
                        </span>
                        <Badge
                          variant="secondary"
                          className="bg-bg-hover text-text-tertiary border-border-subtle text-[10px] px-1.5 py-0 shrink-0"
                        >
                          {PROVIDER_LABELS[m.config.provider]}
                        </Badge>
                      </div>
                      <div className="mt-1 text-[11px] font-mono text-text-tertiary truncate">
                        {m.def.modelId}
                      </div>
                    </button>
                  );
                })}
                {loading && (
                  <div className="px-3 py-4 text-xs text-text-tertiary">
                    正在加载模型...
                  </div>
                )}
                {models.length === 0 && !loading && (
                  <div className="px-3 py-4 text-xs text-text-tertiary">
                    还没有可用模型。先到「模型」页配置并保存 Agnes AI 或自定义 Provider。
                  </div>
                )}
              </div>
              {models.length === 0 && !loading && (
                <p className="text-xs text-text-tertiary">
                  先到「模型」页配置并启用 Agnes AI 或自定义 Provider。
                </p>
              )}
              {selected && (
                <p className="text-xs text-text-tertiary">
                  此处选择用于提供 Provider、API Key 和 Base URL；实际生成模型由下方模型 ID 决定。
                </p>
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="model-id">生成模型 ID</Label>
              <Input
                id="model-id"
                value={modelIdOverride}
                onChange={(e) => setModelIdOverride(e.target.value)}
                placeholder={selected?.def.modelId || "如 image-model / video-model"}
                className="font-mono text-xs"
              />
              <p className="text-xs text-text-tertiary">
                {mode === "video" && isAgnesEntry(selected)
                  ? `Agnes 视频接口当前使用 ${AGNES_VIDEO_MODEL_ID}。若返回 No available channel，需要在 Agnes 后台开通该模型权限。`
                  : "留空使用所选模型 ID；图片/视频模型通常需要填 provider 文档中的专用 ID。"}
              </p>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="base-url">Base URL</Label>
              <Input
                id="base-url"
                value={baseURLOverride}
                onChange={(e) => setBaseURLOverride(e.target.value)}
                placeholder={baseFor(selected) || "https://example.com/v1"}
                className="font-mono text-xs"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="endpoint">Endpoint Path</Label>
                <Input
                  id="endpoint"
                  value={endpointPath}
                  onChange={(e) => setEndpointPath(e.target.value)}
                  className="font-mono text-xs"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="size">尺寸</Label>
                <Input
                  id="size"
                  value={size}
                  onChange={(e) => setSize(e.target.value)}
                  placeholder={mode === "image" ? "1024x1024" : "1280x720"}
                  className="font-mono text-xs"
                />
              </div>
            </div>

            {mode === "video" && (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="status-path">状态查询 Path</Label>
                <Input
                  id="status-path"
                  value={statusPathTemplate}
                  onChange={(e) => setStatusPathTemplate(e.target.value)}
                  placeholder="/videos/{id}"
                  className="font-mono text-xs"
                />
              </div>
            )}

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="prompt">Prompt</Label>
              <Textarea
                id="prompt"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                className="min-h-32"
              />
            </div>

            <Button
              onClick={generate}
              disabled={result.status === "loading" || !selected}
              className="h-10"
            >
              {result.status === "loading" ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Play className="w-4 h-4" />
              )}
              {result.status === "loading" ? "生成中..." : "生成预览"}
            </Button>
          </div>
        </SpotlightCard>

        <PreviewPanel result={result} mode={mode} onPoll={pollVideo} />
      </div>

      <SpotlightCard className="p-5 mt-5">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <h2 className="text-base font-semibold text-text-primary">生成历史</h2>
            <p className="text-xs text-text-tertiary mt-0.5">
              成功生成的图片和视频 URL 保存在当前浏览器 IndexedDB 中。
            </p>
          </div>
          <Badge variant="secondary">{history.length} 条</Badge>
        </div>

        {history.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border-subtle py-10 text-center text-sm text-text-tertiary">
            新生成的图片和视频会出现在这里。此前已被覆盖的结果无法自动恢复。
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {history.map((item) => (
              <div
                key={item.id}
                className="rounded-lg border border-border-subtle bg-bg-app overflow-hidden"
              >
                <div className="aspect-video bg-black/20 flex items-center justify-center overflow-hidden">
                  {item.mode === "image" ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={item.url}
                      alt={item.prompt}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <video src={item.url} controls className="w-full h-full object-contain" />
                  )}
                </div>
                <div className="p-3">
                  <p className="text-xs text-text-secondary line-clamp-2 min-h-8">
                    {item.prompt}
                  </p>
                  <div className="mt-2 text-[11px] text-text-tertiary">
                    {item.modelId} · {item.size}
                  </div>
                  <div className="mt-1 text-[11px] text-text-tertiary">
                    {formatDate(item.createdAt)}
                  </div>
                  <div className="flex gap-2 mt-3">
                    <Button
                      variant="outline"
                      size="sm"
                      nativeButton={false}
                      render={<a href={item.url} target="_blank" rel="noreferrer" />}
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      打开
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => void removeHistoryItem(item.id)}
                      className="text-danger hover:text-danger"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      删除
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </SpotlightCard>
    </div>
  );
}

function PreviewPanel({
  result,
  mode,
  onPoll,
}: {
  result: MediaState;
  mode: MediaMode;
  onPoll?: () => void;
}) {
  return (
    <SpotlightCard className="p-5 min-h-[680px]">
      <div className="flex items-center justify-between gap-3 mb-4">
        <div>
          <h2 className="text-base font-semibold text-text-primary">生成结果</h2>
          <p className="text-xs text-text-tertiary mt-0.5">
            当前生成结果；成功结果会同时保存到下方生成历史。
          </p>
        </div>
        {result.status === "ready" && result.taskId && mode === "video" && (
          <Button variant="outline" size="sm" onClick={onPoll}>
            <RefreshCw className="w-3.5 h-3.5" />
            查询状态
          </Button>
        )}
      </div>

      <div className="rounded-lg border border-border-subtle bg-bg-app min-h-[520px] xl:min-h-[640px] flex items-center justify-center overflow-hidden">
        {result.status === "idle" && (
          <div className="text-sm text-text-tertiary">等待生成</div>
        )}
        {result.status === "loading" && (
          <div className="flex items-center gap-2 text-sm text-text-secondary">
            <Loader2 className="w-4 h-4 animate-spin" />
            正在请求模型服务
          </div>
        )}
        {result.status === "error" && (
          <div className="p-5 text-sm text-danger break-words">
            {result.message}
          </div>
        )}
        {result.status === "ready" && mode === "image" && result.imageURL && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={result.imageURL}
            alt="Generated image"
            className="max-w-full max-h-[720px] object-contain"
          />
        )}
        {result.status === "ready" && mode === "video" && result.videoURL && (
          <video
            src={result.videoURL}
            controls
            className="w-full max-h-[720px]"
          />
        )}
        {result.status === "ready" &&
          mode === "video" &&
          !result.videoURL &&
          result.taskId && (
            <div className="text-center p-6">
              <Badge variant="secondary" className="font-mono mb-3">
                task: {result.taskId}
              </Badge>
              {result.taskStatus && (
                <div className="text-xs text-text-secondary mb-2">
                  状态：{result.taskStatus}
                  {result.progress ? ` · 进度：${result.progress}` : ""}
                </div>
              )}
              <p className="text-sm text-text-tertiary">
                视频任务已创建，系统正在自动查询结果；也可以手动点击「查询状态」。
              </p>
            </div>
          )}
      </div>

      {result.status === "ready" && (result.imageURL || result.videoURL) && (
        <a
          href={result.imageURL || result.videoURL}
          target="_blank"
          rel="noreferrer"
          className="block mt-3 text-xs text-primary hover:underline break-all"
        >
          {result.imageURL || result.videoURL}
        </a>
      )}

      {(result.status === "ready" || result.status === "error") &&
        result.raw !== undefined &&
        result.raw !== null && (
          <details className="mt-4">
            <summary className="cursor-pointer text-xs text-text-tertiary hover:text-text-secondary">
              查看原始响应
            </summary>
            <pre className="mt-2 max-h-64 overflow-auto rounded-md bg-bg-app border border-border-subtle p-3 text-[11px] text-text-secondary">
              {rawPreview(result.raw)}
            </pre>
          </details>
        )}
    </SpotlightCard>
  );
}
