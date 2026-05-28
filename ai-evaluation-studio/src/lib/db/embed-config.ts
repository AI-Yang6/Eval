import { getDB } from "./index";
import type { EmbedConfig } from "@/lib/types";

const EMBED_CONFIG_ID = "global";

export async function getEmbedConfig(): Promise<EmbedConfig | undefined> {
  return getDB().embedConfig.get(EMBED_CONFIG_ID);
}

export async function upsertEmbedConfig(input: {
  apiKey: string;
  baseURL?: string;
}): Promise<EmbedConfig> {
  const existing = await getEmbedConfig();
  const config: EmbedConfig = {
    id: EMBED_CONFIG_ID,
    apiKey: input.apiKey,
    baseURL: input.baseURL?.trim() || undefined,
  };
  if (existing) {
    await getDB().embedConfig.put(config);
  } else {
    await getDB().embedConfig.add(config);
  }
  return config;
}

export async function deleteEmbedConfig(): Promise<void> {
  await getDB().embedConfig.delete(EMBED_CONFIG_ID);
}
