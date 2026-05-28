# AI Evaluation Studio — PRD：技术实现方案

> 文档版本：v0.2 · 2026-05-27
> 前置依赖：03_PRD_核心功能.md（P0 功能定义）
> 目的：为 MVP 开发提供可直接执行的技术方案

---

## 1. 技术栈确认

| 层级 | 技术 | 版本 | 说明 |
|---|---|---|---|
| 框架 | Next.js (App Router) | 16.x | RSC + Client Components 混用 |
| UI | Tailwind CSS + shadcn/ui | tailwind 4.x | 组件按需安装 |
| 状态 | zustand | 5.x | 轻量，适合 MVP |
| 数据库 | Dexie.js (IndexedDB) | 4.x | 前端本地存储 |
| 图表 | recharts | 3.x | 雷达图 + 折线图 |
| 图标 | lucide-react | latest | |
| 模型调用 | Vercel AI SDK | 6.x | 统一多 provider 接口 |
| 部署 | Vercel | — | 一键部署，免费 tier |
| 包管理 | npm | package-lock.json | 当前仓库使用 npm lockfile |
| 测试 | Vitest | 4.x | 纯逻辑单元测试 |

---

## 2. 项目结构

```
ai-evaluation-studio/
├── app/
│   ├── layout.tsx              # 全局布局（侧边栏 + 主内容）
│   ├── page.tsx                # Dashboard 引导页
│   ├── (main)/                 # 路由组（含侧边栏布局）
│   │   ├── test-suites/
│   │   │   ├── page.tsx        # 测试集列表
│   │   │   └── [id]/
│   │   │       └── page.tsx    # 测试集详情（含分页、标签筛选）
│   │   ├── prompts/
│   │   │   ├── page.tsx        # Prompt 列表
│   │   │   └── [id]/
│   │   │       └── page.tsx    # Prompt 详情（版本切换/编辑/diff/关联评估）
│   │   ├── models/
│   │   │   └── page.tsx        # 模型配置 + Embedding 统一凭证
│   │   ├── evaluations/
│   │   │   ├── new/
│   │   │   │   └── page.tsx    # 创建评估（步骤式向导）
│   │   │   └── [id]/
│   │   │       └── page.tsx    # 评估进度 + 实时轮询
│   │   ├── reports/
│   │   │   └── [id]/
│   │   │       └── page.tsx    # 评估报告（雷达图/维度表/Case对比/校准度/回归检测/导出）
│   │   ├── history/
│   │   │   └── page.tsx        # 迭代历史（趋势图 + 列表 + 筛选）
│   │   ├── knowledge/
│   │   │   ├── page.tsx        # 知识库列表
│   │   │   └── [id]/
│   │   │       └── page.tsx    # 知识库详情（文档上传/向量化）
│   │   └── layout.tsx          # 侧边栏 + 内容区布局
│   └── api/
│       ├── embed/route.ts      # Embedding API 代理
│       ├── generate/route.ts   # 模型调用 API 代理
│       └── test-connection/route.ts  # 测试连接 API
│
├── components/
│   ├── ui/                     # shadcn/ui 组件
│   ├── layout/
│   │   ├── sidebar.tsx         # 侧边栏
│   │   ├── page-header.tsx     # 页面标题栏
│   │   └── empty-state.tsx     # 通用空状态
│   ├── models/
│   │   ├── configure-provider-dialog.tsx
│   │   └── embed-config-card.tsx  # Embedding 统一凭证卡片
│   ├── prompts/
│   │   └── create-dialog.tsx
│   ├── test-suites/
│   │   ├── create-dialog.tsx
│   │   ├── import-dialog.tsx   # JSON/CSV 导入
│   │   └── test-case-dialog.tsx
│   └── backup/
│       └── backup-dialog.tsx   # 数据备份与恢复
│
├── lib/
│   ├── db/
│   │   ├── index.ts            # Dexie 初始化（v3）
│   │   ├── test-suites.ts      # 测试集 CRUD
│   │   ├── prompts.ts          # Prompt CRUD
│   │   ├── models.ts           # 模型配置 CRUD
│   │   ├── evaluations.ts      # 评估记录 CRUD（含 bad case 标记）
│   │   ├── knowledge.ts        # 知识库 CRUD（含文档向量化/检索）
│   │   ├── embed-config.ts     # Embedding 统一凭证
│   │   └── backup.ts           # 数据备份/恢复（v3）
│   ├── eval/
│   │   ├── runner.ts           # 评估执行主逻辑（并发控制 + 取消）
│   │   ├── judge.ts            # LLM-as-Judge 逻辑
│   │   ├── regression.ts       # Bad case 回归检测
│   │   └── export.ts           # CSV/Markdown/JSON 导出
│   ├── model-adapters/
│   │   └── presets.ts          # 预设模型配置（OpenAI/Anthropic/DeepSeek/Qwen）
│   ├── types/
│   │   └── index.ts            # 全局类型定义
│   └── utils/
│       ├── import-parser.ts    # JSON/CSV 解析
│       ├── text-diff.ts        # 文本差异比较
│       └── format.ts           # 格式化工具
│
├── .env.local                  # (不存 API Key，Key 在用户端 localStorage)
├── next.config.ts
├── tailwind.config.ts
├── package.json
└── tsconfig.json
```

---

## 3. 数据库设计 (Dexie / IndexedDB)

### 3.1 表结构

```typescript
// lib/db/index.ts
import Dexie, { type Table } from 'dexie';

export class EvalStudioDB extends Dexie {
  testSuites!: Table<TestSuite>;
  testCases!: Table<TestCase>;
  prompts!: Table<Prompt>;
  promptVersions!: Table<PromptVersion>;
  modelConfigs!: Table<ModelConfig>;
  embedConfig!: Table<EmbedConfig>;
  evalRuns!: Table<EvalRun>;
  evalResults!: Table<EvalResult>;
  knowledgeBases!: Table<KnowledgeBase>;
  kbDocuments!: Table<KBDocument>;
  kbChunks!: Table<KBChunk>;

  constructor() {
    super('EvalStudioDB');
    this.version(1).stores({
      testSuites: 'id, name, createdAt',
      testCases: 'id, testSuiteId, [testSuiteId+id]',
      prompts: 'id, name, createdAt',
      promptVersions: 'id, promptId, versionNumber, [promptId+versionNumber]',
      modelConfigs: 'id, provider',
      evalRuns: 'id, status, createdAt',
      evalResults: 'id, evalRunId, [evalRunId+testCaseId]',
    });
    this.version(2).stores({
      // v2: 新增知识库表
      knowledgeBases: 'id, name, createdAt',
      kbDocuments: 'id, knowledgeBaseId',
      kbChunks: 'id, knowledgeBaseId, documentId',
    });
    this.version(3).stores({
      testSuites: 'id, name, createdAt',
      testCases: 'id, testSuiteId, [testSuiteId+id]',
      prompts: 'id, name, createdAt',
      promptVersions: 'id, promptId, versionNumber, [promptId+versionNumber]',
      modelConfigs: 'id, provider',
      embedConfig: 'id',
      evalRuns: 'id, status, createdAt',
      evalResults: 'id, evalRunId, [evalRunId+testCaseId]',
      knowledgeBases: 'id, name, createdAt',
      kbDocuments: 'id, knowledgeBaseId',
      kbChunks: 'id, knowledgeBaseId, documentId',
    });
  }
}

export const db = new EvalStudioDB();
```

### 3.2 类型定义

```typescript
// lib/types/index.ts

export interface TestSuite {
  id: string;
  name: string;
  description: string;
  type: 'single-turn' | 'multi-turn';
  createdAt: string;
  updatedAt: string;
}

export interface TestCase {
  id: string;
  testSuiteId: string;
  input: string;
  expected: string;
  tags: string[];
  order: number;
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

export interface ModelConfig {
  id: string;
  provider: 'openai' | 'anthropic';
  apiKey: string; // 存 localStorage，MVP 阶段接受风险
  models: ModelDefinition[];
}

export interface ModelDefinition {
  id: string;
  modelId: string;
  label: string;
  enabled: boolean;
  inputPricePer1k: number;
  outputPricePer1k: number;
}

export interface EvalRun {
  id: string;
  name: string;
  status: 'running' | 'completed' | 'failed';
  testSuiteId: string;
  promptVersionIds: string[];
  modelDefIds: string[];
  rubric: RubricDimension[];
  judgeModelDefId: string;
  createdAt: string;
  completedAt: string | null;
}

export interface RubricDimension {
  name: string;
  description: string;
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
  humanScores?: Record<string, number>;  // 人工评分
  badCase?: boolean;                     // bad case 标记
  retrievedChunks?: Array<{ content: string; score: number }>;  // RAG 知识片段
}
```

---

## 4. 核心模块实现方案

### 4.1 模型调用适配器

```typescript
// lib/model-adapters/base.ts
export interface ModelAdapter {
  generate(input: string, systemPrompt: string, modelId: string): Promise<{
    output: string;
    usage: { inputTokens: number; outputTokens: number };
    latency: number;
  }>;
}

// lib/model-adapters/openai.ts
// 使用 Vercel AI SDK 的 generateText
import { generateText } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';

export class OpenAIAdapter implements ModelAdapter {
  private client;

  constructor(apiKey: string) {
    this.client = createOpenAI({ apiKey });
  }

  async generate(input: string, systemPrompt: string, modelId: string) {
    const start = Date.now();
    const { text, usage } = await generateText({
      model: this.client(modelId),
      system: systemPrompt,
      prompt: input,
    });
    return {
      output: text,
      usage: { inputTokens: usage.promptTokens, outputTokens: usage.completionTokens },
      latency: Date.now() - start,
    };
  }
}

// lib/model-adapters/anthropic.ts
import { createAnthropic } from '@ai-sdk/anthropic';

export class AnthropicAdapter implements ModelAdapter {
  private client;

  constructor(apiKey: string) {
    this.client = createAnthropic({ apiKey });
  }

  async generate(input: string, systemPrompt: string, modelId: string) {
    const start = Date.now();
    const { text, usage } = await generateText({
      model: this.client(modelId),
      system: systemPrompt,
      prompt: input,
    });
    return {
      output: text,
      usage: { inputTokens: usage.promptTokens, outputTokens: usage.completionTokens },
      latency: Date.now() - start,
    };
  }
}
```

### 4.2 评估引擎

```typescript
// lib/eval-engine/runner.ts
// 核心执行逻辑：并行调用多模型，收集结果

interface RunConfig {
  testSuiteId: string;
  promptVersionIds: string[];
  modelDefIds: string[];
  rubric: RubricDimension[];
  judgeModelDefId: string;
}

interface RunProgress {
  total: number;
  completed: number;
  currentCombo: string; // "v2 + GPT-4o"
  status: 'running' | 'judge' | 'completed' | 'failed';
}

export class EvalRunner {
  // 并发控制
  private concurrency = 3;
  private abortController = new AbortController();

  async run(config: RunConfig, onProgress: (p: RunProgress) => void) {
    // 1. 加载测试集
    const cases = await db.testCases.where('testSuiteId').equals(config.testSuiteId).toArray();

    // 2. 生成所有组合
    const combos = [];
    for (const pvId of config.promptVersionIds) {
      for (const mId of config.modelDefIds) {
        combos.push({ promptVersionId: pvId, modelDefId: mId });
      }
    }

    // 3. 并行执行（控制并发）
    const total = combos.length * cases.length;
    let completed = 0;

    for (const combo of combos) {
      const promptVersion = await db.promptVersions.get(combo.promptVersionId);
      const modelConfig = await getModelDef(combo.modelDefId);

      // 对每个 case 调用模型
      const batchResults = await Promise.allSettled(
        chunk(cases, this.concurrency).map(batch =>
          Promise.all(batch.map(async (tc) => {
            const result = await adapter.generate(
              renderTemplate(promptVersion.userPromptTemplate, { input: tc.input }),
              promptVersion.systemPrompt,
              modelConfig.modelId
            );
            completed++;
            onProgress({ total, completed, currentCombo: `v${promptVersion.versionNumber}+${modelConfig.label}`, status: 'running' });
            return { testCase: tc, ...result };
          }))
        )
      );

      // 4. LLM-as-Judge 打分
      // ...
    }
  }
}
```

### 4.3 LLM-as-Judge

```typescript
// lib/eval-engine/judge.ts

export function buildJudgePrompt(
  rubric: RubricDimension[],
  input: string,
  expected: string,
  actual: string
): string {
  const dimensionsText = rubric
    .map(d => `- ${d.name}：${d.description}`)
    .join('\n');

  return `你是一个专业的AI回复评估专家。请根据以下评估维度对AI回复进行打分。

评估维度：
${dimensionsText}

用户输入：
${input}

${expected ? `期望输出方向：\n${expected}` : ''}

AI实际回复：
${actual}

请按每个维度打分（1-5分，1=很差，5=优秀），并给出简短理由。

请严格按以下JSON格式输出，不要包含其他内容：
{
  "scores": {${rubric.map(d => `"${d.name}": 0`).join(', ')}},
  "reasoning": "简短说明评分理由"
}`;
}

export function parseJudgeResponse(response: string): {
  scores: Record<string, number>;
  reasoning: string;
} {
  // 提取 JSON（兼容 markdown 代码块包裹）
  const jsonMatch = response.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('Judge 返回格式错误');

  const parsed = JSON.parse(jsonMatch[0]);

  // 校验分数范围
  for (const [key, val] of Object.entries(parsed.scores)) {
    if (typeof val !== 'number' || val < 1 || val > 5) {
      parsed.scores[key] = Math.max(1, Math.min(5, Math.round(val as number)));
    }
  }

  return parsed;
}
```

### 4.4 分数聚合

```typescript
// lib/eval-engine/scorer.ts

export function computeDimensionScores(
  results: EvalResult[],
  rubric: RubricDimension[]
): Record<string, { avg: number; min: number; max: number }> {
  const scores: Record<string, number[]> = {};

  for (const r of results) {
    for (const dim of rubric) {
      if (!scores[dim.name]) scores[dim.name] = [];
      scores[dim.name].push(r.scores[dim.name] ?? 0);
    }
  }

  const summary: Record<string, { avg: number; min: number; max: number }> = {};
  for (const [name, vals] of Object.entries(scores)) {
    summary[name] = {
      avg: vals.reduce((a, b) => a + b, 0) / vals.length,
      min: Math.min(...vals),
      max: Math.max(...vals),
    };
  }
  return summary;
}

export function computeOverallScore(
  dimensionScores: Record<string, { avg: number }>
): number {
  const values = Object.values(dimensionScores).map(d => d.avg);
  return values.reduce((a, b) => a + b, 0) / values.length;
}
```

---

## 5. API Key 安全方案

### 5.1 MVP 方案（纯前端）
- API Key 存 localStorage，按 provider 存储
- 所有模型调用在浏览器端发起（直连 OpenAI / Anthropic API）
- **前提**：用户需要知道 Key 存在本地，清除浏览器数据会丢失

### 5.2 API 调用方式
- 由于浏览器直连有 CORS 限制，需要 Next.js API Route 做代理：

```typescript
// app/api/generate/route.ts
import { NextRequest } from 'next/server';

export async function POST(req: NextRequest) {
  const { provider, apiKey, modelId, systemPrompt, userPrompt } = await req.json();

  // 使用 Vercel AI SDK 统一调用
  if (provider === 'openai') {
    const { createOpenAI } = await import('@ai-sdk/openai');
    const client = createOpenAI({ apiKey });
    // ...
  } else if (provider === 'anthropic') {
    const { createAnthropic } = await import('@ai-sdk/anthropic');
    const client = createAnthropic({ apiKey });
    // ...
  }
}
```

**关键决策**：API Key 从前端传入 API Route，不做服务端存储。API Route 仅做转发，无状态。

---

## 6. MVP 开发里程碑

### Phase 1：基础框架 + 测试集 + Prompt（Day 1–2）
- [x] 项目初始化（Next.js + Tailwind + shadcn + Dexie）
- [x] 全局布局（侧边栏 + 导航）
- [x] 测试集 CRUD（列表 + 详情 + 新建 + 导入 + 分页 + 标签筛选）
- [x] Prompt CRUD（列表 + 详情 + 版本保存 + 版本 diff + 关联评估展示）

### Phase 2：模型配置 + 评估引擎（Day 3–4）
- [x] 模型配置页（Provider + API Key + 模型选择）
- [x] Embedding 统一凭证配置
- [x] API Route 代理（/api/generate, /api/embed, /api/test-connection）
- [x] 评估任务创建向导（含 RAG 知识库选项）
- [x] 并行执行引擎 + 实时进度 + 取消/重试
- [x] LLM-as-Judge 逻辑

### Phase 3：报告 + 历史（Day 5–6）
- [x] 评估报告页（综合得分 + 雷达图 + 维度表 + Case 对比 + Judge 校准度 + Bad case 回归检测）
- [x] 人工评分（报告页内直接打分）
- [x] 迭代历史页（趋势图 + 历史列表 + 筛选）
- [x] Dashboard 引导页
- [x] 导出 CSV / Markdown / JSON

### Phase 4：打磨 + 额外功能
- [x] 知识库（RAG）系统
- [x] 数据备份与恢复
- [x] 空状态 + 加载态 + 错误态
- [x] 响应式适配

---

## 7. 风险与对策

| 风险 | 影响 | 对策 |
|---|---|---|
| API Key 明文存 localStorage | 安全风险 | MVP 阶段可接受；远期迁 Supabase Vault |
| 浏览器直连 API 有 CORS | 功能不可用 | 通过 Next.js API Route 代理解决 |
| 大测试集（100+）执行慢 | 体验差 | 并发控制 + 进度反馈 + 可中断 |
| LLM-as-Judge 评分不稳定 | 评估结果不可信 | 同一 case 跑 2 次取均值（P1） |
| IndexedDB 容量限制 | 数据丢失风险 | 提示用户导出备份（P1） |

---

## 8. 验收标准（MVP 整体）

用户能在 10 分钟内完成以下完整流程：

1. ✅ 创建测试集（导入 JSON 或手写 5 条），查看分页和标签筛选
2. ✅ 创建 Prompt 并保存 2 个版本，查看版本 diff 和关联评估信息
3. ✅ 配置至少 1 个模型（填入 API Key），配置 Embedding 统一凭证
4. ✅ 创建评估任务（1 测试集 × 2 prompt × 1 模型），可选知识库
5. ✅ 看到评估实时进度，支持中止和重试
6. ✅ 查看评估报告（雷达图 + 维度表 + Case 详情 + Judge 校准度 + Bad case 回归检测）
7. ✅ 在历史页看到迭代趋势
8. ✅ 标记 bad case，下次评估后查看回归检测结果
9. ✅ 导出 CSV / Markdown / JSON
10. ✅ 数据备份与恢复
