import { v4 as uuid } from "uuid";
import { getDB } from "./index";
import { getModelConfig } from "./models";
import { getEmbedConfig } from "./embed-config";
import { splitIntoChunks } from "../knowledge/chunking";
import type {
  KnowledgeBase,
  KBDocument,
  KBChunk,
  ModelProvider,
} from "@/lib/types";

// ── KnowledgeBase CRUD ──

export async function listKnowledgeBases(): Promise<KnowledgeBase[]> {
  return getDB().knowledgeBases.reverse().sortBy("createdAt");
}

export async function getKnowledgeBase(
  id: string
): Promise<KnowledgeBase | undefined> {
  return getDB().knowledgeBases.get(id);
}

export async function createKnowledgeBase(input: {
  name: string;
  description: string;
  embeddingProvider: ModelProvider;
  embeddingModel: string;
}): Promise<KnowledgeBase> {
  const now = new Date().toISOString();
  const kb: KnowledgeBase = {
    id: uuid(),
    name: input.name.trim(),
    description: input.description.trim(),
    embeddingProvider: input.embeddingProvider,
    embeddingModel: input.embeddingModel,
    chunkCount: 0,
    createdAt: now,
    updatedAt: now,
  };
  await getDB().knowledgeBases.add(kb);
  return kb;
}

export async function deleteKnowledgeBase(id: string): Promise<void> {
  const db = getDB();
  await db.transaction("rw", [db.knowledgeBases, db.kbDocuments, db.kbChunks], async () => {
    const docs = await db.kbDocuments.where("knowledgeBaseId").equals(id).toArray();
    const docIds = docs.map((d) => d.id);
    if (docIds.length > 0) {
      await db.kbChunks.where("documentId").anyOf(docIds).delete();
      await db.kbDocuments.where("knowledgeBaseId").equals(id).delete();
    }
    await db.knowledgeBases.delete(id);
  });
}

// ── Document CRUD ──

export async function listDocuments(
  kbId: string
): Promise<KBDocument[]> {
  const db = getDB();
  const documents = await db
    .kbDocuments
    .where({ knowledgeBaseId: kbId })
    .reverse()
    .sortBy("createdAt");
  const repaired = await Promise.all(
    documents.map(async (document) => {
      const chunkCount = await db.kbChunks
        .where("documentId")
        .equals(document.id)
        .count();
      if (document.chunkCount !== chunkCount) {
        await db.kbDocuments.update(document.id, { chunkCount });
      }
      return document.chunkCount === chunkCount
        ? document
        : { ...document, chunkCount };
    })
  );
  const totalChunks = repaired.reduce((sum, document) => sum + document.chunkCount, 0);
  const kb = await db.knowledgeBases.get(kbId);
  if (kb && kb.chunkCount !== totalChunks) {
    await db.knowledgeBases.update(kbId, {
      chunkCount: totalChunks,
      updatedAt: new Date().toISOString(),
    });
  }
  return repaired;
}

export async function getDocument(
  id: string
): Promise<KBDocument | undefined> {
  return getDB().kbDocuments.get(id);
}

export async function deleteDocument(id: string): Promise<void> {
  const db = getDB();
  await db.transaction("rw", [db.kbDocuments, db.kbChunks, db.knowledgeBases], async () => {
    const doc = await db.kbDocuments.get(id);
    if (!doc) return;
    await db.kbChunks.where("documentId").equals(id).delete();
    await db.kbDocuments.delete(id);
    // update KB chunk count
    const total = await db.kbChunks
      .where("knowledgeBaseId")
      .equals(doc.knowledgeBaseId)
      .count();
    await db.knowledgeBases.update(doc.knowledgeBaseId, {
      chunkCount: total,
      updatedAt: new Date().toISOString(),
    });
  });
}

// ── Chunk operations ──

export async function listChunks(kbId: string): Promise<KBChunk[]> {
  return getDB()
    .kbChunks
    .where("knowledgeBaseId")
    .equals(kbId)
    .sortBy("index");
}

export async function listDocumentChunks(documentId: string): Promise<KBChunk[]> {
  return getDB()
    .kbChunks
    .where("documentId")
    .equals(documentId)
    .sortBy("index");
}

// ── Cosine similarity ──

function cosineSimilarity(a: Float64Array, b: Float64Array): number {
  if (a.length !== b.length) {
    throw new Error(`Embedding 维度不一致：查询 ${a.length}，知识片段 ${b.length}`);
  }
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

// ── Embed text via API ──

async function embedText(
  provider: ModelProvider,
  apiKey: string,
  baseURL: string | undefined,
  model: string,
  input: string
): Promise<{ embedding: Float64Array | null; error?: string }> {
  try {
    const res = await fetch("/api/embed", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ provider, apiKey, baseURL, model, input }),
    });
    const data = await res.json();
    if (!data.ok) {
      console.warn("[embed] failed:", data.error);
      return { embedding: null, error: data.error };
    }
    return { embedding: new Float64Array(data.embedding) };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn("[embed] exception:", msg);
    return { embedding: null, error: msg };
  }
}

// ── Add document (chunk + embed pipeline) ──

export async function addDocument(
  kbId: string,
  filename: string,
  content: string
): Promise<{ document: KBDocument; chunkCount: number; error?: string }> {
  const db = getDB();
  const kb = await getKnowledgeBase(kbId);
  if (!kb) throw new Error("知识库不存在");

  // 优先使用统一 EmbedConfig，否则回退到 per-provider ModelConfig
  const embedCfg = await getEmbedConfig();
  let apiKey: string;
  let baseURL: string | undefined;
  if (embedCfg?.apiKey) {
    apiKey = embedCfg.apiKey;
    baseURL = embedCfg.baseURL;
  } else {
    const config = await getModelConfig(kb.embeddingProvider);
    if (!config) {
      return {
        document: null as unknown as KBDocument,
        chunkCount: 0,
        error: `请先配置 ${kb.embeddingProvider} 的 API Key，或在「模型」页面配置统一 Embedding 凭证`,
      };
    }
    apiKey = config.apiKey;
    baseURL = config.baseURL;
  }

  // save document record
  const doc: KBDocument = {
    id: uuid(),
    knowledgeBaseId: kbId,
    filename: filename.trim() || "未命名文档",
    content,
    charCount: content.length,
    chunkCount: 0,
    createdAt: new Date().toISOString(),
  };

  // split into chunks
  const chunkTexts = splitIntoChunks(content);
  if (chunkTexts.length === 0) {
    return {
      document: doc,
      chunkCount: 0,
      error: "文档内容为空，无法切分",
    };
  }

  // embed each chunk sequentially
  const kbChunks: KBChunk[] = [];
  const errors: string[] = [];
  const seenErrors = new Set<string>();
  for (let i = 0; i < chunkTexts.length; i++) {
    const result = await embedText(
      kb.embeddingProvider,
      apiKey,
      baseURL,
      kb.embeddingModel,
      chunkTexts[i]
    );
    if (!result.embedding) {
      if (result.error && !seenErrors.has(result.error)) {
        seenErrors.add(result.error);
        errors.push(result.error);
      }
      continue;
    }
    kbChunks.push({
      id: uuid(),
      knowledgeBaseId: kbId,
      documentId: doc.id,
      content: chunkTexts[i],
      index: i,
      embedding: result.embedding,
    } as KBChunk);
  }

  if (kbChunks.length === 0) {
    return {
      document: doc,
      chunkCount: 0,
      error: `所有分块 Embedding 均失败：${errors[0] || "未知错误"}`,
    };
  }

  doc.chunkCount = kbChunks.length;

  // persist
  await db.transaction(
    "rw",
    [db.kbDocuments, db.kbChunks, db.knowledgeBases],
    async () => {
      await db.kbDocuments.add(doc);
      await db.kbChunks.bulkAdd(kbChunks);
      const total = await db.kbChunks
        .where("knowledgeBaseId")
        .equals(kbId)
        .count();
      await db.knowledgeBases.update(kbId, {
        chunkCount: total,
        updatedAt: new Date().toISOString(),
      });
    }
  );

  return {
    document: doc,
    chunkCount: kbChunks.length,
    ...(errors.length > 0 ? { error: `部分分块失败（${errors[0]}）` } : {}),
  };
}

// ── Retrieval ──

const embedCache = new Map<string, Float64Array>();

export async function retrieveContext(
  kbId: string,
  queryInput: string,
  provider: ModelProvider,
  apiKey: string,
  baseURL: string | undefined,
  model: string,
  topK: number = 3
): Promise<Array<{ content: string; score: number }>> {
  // embed query with cache
  const cacheKey = `${provider}::${model}::${queryInput}`;
  let queryEmbedding = embedCache.get(cacheKey);
  if (!queryEmbedding) {
    const result = await embedText(provider, apiKey, baseURL, model, queryInput);
    if (!result.embedding) {
      throw new Error(result.error || "查询文本 Embedding 失败");
    }
    queryEmbedding = result.embedding;
    embedCache.set(cacheKey, result.embedding);
  }

  const chunks = await listChunks(kbId);
  if (chunks.length === 0) return [];

  const scored = chunks
    .map((c) => ({
      content: c.content,
      score: cosineSimilarity(queryEmbedding!, c.embedding),
      index: c.index,
    }))
    .sort((a, b) => b.score - a.score);

  return scored.slice(0, topK).map(({ content, score }) => ({ content, score }));
}

export function clearEmbedCache(): void {
  embedCache.clear();
}

// ── Stats ──

export async function getKBStats(): Promise<{
  count: number;
  totalDocuments: number;
  totalChunks: number;
}> {
  const db = getDB();
  const kbs = await db.knowledgeBases.toArray();
  let totalDocuments = 0;
  let totalChunks = 0;
  for (const kb of kbs) {
    totalDocuments += await db.kbDocuments
      .where("knowledgeBaseId")
      .equals(kb.id)
      .count();
    totalChunks += kb.chunkCount;
  }
  return {
    count: kbs.length,
    totalDocuments,
    totalChunks,
  };
}
