import { generateText } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import type { ModelProvider } from "@/lib/types";
import {
  PROVIDER_DEFAULT_BASE_URL,
  isOpenAICompatible,
} from "@/lib/model-adapters/presets";
import {
  checkRateLimit,
  jsonResponse,
  readJsonBody,
  sanitizeErrorMessage,
} from "@/lib/server/api-security";

export const dynamic = "force-dynamic";

interface GenerateBody {
  provider: ModelProvider;
  apiKey: string;
  baseURL?: string;
  modelId: string;
  systemPrompt?: string;
  userPrompt: string;
  maxOutputTokens?: number;
  temperature?: number;
}

export async function POST(req: Request) {
  const limited = checkRateLimit(req, { limit: 60, windowMs: 60_000 });
  if (limited) return limited;

  const parsed = await readJsonBody<GenerateBody>(req);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;

  const {
    provider,
    apiKey,
    baseURL,
    modelId,
    systemPrompt,
    userPrompt,
    maxOutputTokens,
    temperature,
  } = body;
  if (!provider || !apiKey || !modelId || !userPrompt) {
    return jsonResponse(
      { ok: false, error: "缺少必填参数 provider / apiKey / modelId / userPrompt" },
      { status: 400 }
    );
  }
  if (userPrompt.length > 100_000 || (systemPrompt?.length ?? 0) > 50_000) {
    return jsonResponse(
      { ok: false, error: "Prompt 内容过长，请缩短输入后重试" },
      { status: 413 }
    );
  }

  const startedAt = Date.now();
  try {
    let model;
    if (provider === "anthropic") {
      model = createAnthropic({ apiKey })(modelId);
    } else if (isOpenAICompatible(provider)) {
      const finalBase =
        baseURL?.trim() || PROVIDER_DEFAULT_BASE_URL[provider] || undefined;
      // 关键：用 .chat() 走 /chat/completions，否则默认走 Responses API，
      // OpenAI 兼容端点（DeepSeek/Qwen/GLM 等）会返回 404 Not Found
      model = createOpenAI({ apiKey, baseURL: finalBase }).chat(modelId);
    } else {
      return jsonResponse(
        { ok: false, error: `未知 provider: ${provider}` },
        { status: 400 }
      );
    }

    const r = await generateText({
      model,
      system: systemPrompt,
      prompt: userPrompt,
      maxOutputTokens: maxOutputTokens ?? 1024,
      temperature: temperature ?? 0.7,
    });

    const latencyMs = Date.now() - startedAt;
    return jsonResponse({
      ok: true,
      text: r.text,
      latencyMs,
      usage: {
        input: r.usage?.inputTokens ?? 0,
        output: r.usage?.outputTokens ?? 0,
      },
    });
  } catch (e) {
    const msg = sanitizeErrorMessage(e);
    return jsonResponse(
      { ok: false, error: msg, latencyMs: Date.now() - startedAt },
      { status: 200 }
    );
  }
}
