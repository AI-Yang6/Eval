// 全局类型定义 — 对齐 PRD 04 文档第 3.2 节

export interface TestSuite {
  id: string;
  name: string;
  description: string;
  type: "single-turn" | "multi-turn";
  createdAt: string;
  updatedAt: string;
}

export interface Turn {
  role: "user" | "assistant";
  content: string;
}

export interface TestCase {
  id: string;
  testSuiteId: string;
  input: string;
  expected: string;
  tags: string[];
  order: number;
  turns?: Turn[];
}

export interface Prompt {
  id: string;
  name: string;
  createdAt: string;
}

export interface PromptVersion {
  id: string;
  promptId: string;
  versionNumber: number;
  systemPrompt: string;
  userPromptTemplate: string;
  createdAt: string;
}

export type ModelProvider =
  | "openai"
  | "anthropic"
  | "deepseek"
  | "qwen"
  | "glm"
  | "kimi"
  | "doubao"
  | "minimax";

export interface ModelDefinition {
  id: string;
  modelId: string;
  label: string;
  enabled: boolean;
  inputPricePer1k: number;
  outputPricePer1k: number;
  isCustom?: boolean;
}

export interface ModelConfig {
  id: string;
  provider: ModelProvider;
  apiKey: string;
  baseURL?: string;
  models: ModelDefinition[];
}

export interface RubricDimension {
  name: string;
  description: string;
}

export type EvalRunStatus = "running" | "completed" | "failed" | "cancelled";

export interface EvalRun {
  id: string;
  name: string;
  status: EvalRunStatus;
  testSuiteId: string;
  promptVersionIds: string[];
  modelDefIds: string[];
  rubric: RubricDimension[];
  judgeModelDefId: string;
  knowledgeBaseId?: string;
  topK?: number;
  createdAt: string;
  completedAt: string | null;
}

export interface EvalResult {
  id: string;
  evalRunId: string;
  testCaseId: string;
  promptVersionId: string;
  modelDefId: string;
  actualOutput: string;
  tokenUsage: { input: number; output: number };
  latency: number;
  scores: Record<string, number>;
  judgeReasoning: string;
  error: string | null;
  badCase?: boolean;
  humanScores?: Record<string, number>;
  retrievedChunks?: Array<{ content: string; score: number }>;
}

export interface KnowledgeBase {
  id: string;
  name: string;
  description: string;
  embeddingProvider: ModelProvider;
  embeddingModel: string;
  chunkCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface KBDocument {
  id: string;
  knowledgeBaseId: string;
  filename: string;
  content: string;
  charCount: number;
  chunkCount: number;
  createdAt: string;
}

export interface KBChunk {
  id: string;
  knowledgeBaseId: string;
  documentId: string;
  content: string;
  index: number;
  embedding: Float64Array;
}

export interface EmbedConfig {
  id: string;       // 固定值 "global"
  apiKey: string;
  baseURL?: string;
}
