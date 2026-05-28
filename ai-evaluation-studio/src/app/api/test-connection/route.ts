import { generateText } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import type { ModelProvider } from "@/lib/types";
import {
  PROVIDER_DEFAULT_BASE_URL,
  isOpenAICompatible,
  MODEL_PRESETS,
} from "@/lib/model-adapters/presets";
import {
  checkRateLimit,
  jsonResponse,
  readJsonBody,
  sanitizeErrorMessage,
  sanitizeProviderError,
} from "@/lib/server/api-security";

export const dynamic = "force-dynamic";

interface TestConnectionBody {
  provider: ModelProvider;
  apiKey: string;
  baseURL?: string;
  modelId?: string;
}

export async function POST(req: Request) {
  const limited = checkRateLimit(req, { limit: 20, windowMs: 60_000 });
  if (limited) return limited;

  const parsed = await readJsonBody<TestConnectionBody>(req);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;

  const { provider, apiKey, baseURL, modelId } = body;
  if (!provider || !apiKey) {
    return jsonResponse(
      { ok: false, error: "缺少 provider 或 apiKey" },
      { status: 400 }
    );
  }

  try {
    // 用 preset 列表里第一个模型做 ping（通常是最基础的 chat 模型）
    // 避免拿 reasoner / 长上下文等有特殊语义的模型当 ping 目标
    const target = modelId ?? MODEL_PRESETS[provider]?.[0]?.modelId;
    if (!target) {
      return jsonResponse(
        { ok: false, error: `${provider} 没有可用模型预设` },
        { status: 400 }
      );
    }

    if (provider === "anthropic") {
      const anthropic = createAnthropic({ apiKey });
      const r = await generateText({
        model: anthropic(target),
        prompt: "ping",
        maxOutputTokens: 5,
      });
      return jsonResponse({ ok: true, modelId: target, sample: r.text });
    }

    if (isOpenAICompatible(provider)) {
      const finalBase =
        baseURL?.trim() || PROVIDER_DEFAULT_BASE_URL[provider] || undefined;
      const defaultBase = PROVIDER_DEFAULT_BASE_URL[provider];
      const isCustomBase = finalBase && finalBase !== defaultBase;

      // 没有显式指定 modelId + 自定义 Base URL → 预设模型大概率不在目标端点，
      // 改用 /v1/models 验证连通性
      if (isCustomBase && !modelId) {
        const modelsURL = finalBase.replace(/\/+$/, "") + "/models";
        const res = await fetch(modelsURL, {
          headers: { authorization: `Bearer ${apiKey}` },
        });
        if (!res.ok) {
          const errText = await res.text().catch(() => "");
          return jsonResponse(
            {
              ok: false,
              error: `模型列表请求失败 (${res.status})${
                errText ? "：" + sanitizeProviderError(errText).slice(0, 200) : ""
              }`,
            },
            { status: 200 }
          );
        }
        return jsonResponse({
          ok: true,
          modelId: "(自定义端点，已验证连通)",
        });
      }

      const client = createOpenAI({
        apiKey,
        baseURL: finalBase,
      });
      // 关键：必须用 .chat(modelId) 走 /chat/completions，
      // 否则默认走 OpenAI Responses API（/responses），第三方兼容端点会 404
      const r = await generateText({
        model: client.chat(target),
        prompt: "ping",
        maxOutputTokens: 5,
      });
      return jsonResponse({ ok: true, modelId: target, sample: r.text });
    }

    return jsonResponse(
      { ok: false, error: `未知 provider: ${provider}` },
      { status: 400 }
    );
  } catch (e) {
    const msg = sanitizeErrorMessage(e);
    return jsonResponse({ ok: false, error: msg }, { status: 200 });
  }
}
