import type { ModelProvider } from "@/lib/types";

export interface ModelPreset {
  modelId: string;
  label: string;
  inputPricePer1k: number; // USD
  outputPricePer1k: number; // USD
}

// 价格基于 2026-05 公开定价（仅供预估，实际以 provider 为准）
// 国产模型价格按 7.2 RMB/USD 折算
export const MODEL_PRESETS: Record<ModelProvider, ModelPreset[]> = {
  openai: [
    {
      modelId: "gpt-5",
      label: "GPT-5",
      inputPricePer1k: 0.005,
      outputPricePer1k: 0.015,
    },
    {
      modelId: "gpt-5-mini",
      label: "GPT-5 mini",
      inputPricePer1k: 0.0003,
      outputPricePer1k: 0.0012,
    },
    {
      modelId: "gpt-4o",
      label: "GPT-4o",
      inputPricePer1k: 0.0025,
      outputPricePer1k: 0.01,
    },
    {
      modelId: "gpt-4o-mini",
      label: "GPT-4o mini",
      inputPricePer1k: 0.00015,
      outputPricePer1k: 0.0006,
    },
  ],
  anthropic: [
    {
      modelId: "claude-opus-4-7",
      label: "Claude Opus 4.7",
      inputPricePer1k: 0.015,
      outputPricePer1k: 0.075,
    },
    {
      modelId: "claude-sonnet-4-6",
      label: "Claude Sonnet 4.6",
      inputPricePer1k: 0.003,
      outputPricePer1k: 0.015,
    },
    {
      modelId: "claude-haiku-4-5-20251001",
      label: "Claude Haiku 4.5",
      inputPricePer1k: 0.001,
      outputPricePer1k: 0.005,
    },
  ],
  deepseek: [
    {
      modelId: "deepseek-v4-flash",
      label: "DeepSeek-V4 Flash",
      inputPricePer1k: 0.00028,
      outputPricePer1k: 0.00111,
    },
    {
      modelId: "deepseek-v4-pro",
      label: "DeepSeek-V4 Pro",
      inputPricePer1k: 0.000556,
      outputPricePer1k: 0.00222,
    },
  ],
  qwen: [
    {
      modelId: "qwen-max",
      label: "通义千问 Max",
      inputPricePer1k: 0.0028, // ¥20/1M
      outputPricePer1k: 0.0083, // ¥60/1M
    },
    {
      modelId: "qwen-plus",
      label: "通义千问 Plus",
      inputPricePer1k: 0.000111, // ¥0.8/1M
      outputPricePer1k: 0.000278, // ¥2/1M
    },
    {
      modelId: "qwen-turbo",
      label: "通义千问 Turbo",
      inputPricePer1k: 0.0000417, // ¥0.3/1M
      outputPricePer1k: 0.000083, // ¥0.6/1M
    },
  ],
  glm: [
    {
      modelId: "glm-4-plus",
      label: "GLM-4 Plus",
      inputPricePer1k: 0.0069, // ¥50/1M
      outputPricePer1k: 0.0069,
    },
    {
      modelId: "glm-4-air",
      label: "GLM-4 Air",
      inputPricePer1k: 0.000069, // ¥0.5/1M
      outputPricePer1k: 0.000069,
    },
    {
      modelId: "glm-4-flash",
      label: "GLM-4 Flash",
      inputPricePer1k: 0,
      outputPricePer1k: 0,
    },
  ],
  kimi: [
    {
      modelId: "moonshot-v1-8k",
      label: "Kimi 8K",
      inputPricePer1k: 0.00167, // ¥12/1M
      outputPricePer1k: 0.00167,
    },
    {
      modelId: "moonshot-v1-32k",
      label: "Kimi 32K",
      inputPricePer1k: 0.00333, // ¥24/1M
      outputPricePer1k: 0.00333,
    },
    {
      modelId: "moonshot-v1-128k",
      label: "Kimi 128K",
      inputPricePer1k: 0.00833, // ¥60/1M
      outputPricePer1k: 0.00833,
    },
  ],
  doubao: [
    {
      modelId: "doubao-pro-32k",
      label: "豆包 Pro 32K",
      inputPricePer1k: 0.000111, // ¥0.8/1M
      outputPricePer1k: 0.000278, // ¥2/1M
    },
    {
      modelId: "doubao-pro-128k",
      label: "豆包 Pro 128K",
      inputPricePer1k: 0.000694, // ¥5/1M
      outputPricePer1k: 0.00125, // ¥9/1M
    },
    {
      modelId: "doubao-lite-32k",
      label: "豆包 Lite 32K",
      inputPricePer1k: 0.0000417, // ¥0.3/1M
      outputPricePer1k: 0.0000833, // ¥0.6/1M
    },
  ],
  minimax: [
    {
      modelId: "abab6.5s-chat",
      label: "MiniMax abab6.5s",
      inputPricePer1k: 0.00139, // ¥10/1M
      outputPricePer1k: 0.00139,
    },
    {
      modelId: "abab6.5-chat",
      label: "MiniMax abab6.5",
      inputPricePer1k: 0.00417, // ¥30/1M
      outputPricePer1k: 0.00417,
    },
  ],
};

export const PROVIDER_LABELS: Record<ModelProvider, string> = {
  openai: "OpenAI",
  anthropic: "Anthropic",
  deepseek: "DeepSeek",
  qwen: "通义千问",
  glm: "智谱 GLM",
  kimi: "月之暗面 Kimi",
  doubao: "豆包",
  minimax: "MiniMax",
};

// 国产 provider 默认 baseURL（OpenAI 兼容协议）
export const PROVIDER_DEFAULT_BASE_URL: Record<ModelProvider, string | null> = {
  openai: null,
  anthropic: null,
  deepseek: "https://api.deepseek.com/v1",
  qwen: "https://dashscope.aliyuncs.com/compatible-mode/v1",
  glm: "https://open.bigmodel.cn/api/paas/v4",
  kimi: "https://api.moonshot.cn/v1",
  doubao: "https://ark.cn-beijing.volces.com/api/v3",
  minimax: "https://api.minimax.chat/v1",
};

export const PROVIDER_KEY_PLACEHOLDER: Record<ModelProvider, string> = {
  openai: "sk-...",
  anthropic: "sk-ant-...",
  deepseek: "sk-...",
  qwen: "sk-...",
  glm: "xxx.xxx",
  kimi: "sk-...",
  doubao: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
  minimax: "eyJ...",
};

export const PROVIDER_GLYPH: Record<ModelProvider, string> = {
  openai: "🟢",
  anthropic: "🟣",
  deepseek: "🔵",
  qwen: "🟠",
  glm: "🔷",
  kimi: "🌙",
  doubao: "🫘",
  minimax: "⚡",
};

// 是否走 OpenAI 兼容协议（决定后端用哪个 SDK）
export function isOpenAICompatible(provider: ModelProvider): boolean {
  return provider !== "anthropic";
}

export function getPreset(
  provider: ModelProvider,
  modelId: string
): ModelPreset | undefined {
  return MODEL_PRESETS[provider].find((p) => p.modelId === modelId);
}

export const EMBEDDING_MODELS: Record<ModelProvider, string[]> = {
  openai: ["text-embedding-3-small", "text-embedding-3-large", "text-embedding-ada-002"],
  anthropic: [],
  deepseek: [], // deepseek-embedding 已废弃，不再支持
  qwen: ["qwen3-embedding-0.6b", "qwen3-embedding-4b", "qwen3-embedding-8b", "text-embedding-v4"],
  glm: ["embedding-2", "embedding-3"],
  kimi: ["moonshot-v1-embedding"],
  doubao: [],
  minimax: [],
};

export function hasEmbeddingSupport(provider: ModelProvider): boolean {
  return EMBEDDING_MODELS[provider].length > 0;
}
