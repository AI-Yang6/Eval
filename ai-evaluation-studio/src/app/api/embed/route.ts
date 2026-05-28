import type { ModelProvider } from "@/lib/types";
import {
  PROVIDER_DEFAULT_BASE_URL,
  isOpenAICompatible,
  EMBEDDING_MODELS,
} from "@/lib/model-adapters/presets";
import {
  checkRateLimit,
  jsonResponse,
  readJsonBody,
  sanitizeErrorMessage,
  sanitizeProviderError,
} from "@/lib/server/api-security";

export const dynamic = "force-dynamic";

const OPENAI_BASE = "https://api.openai.com/v1";

function getEmbeddingBaseURL(provider: ModelProvider, baseURL?: string): string | null {
  if (baseURL?.trim()) return baseURL.trim();
  const fallback = PROVIDER_DEFAULT_BASE_URL[provider];
  if (fallback) return fallback;
  if (provider === "openai") return OPENAI_BASE;
  return null;
}

interface EmbedBody {
  provider: ModelProvider;
  apiKey: string;
  baseURL?: string;
  model: string;
  input: string | string[];
}

export async function POST(req: Request) {
  const limited = checkRateLimit(req, { limit: 30, windowMs: 60_000 });
  if (limited) return limited;

  const parsed = await readJsonBody<EmbedBody>(req, 1024 * 1024);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;

  if (!body.provider || !body.apiKey || !body.model || !body.input) {
    return jsonResponse(
      { ok: false, error: "缺少必填字段" },
      { status: 400 }
    );
  }
  const inputSize = Array.isArray(body.input)
    ? body.input.join("\n").length
    : body.input.length;
  if (inputSize > 500_000) {
    return jsonResponse(
      { ok: false, error: "Embedding 输入过长，请拆分文档后重试" },
      { status: 413 }
    );
  }

  // 只要该 provider 支持 Embedding 即可，不限制模型名（允许自定义模型）
  const supported = EMBEDDING_MODELS[body.provider];
  if (!supported || supported.length === 0) {
    return jsonResponse(
      { ok: false, error: `${body.provider} 暂不支持 Embedding` },
      { status: 400 }
    );
  }

  if (!isOpenAICompatible(body.provider)) {
    return jsonResponse(
      { ok: false, error: "Anthropic 暂不支持 Embedding" },
      { status: 400 }
    );
  }

  const finalBase = getEmbeddingBaseURL(body.provider, body.baseURL);
  if (!finalBase) {
    return jsonResponse(
      { ok: false, error: "缺少 Base URL" },
      { status: 400 }
    );
  }

  const url = `${finalBase.replace(/\/+$/, "")}/embeddings`;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${body.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: body.model,
        input: body.input,
      }),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      console.error(`[embed] ${res.status} from ${url}: ${sanitizeProviderError(errText)}`);
      return jsonResponse(
        { ok: false, error: `Embedding API 错误 (${res.status}): ${sanitizeProviderError(errText)}` },
        { status: 200 }
      );
    }

    const data = await res.json();
    const embedding = data.data?.[0]?.embedding;
    if (!embedding || !Array.isArray(embedding)) {
      return jsonResponse(
        { ok: false, error: "Embedding API 返回格式异常" },
        { status: 200 }
      );
    }

    return jsonResponse({
      ok: true,
      embedding,
      dimensions: embedding.length,
      model: data.model,
    });
  } catch (e) {
    const msg = sanitizeErrorMessage(e);
    console.error(`[embed] exception: ${msg}`);
    return jsonResponse(
      { ok: false, error: `请求失败: ${msg}` },
      { status: 200 }
    );
  }
}
