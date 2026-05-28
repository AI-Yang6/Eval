import { v4 as uuid } from "uuid";
import { getDB } from "./index";
import type { ModelConfig, ModelDefinition, ModelProvider } from "@/lib/types";
import { MODEL_PRESETS } from "@/lib/model-adapters/presets";

export async function listModelConfigs(): Promise<ModelConfig[]> {
  return getDB().modelConfigs.toArray();
}

export async function getModelConfig(
  provider: ModelProvider
): Promise<ModelConfig | undefined> {
  return getDB().modelConfigs.where("provider").equals(provider).first();
}

export async function getModelConfigById(
  id: string
): Promise<ModelConfig | undefined> {
  return getDB().modelConfigs.get(id);
}

// 找到指定 modelDef 所属的 ModelConfig
export async function findModelDef(
  modelDefId: string
): Promise<{ config: ModelConfig; def: ModelDefinition } | null> {
  const all = await listModelConfigs();
  for (const c of all) {
    const def = c.models.find((m) => m.id === modelDefId);
    if (def) return { config: c, def };
  }
  return null;
}

export async function listEnabledModels(): Promise<
  Array<{ config: ModelConfig; def: ModelDefinition }>
> {
  const all = await listModelConfigs();
  const out: Array<{ config: ModelConfig; def: ModelDefinition }> = [];
  for (const c of all) {
    for (const m of c.models) {
      if (m.enabled) out.push({ config: c, def: m });
    }
  }
  return out;
}

export async function upsertModelConfig(input: {
  provider: ModelProvider;
  apiKey: string;
  baseURL?: string;
  enabledModelIds: string[];
  customModels?: Array<{
    modelId: string;
    label: string;
    inputPricePer1k: number;
    outputPricePer1k: number;
  }>;
}): Promise<ModelConfig> {
  const presets = MODEL_PRESETS[input.provider];
  const existing = await getModelConfig(input.provider);

  // 保留已有 model 的 id（避免下游引用失效），按预设重建 enabled 状态
  const existingByModelId = new Map<string, ModelDefinition>();
  if (existing) {
    for (const m of existing.models) existingByModelId.set(m.modelId, m);
  }

  const presetModels: ModelDefinition[] = presets.map((preset) => {
    const prior = existingByModelId.get(preset.modelId);
    return {
      id: prior?.id ?? uuid(),
      modelId: preset.modelId,
      label: preset.label,
      enabled: input.enabledModelIds.includes(preset.modelId),
      inputPricePer1k: preset.inputPricePer1k,
      outputPricePer1k: preset.outputPricePer1k,
      isCustom: false,
    };
  });

  // 保留已有的自定义模型（除非调用方显式传了 customModels 来覆盖）
  const priorCustoms = input.customModels
    ? []
    : (existing?.models ?? []).filter((m) => m.isCustom);
  const customModels: ModelDefinition[] = [
    ...priorCustoms.map((m) => ({
      ...m,
      enabled: input.enabledModelIds.includes(m.modelId),
    })),
    ...(input.customModels ?? []).map((cm) => {
      const prior = existingByModelId.get(cm.modelId);
      return {
        id: prior?.id ?? uuid(),
        modelId: cm.modelId,
        label: cm.label || cm.modelId,
        enabled: input.enabledModelIds.includes(cm.modelId),
        inputPricePer1k: cm.inputPricePer1k,
        outputPricePer1k: cm.outputPricePer1k,
        isCustom: true,
      };
    }),
  ];

  const config: ModelConfig = {
    id: existing?.id ?? uuid(),
    provider: input.provider,
    apiKey: input.apiKey,
    baseURL: input.baseURL?.trim() || undefined,
    models: [...presetModels, ...customModels],
  };

  if (existing) {
    await getDB().modelConfigs.put(config);
  } else {
    await getDB().modelConfigs.add(config);
  }
  return config;
}

export async function deleteModelConfig(
  provider: ModelProvider
): Promise<void> {
  await getDB().modelConfigs.where("provider").equals(provider).delete();
}

export async function toggleModelEnabled(
  provider: ModelProvider,
  modelId: string,
  enabled: boolean
): Promise<void> {
  const cfg = await getModelConfig(provider);
  if (!cfg) return;
  const models = cfg.models.map((m) =>
    m.modelId === modelId ? { ...m, enabled } : m
  );
  await getDB().modelConfigs.update(cfg.id, { models });
}

export async function addCustomModel(
  provider: ModelProvider,
  model: {
    modelId: string;
    label: string;
    inputPricePer1k: number;
    outputPricePer1k: number;
  }
): Promise<ModelDefinition> {
  const cfg = await getModelConfig(provider);
  if (!cfg) throw new Error(`请先配置 ${provider} 的 API Key`);
  const existing = cfg.models.find((m) => m.modelId === model.modelId);
  if (existing) throw new Error(`模型 "${model.modelId}" 已存在`);
  const def: ModelDefinition = {
    id: uuid(),
    modelId: model.modelId,
    label: model.label || model.modelId,
    enabled: true,
    inputPricePer1k: model.inputPricePer1k,
    outputPricePer1k: model.outputPricePer1k,
    isCustom: true,
  };
  await getDB().modelConfigs.update(cfg.id, {
    models: [...cfg.models, def],
  });
  return def;
}

export async function removeCustomModel(
  provider: ModelProvider,
  modelId: string
): Promise<void> {
  const cfg = await getModelConfig(provider);
  if (!cfg) return;
  const models = cfg.models.filter(
    (m) => !(m.isCustom && m.modelId === modelId)
  );
  await getDB().modelConfigs.update(cfg.id, { models });
}
