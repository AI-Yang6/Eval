import { v4 as uuid } from "uuid";
import { getDB } from "./index";
import type { Prompt, PromptVersion } from "@/lib/types";

const now = () => new Date().toISOString();

// ---- Prompt ----

export interface PromptWithStats extends Prompt {
  versionCount: number;
  latestVersion: number;
}

export async function listPromptsWithStats(): Promise<PromptWithStats[]> {
  const prompts = await getDB().prompts.toArray();
  const versions = await getDB().promptVersions.toArray();

  const versionMap = new Map<string, number[]>();
  for (const v of versions) {
    if (!versionMap.has(v.promptId)) versionMap.set(v.promptId, []);
    versionMap.get(v.promptId)!.push(v.versionNumber);
  }

  const enriched: PromptWithStats[] = prompts.map((p) => {
    const list = versionMap.get(p.id) ?? [];
    return {
      ...p,
      versionCount: list.length,
      latestVersion: list.length === 0 ? 0 : Math.max(...list),
    };
  });

  return enriched.sort((a, b) => (a.createdAt > b.createdAt ? -1 : 1));
}

export async function getPrompt(id: string): Promise<Prompt | undefined> {
  return getDB().prompts.get(id);
}

export async function createPrompt(input: { name: string }): Promise<Prompt> {
  const prompt: Prompt = {
    id: uuid(),
    name: input.name,
    createdAt: now(),
  };
  await getDB().prompts.add(prompt);
  return prompt;
}

export async function updatePromptName(id: string, name: string) {
  await getDB().prompts.update(id, { name });
}

export async function deletePrompt(id: string): Promise<void> {
  await getDB().transaction(
    "rw",
    getDB().prompts,
    getDB().promptVersions,
    async () => {
      await getDB().promptVersions.where("promptId").equals(id).delete();
      await getDB().prompts.delete(id);
    }
  );
}

// ---- PromptVersion ----

export async function listVersions(promptId: string): Promise<PromptVersion[]> {
  const items = await getDB()
    .promptVersions.where("promptId")
    .equals(promptId)
    .toArray();
  return items.sort((a, b) => b.versionNumber - a.versionNumber);
}

export async function getVersion(
  id: string
): Promise<PromptVersion | undefined> {
  return getDB().promptVersions.get(id);
}

export async function createVersion(input: {
  promptId: string;
  systemPrompt: string;
  userPromptTemplate?: string;
}): Promise<PromptVersion> {
  const existing = await getDB()
    .promptVersions.where("promptId")
    .equals(input.promptId)
    .toArray();
  const nextNum =
    existing.length === 0
      ? 1
      : Math.max(...existing.map((v) => v.versionNumber)) + 1;

  const version: PromptVersion = {
    id: uuid(),
    promptId: input.promptId,
    versionNumber: nextNum,
    systemPrompt: input.systemPrompt,
    userPromptTemplate: input.userPromptTemplate ?? "{{input}}",
    createdAt: now(),
  };
  await getDB().promptVersions.add(version);
  return version;
}

export async function deleteVersion(id: string): Promise<void> {
  const db = getDB();
  const version = await db.promptVersions.get(id);
  if (!version) return;

  const versionCount = await db.promptVersions
    .where("promptId")
    .equals(version.promptId)
    .count();
  if (versionCount <= 1) {
    throw new Error("至少需要保留 1 个 Prompt 版本");
  }

  const referencedRuns = await db.evalRuns
    .filter((run) => run.promptVersionIds.includes(id))
    .count();
  if (referencedRuns > 0) {
    throw new Error(
      `该版本已被 ${referencedRuns} 个评估任务引用，请先删除相关评估历史`
    );
  }

  await db.promptVersions.delete(id);
}
