import { getDB } from "./index";
import type {
  TestSuite,
  TestCase,
  Prompt,
  PromptVersion,
  ModelConfig,
  EvalRun,
  EvalResult,
  KnowledgeBase,
  KBDocument,
  KBChunk,
  EmbedConfig,
} from "@/lib/types";

const BACKUP_VERSION = 3;

export interface BackupPayload {
  version: number;
  exportedAt: string;
  testSuites: TestSuite[];
  testCases: TestCase[];
  prompts: Prompt[];
  promptVersions: PromptVersion[];
  modelConfigs: ModelConfig[];
  evalRuns: EvalRun[];
  evalResults: EvalResult[];
  knowledgeBases: KnowledgeBase[];
  kbDocuments: KBDocument[];
  kbChunks: Array<Omit<KBChunk, "embedding"> & { embedding: number[] }>;
  embedConfig?: EmbedConfig | null;
}

export async function exportAll(): Promise<BackupPayload> {
  const db = getDB();
  const [
    testSuites,
    testCases,
    prompts,
    promptVersions,
    modelConfigs,
    evalRuns,
    evalResults,
    knowledgeBases,
    kbDocuments,
    kbChunks,
    embedConfig,
  ] = await Promise.all([
    db.testSuites.toArray(),
    db.testCases.toArray(),
    db.prompts.toArray(),
    db.promptVersions.toArray(),
    db.modelConfigs.toArray(),
    db.evalRuns.toArray(),
    db.evalResults.toArray(),
    db.knowledgeBases.toArray(),
    db.kbDocuments.toArray(),
    db.kbChunks.toArray(),
    db.embedConfig.get("global"),
  ]);

  // Float64Array → number[] for JSON serialization
  const serializedChunks = kbChunks.map((chunk) => ({
    ...chunk,
    embedding: Array.from(chunk.embedding),
  }));

  return {
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    testSuites,
    testCases,
    prompts,
    promptVersions,
    modelConfigs,
    evalRuns,
    evalResults,
    knowledgeBases,
    kbDocuments,
    kbChunks: serializedChunks,
    embedConfig: embedConfig ?? null,
  };
}

export interface ImportSummary {
  testSuites: number;
  testCases: number;
  prompts: number;
  promptVersions: number;
  modelConfigs: number;
  evalRuns: number;
  evalResults: number;
  knowledgeBases: number;
  kbDocuments: number;
  kbChunks: number;
  embedConfig: number;
}

export async function importAll(
  payload: BackupPayload,
  mode: "merge" | "replace" = "merge"
): Promise<ImportSummary> {
  if (!payload || typeof payload !== "object") {
    throw new Error("备份文件格式错误");
  }
  if (payload.version !== BACKUP_VERSION && payload.version !== 2) {
    throw new Error(`不支持的备份版本：${payload.version}`);
  }
  // 基本字段校验
  const tables: Array<keyof BackupPayload> = [
    "testSuites",
    "testCases",
    "prompts",
    "promptVersions",
    "modelConfigs",
    "evalRuns",
    "evalResults",
    "knowledgeBases",
    "kbDocuments",
    "kbChunks",
  ];
  for (const t of tables) {
    if (!Array.isArray(payload[t])) {
      throw new Error(`备份缺失或损坏的表：${t}`);
    }
  }

  const db = getDB();

  // 反序列化：number[] → Float64Array
  const deserializedChunks = payload.kbChunks.map((chunk) => ({
    ...chunk,
    embedding: new Float64Array(chunk.embedding),
  }));

  await db.transaction(
    "rw",
    [
      db.testSuites,
      db.testCases,
      db.prompts,
      db.promptVersions,
      db.modelConfigs,
      db.embedConfig,
      db.evalRuns,
      db.evalResults,
      db.knowledgeBases,
      db.kbDocuments,
      db.kbChunks,
    ],
    async () => {
      if (mode === "replace") {
        await Promise.all([
          db.testSuites.clear(),
          db.testCases.clear(),
          db.prompts.clear(),
          db.promptVersions.clear(),
          db.modelConfigs.clear(),
          db.embedConfig.clear(),
          db.evalRuns.clear(),
          db.evalResults.clear(),
          db.knowledgeBases.clear(),
          db.kbDocuments.clear(),
          db.kbChunks.clear(),
        ]);
      }
      await db.testSuites.bulkPut(payload.testSuites);
      await db.testCases.bulkPut(payload.testCases);
      await db.prompts.bulkPut(payload.prompts);
      await db.promptVersions.bulkPut(payload.promptVersions);
      await db.modelConfigs.bulkPut(payload.modelConfigs);
      await db.evalRuns.bulkPut(payload.evalRuns);
      await db.evalResults.bulkPut(payload.evalResults);
      await db.knowledgeBases.bulkPut(payload.knowledgeBases);
      await db.kbDocuments.bulkPut(payload.kbDocuments);
      await db.kbChunks.bulkPut(deserializedChunks);
      if (payload.embedConfig) {
        await db.embedConfig.put(payload.embedConfig as EmbedConfig);
      }
    }
  );

  return {
    testSuites: payload.testSuites.length,
    testCases: payload.testCases.length,
    prompts: payload.prompts.length,
    promptVersions: payload.promptVersions.length,
    modelConfigs: payload.modelConfigs.length,
    evalRuns: payload.evalRuns.length,
    evalResults: payload.evalResults.length,
    knowledgeBases: payload.knowledgeBases.length,
    kbDocuments: payload.kbDocuments.length,
    kbChunks: payload.kbChunks.length,
    embedConfig: payload.embedConfig ? 1 : 0,
  };
}