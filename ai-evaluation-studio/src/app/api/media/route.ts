import type { ModelProvider } from "@/lib/types";
import {
  PROVIDER_DEFAULT_BASE_URL,
  normalizeProviderBaseURL,
} from "@/lib/model-adapters/presets";
import {
  checkRateLimit,
  jsonResponse,
  readJsonBody,
  sanitizeErrorMessage,
  sanitizeProviderError,
} from "@/lib/server/api-security";

export const dynamic = "force-dynamic";

type MediaMode = "image" | "video" | "video-status";

interface MediaBody {
  mode: MediaMode;
  provider: ModelProvider;
  apiKey: string;
  baseURL?: string;
  modelId?: string;
  prompt?: string;
  size?: string;
  endpointPath?: string;
  statusPathTemplate?: string;
  taskId?: string;
}

function getBaseURL(provider: ModelProvider, baseURL?: string): string | null {
  const normalized = normalizeProviderBaseURL(provider, baseURL);
  if (normalized) return normalized;
  return PROVIDER_DEFAULT_BASE_URL[provider]?.replace(/\/+$/, "") ?? null;
}

function isAgnesEndpoint(provider: ModelProvider, baseURL: string): boolean {
  return provider === "agnes" || baseURL.includes("apihub.agnes-ai.com");
}

function normalizeEndpointPath(path: string | undefined, fallback: string): string {
  const raw = (path || fallback).trim();
  if (!raw) return fallback;
  return raw.startsWith("/") ? raw : `/${raw}`;
}

function pickImageURL(data: unknown): string | null {
  const obj = data as Record<string, unknown>;
  const first = Array.isArray(obj.data) ? obj.data[0] as Record<string, unknown> : null;
  if (typeof first?.url === "string") return first.url;
  if (typeof first?.b64_json === "string") {
    return `data:image/png;base64,${first.b64_json}`;
  }
  if (typeof obj.url === "string") return obj.url;
  if (typeof obj.image === "string") return obj.image;
  return null;
}

function pickString(obj: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = obj[key];
    if (typeof value === "string" && value) return value;
    if (typeof value === "number") return String(value);
  }
  return null;
}

function pickVideo(data: unknown): {
  url: string | null;
  taskId: string | null;
  status: string | null;
  progress: string | null;
  providerError: string | null;
  raw: unknown;
} {
  const obj = data as Record<string, unknown>;
  const first = Array.isArray(obj.data) ? obj.data[0] as Record<string, unknown> : null;
  const outputFirst = Array.isArray(obj.output) ? obj.output[0] as Record<string, unknown> : null;
  const video = obj.video as Record<string, unknown> | undefined;
  const result = obj.result as Record<string, unknown> | undefined;
  const error = obj.error as Record<string, unknown> | undefined;

  const url =
    (typeof first?.url === "string" && first.url) ||
    (typeof outputFirst?.url === "string" && outputFirst.url) ||
    (typeof video?.url === "string" && video.url) ||
    (typeof result?.url === "string" && result.url) ||
    (typeof result?.video_url === "string" && result.video_url) ||
    (typeof result?.videoUrl === "string" && result.videoUrl) ||
    (typeof obj.url === "string" && obj.url) ||
    (typeof obj.video_url === "string" && obj.video_url) ||
    (typeof obj.videoUrl === "string" && obj.videoUrl) ||
    (typeof obj.remixed_from_video_id === "string" &&
      obj.remixed_from_video_id.startsWith("http") &&
      obj.remixed_from_video_id) ||
    null;
  const taskId =
    (typeof obj.id === "string" && obj.id) ||
    (typeof obj.task_id === "string" && obj.task_id) ||
    (typeof obj.taskId === "string" && obj.taskId) ||
    (typeof obj.video_id === "string" && obj.video_id) ||
    (typeof obj.videoId === "string" && obj.videoId) ||
    (typeof first?.id === "string" && first.id) ||
    null;
  const status =
    pickString(obj, ["status", "state", "task_status"]) ||
    (result ? pickString(result, ["status", "state"]) : null) ||
    null;
  const progress =
    pickString(obj, ["progress", "percent", "percentage"]) ||
    (result ? pickString(result, ["progress", "percent", "percentage"]) : null) ||
    null;
  const providerError =
    pickString(obj, ["error", "message", "error_message"]) ||
    (error ? pickString(error, ["message", "error", "code"]) : null) ||
    null;

  return { url, taskId, status, progress, providerError, raw: data };
}

function parseSize(size: string | undefined): { width: number; height: number } {
  const [w, h] = (size || "1152x768").split("x").map((n) => Number(n));
  return {
    width: Number.isFinite(w) && w > 0 ? w : 1152,
    height: Number.isFinite(h) && h > 0 ? h : 768,
  };
}

async function callProvider(
  url: string,
  apiKey: string,
  body?: unknown,
  method: "GET" | "POST" = "POST"
): Promise<
  | { ok: true; data: unknown }
  | { ok: false; status: number; error: string; data: unknown; url: string }
> {
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!res.ok) {
    return {
      ok: false,
      status: res.status,
      error: sanitizeProviderError(text).slice(0, 500),
      data,
      url,
    };
  }
  return { ok: true, data };
}

function explainProviderError(data: unknown, fallback: string): string {
  const obj = data as Record<string, unknown> | null;
  const nested =
    obj?.error && typeof obj.error === "object"
      ? (obj.error as Record<string, unknown>)
      : null;
  const code =
    (typeof nested?.code === "string" && nested.code) ||
    (typeof obj?.code === "string" && obj.code) ||
    "";
  const message =
    (typeof nested?.message === "string" && nested.message) ||
    (typeof obj?.message === "string" && obj.message) ||
    fallback;

  if (code === "model_not_found" || message.includes("No available channel for model")) {
    return `请求已到达 Agnes，但当前 API Key 所属分组没有该模型的可用通道。这不是 Endpoint 或请求格式错误，应用无法绕过该权限限制。请在 Agnes 后台确认视频模型权限、API Key 分组与余额，或联系 Agnes 支持开通该模型。服务端信息：${message}`;
  }
  return fallback;
}

export async function POST(req: Request) {
  const limited = checkRateLimit(req, { limit: 30, windowMs: 60_000 });
  if (limited) return limited;

  const parsed = await readJsonBody<MediaBody>(req, 1024 * 1024);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;

  if (!body.mode || !body.provider || !body.apiKey) {
    return jsonResponse(
      { ok: false, error: "缺少 mode / provider / apiKey" },
      { status: 400 }
    );
  }

  const baseURL = getBaseURL(body.provider, body.baseURL);
  if (!baseURL) {
    return jsonResponse(
      { ok: false, error: "缺少 Base URL" },
      { status: 400 }
    );
  }

  try {
    if (body.mode === "image") {
      if (!body.modelId || !body.prompt?.trim()) {
        return jsonResponse(
          { ok: false, error: "缺少 modelId 或 prompt" },
          { status: 400 }
        );
      }
      const url = `${baseURL}${normalizeEndpointPath(
        body.endpointPath,
        "/images/generations"
      )}`;
      const r = await callProvider(url, body.apiKey, {
        model: body.modelId,
        prompt: body.prompt,
        n: 1,
        size: body.size || "1024x1024",
      });
      if (!r.ok) {
        return jsonResponse(
          {
            ok: false,
            error: `图片生成失败 (${r.status}): ${r.error}`,
            raw: { url: r.url, response: r.data },
          },
          { status: 200 }
        );
      }
      const imageURL = pickImageURL(r.data);
      if (!imageURL) {
        return jsonResponse(
          { ok: false, error: "图片接口返回中未找到 url 或 b64_json", raw: r.data },
          { status: 200 }
        );
      }
      return jsonResponse({ ok: true, imageURL, raw: r.data });
    }

    if (body.mode === "video") {
      if (!body.modelId || !body.prompt?.trim()) {
        return jsonResponse(
          { ok: false, error: "缺少 modelId 或 prompt" },
          { status: 400 }
        );
      }
      const agnesVideo = isAgnesEndpoint(body.provider, baseURL);
      const requestedPath =
        agnesVideo && body.endpointPath === "/videos/generations"
          ? "/videos"
          : body.endpointPath;
      const url = `${baseURL}${normalizeEndpointPath(
        requestedPath,
        agnesVideo ? "/videos" : "/videos/generations"
      )}`;
      const { width, height } = parseSize(body.size);
      const r = await callProvider(url, body.apiKey, {
        model: body.modelId,
        prompt: body.prompt,
        ...(agnesVideo
          ? {
              width,
              height,
              num_frames: 121,
              frame_rate: 24,
            }
          : {
              size: body.size,
            }),
      });
      if (!r.ok) {
        const fallback = `视频生成失败 (${r.status}): ${r.error}`;
        return jsonResponse(
          {
            ok: false,
            error: explainProviderError(r.data, fallback),
            raw: { url: r.url, response: r.data },
          },
          { status: 200 }
        );
      }
      return jsonResponse({ ok: true, ...pickVideo(r.data) });
    }

    if (body.mode === "video-status") {
      if (!body.taskId) {
        return jsonResponse({ ok: false, error: "缺少 taskId" }, { status: 400 });
      }
      const template = body.statusPathTemplate || "/videos/{id}";
      const path = normalizeEndpointPath(
        template.replace("{id}", encodeURIComponent(body.taskId)),
        "/videos/{id}"
      );
      const r = await callProvider(`${baseURL}${path}`, body.apiKey, undefined, "GET");
      if (!r.ok) {
        return jsonResponse(
          {
            ok: false,
            error: `视频状态查询失败 (${r.status}): ${r.error}`,
            raw: { url: r.url, response: r.data },
          },
          { status: 200 }
        );
      }
      return jsonResponse({ ok: true, ...pickVideo(r.data) });
    }

    return jsonResponse({ ok: false, error: "未知 mode" }, { status: 400 });
  } catch (e) {
    return jsonResponse(
      { ok: false, error: sanitizeErrorMessage(e) },
      { status: 200 }
    );
  }
}
