import Dexie, { type Table } from "dexie";
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

export class EvalStudioDB extends Dexie {
  testSuites!: Table<TestSuite, string>;
  testCases!: Table<TestCase, string>;
  prompts!: Table<Prompt, string>;
  promptVersions!: Table<PromptVersion, string>;
  modelConfigs!: Table<ModelConfig, string>;
  evalRuns!: Table<EvalRun, string>;
  evalResults!: Table<EvalResult, string>;
  knowledgeBases!: Table<KnowledgeBase, string>;
  kbDocuments!: Table<KBDocument, string>;
  kbChunks!: Table<KBChunk, string>;
  embedConfig!: Table<EmbedConfig, string>;

  constructor() {
    super("EvalStudioDB");
    this.version(1).stores({
      testSuites: "id, name, createdAt, updatedAt",
      testCases: "id, testSuiteId, order, [testSuiteId+order]",
      prompts: "id, name, createdAt",
      promptVersions:
        "id, promptId, versionNumber, [promptId+versionNumber]",
      modelConfigs: "id, provider",
      evalRuns: "id, status, createdAt, testSuiteId",
      evalResults:
        "id, evalRunId, testCaseId, [evalRunId+testCaseId], [evalRunId+promptVersionId+modelDefId]",
    });
    this.version(2).stores({
      testSuites: "id, name, createdAt, updatedAt",
      testCases: "id, testSuiteId, order, [testSuiteId+order]",
      prompts: "id, name, createdAt",
      promptVersions:
        "id, promptId, versionNumber, [promptId+versionNumber]",
      modelConfigs: "id, provider",
      evalRuns: "id, status, createdAt, testSuiteId",
      evalResults:
        "id, evalRunId, testCaseId, [evalRunId+testCaseId], [evalRunId+promptVersionId+modelDefId]",
      knowledgeBases: "id, name, embeddingProvider, createdAt",
      kbDocuments: "id, knowledgeBaseId, filename, createdAt, [knowledgeBaseId+createdAt]",
      kbChunks: "id, knowledgeBaseId, documentId, index, [knowledgeBaseId+index]",
    });
    this.version(3).stores({
      testSuites: "id, name, createdAt, updatedAt",
      testCases: "id, testSuiteId, order, [testSuiteId+order]",
      prompts: "id, name, createdAt",
      promptVersions:
        "id, promptId, versionNumber, [promptId+versionNumber]",
      modelConfigs: "id, provider",
      embedConfig: "id",
      evalRuns: "id, status, createdAt, testSuiteId",
      evalResults:
        "id, evalRunId, testCaseId, [evalRunId+testCaseId], [evalRunId+promptVersionId+modelDefId]",
      knowledgeBases: "id, name, embeddingProvider, createdAt",
      kbDocuments: "id, knowledgeBaseId, filename, createdAt, [knowledgeBaseId+createdAt]",
      kbChunks: "id, knowledgeBaseId, documentId, index, [knowledgeBaseId+index]",
    });
  }
}

// 单例
let _db: EvalStudioDB | null = null;
export function getDB(): EvalStudioDB {
  if (typeof window === "undefined") {
    // 服务端调用直接抛错（业务逻辑应只在 Client Component 调）
    throw new Error("Dexie 仅在客户端可用");
  }
  if (!_db) _db = new EvalStudioDB();
  return _db;
}
