"use client";

import { useEffect, useMemo, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Database,
  FileText,
  Cpu,
  Sparkles,
  Plus,
  X,
  Zap,
  Loader2,
  Check,
  BookOpen,
  DollarSign,
} from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/layout/page-header";
import { SpotlightCard } from "@/components/ui/spotlight-card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

import {
  listTestSuites,
  getTestSuiteStats,
} from "@/lib/db/test-suites";
import { listPromptsWithStats } from "@/lib/db/prompts";
import { getDB } from "@/lib/db";
import { listEnabledModels } from "@/lib/db/models";
import { createEvalRun } from "@/lib/db/evaluations";
import { startEvaluation } from "@/lib/eval/runner";
import { listKnowledgeBases } from "@/lib/db/knowledge";
import { RUBRIC_TEMPLATES } from "@/lib/eval/rubric-templates";
import type {
  TestSuite,
  PromptVersion,
  ModelConfig,
  ModelDefinition,
  RubricDimension,
  KnowledgeBase,
} from "@/lib/types";
import type { PromptWithStats } from "@/lib/db/prompts";

interface ModelEntry {
  config: ModelConfig;
  def: ModelDefinition;
}

interface PromptOption {
  prompt: PromptWithStats;
  versions: PromptVersion[];
}

const AVG_GENERATION_INPUT_TOKENS = 700;
const AVG_GENERATION_OUTPUT_TOKENS = 500;
const AVG_JUDGE_INPUT_TOKENS = 1100;
const AVG_JUDGE_OUTPUT_TOKENS = 300;
const AVG_CONTEXT_TOKENS_PER_CHUNK = 300;

function NewEvalInner() {
  const router = useRouter();
  const search = useSearchParams();
  const presetVersionId = search.get("promptVersionId");

  const [loading, setLoading] = useState(true);

  // data
  const [testSuites, setTestSuites] = useState<TestSuite[]>([]);
  const [suiteStats, setSuiteStats] = useState<
    Record<string, { count: number }>
  >({});
  const [promptOptions, setPromptOptions] = useState<PromptOption[]>([]);
  const [models, setModels] = useState<ModelEntry[]>([]);

  // form state
  const [suiteId, setSuiteId] = useState<string>("");
  const [versionIds, setVersionIds] = useState<Set<string>>(new Set());
  const [modelIds, setModelIds] = useState<Set<string>>(new Set());
  const [rubric, setRubric] = useState<RubricDimension[]>(
    RUBRIC_TEMPLATES[0].dimensions
  );
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>(
    RUBRIC_TEMPLATES[0].id
  );
  const [judgeModelId, setJudgeModelId] = useState<string>("");
  const [knowledgeBases, setKnowledgeBases] = useState<KnowledgeBase[]>([]);
  const [selectedKbId, setSelectedKbId] = useState<string>("");
  const [topK, setTopK] = useState<number>(3);
  const [name, setName] = useState<string>("");
  const [createdAtLabel] = useState(() =>
    new Date().toLocaleString("zh-CN", { hour12: false }).replace(/\//g, "-")
  );
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [suites, stats, prompts, enabled, kbs] = await Promise.all([
          listTestSuites(),
          getTestSuiteStats(),
          listPromptsWithStats(),
          listEnabledModels(),
          listKnowledgeBases(),
        ]);

        // 拉所有 PromptVersion，组装 promptOptions
        const allVersions = await getDB().promptVersions.toArray();
        const versionsByPrompt = new Map<string, PromptVersion[]>();
        for (const v of allVersions) {
          if (!versionsByPrompt.has(v.promptId)) {
            versionsByPrompt.set(v.promptId, []);
          }
          versionsByPrompt.get(v.promptId)!.push(v);
        }
        const options: PromptOption[] = prompts
          .map((p) => ({
            prompt: p,
            versions: (versionsByPrompt.get(p.id) ?? []).sort(
              (a, b) => b.versionNumber - a.versionNumber
            ),
          }))
          .filter((o) => o.versions.length > 0);

        setTestSuites(suites);
        setSuiteStats(stats);
        setPromptOptions(options);
        setModels(enabled);
        setKnowledgeBases(kbs);

        // 默认选中第一个测试集
        if (suites.length > 0) setSuiteId(suites[0].id);

        // 预设来自 prompt 详情页的版本
        if (presetVersionId) {
          setVersionIds(new Set([presetVersionId]));
        }

        // 默认全选模型
        const defaultModels = enabled.map((m) => m.def.id);
        setModelIds(new Set(defaultModels));

        // judge 默认：优先 OpenAI 的 mini 系列，否则第一个可用
        const miniJudge = enabled.find(
          (m) =>
            m.def.modelId === "gpt-4o-mini" ||
            m.def.modelId === "gpt-5-mini" ||
            m.def.modelId === "claude-haiku-4-5-20251001"
        );
        setJudgeModelId(miniJudge?.def.id ?? enabled[0]?.def.id ?? "");
      } catch (e) {
        toast.error(`加载失败：${e instanceof Error ? e.message : String(e)}`);
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectedSuite = testSuites.find((s) => s.id === suiteId);
  const caseCount = suiteId ? suiteStats[suiteId]?.count ?? 0 : 0;
  const effectiveName = name.trim() || (selectedSuite ? `${selectedSuite.name} 评估 ${createdAtLabel}` : "");

  function toggleVersion(id: string) {
    setVersionIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleModel(id: string) {
    setModelIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function applyTemplate(id: string) {
    const t = RUBRIC_TEMPLATES.find((x) => x.id === id);
    if (!t) return;
    setSelectedTemplateId(id);
    setRubric(t.dimensions.map((d) => ({ ...d })));
  }

  function updateDimension(
    idx: number,
    patch: Partial<RubricDimension>
  ) {
    setRubric((prev) =>
      prev.map((d, i) => (i === idx ? { ...d, ...patch } : d))
    );
    setSelectedTemplateId("custom");
  }

  function addDimension() {
    setRubric((prev) => [...prev, { name: "", description: "" }]);
    setSelectedTemplateId("custom");
  }

  function removeDimension(idx: number) {
    setRubric((prev) => prev.filter((_, i) => i !== idx));
    setSelectedTemplateId("custom");
  }

  // 估算
  const estimate = useMemo(() => {
    if (!suiteId || versionIds.size === 0 || modelIds.size === 0) return null;
    const selectedModels = models.filter((m) => modelIds.has(m.def.id));
    const judge = models.find((m) => m.def.id === judgeModelId);
    const contextTokens = selectedKbId ? topK * AVG_CONTEXT_TOKENS_PER_CHUNK : 0;
    const generationInputTokens = AVG_GENERATION_INPUT_TOKENS + contextTokens;
    const combos = versionIds.size * modelIds.size;
    const generationCalls = combos * caseCount;
    const judgeCalls = generationCalls; // 1 generation result gets 1 judge call

    const modelBreakdown = selectedModels.map((m) => {
      const calls = versionIds.size * caseCount;
      const cost =
        calls *
        ((generationInputTokens / 1000) * m.def.inputPricePer1k +
          (AVG_GENERATION_OUTPUT_TOKENS / 1000) * m.def.outputPricePer1k);
      return {
        id: m.def.id,
        label: m.def.label,
        provider: m.config.provider,
        calls,
        cost,
        hasPrice: m.def.inputPricePer1k > 0 || m.def.outputPricePer1k > 0,
      };
    });

    const generationCost = modelBreakdown.reduce((sum, item) => sum + item.cost, 0);
    let judgeCost = 0;
    if (judge) {
      judgeCost =
        judgeCalls *
        ((AVG_JUDGE_INPUT_TOKENS / 1000) * judge.def.inputPricePer1k +
          (AVG_JUDGE_OUTPUT_TOKENS / 1000) * judge.def.outputPricePer1k);
    }
    const cost = generationCost + judgeCost;
    const totalCalls = generationCalls + judgeCalls;
    const generationTokens =
      generationCalls * (generationInputTokens + AVG_GENERATION_OUTPUT_TOKENS);
    const judgeTokens =
      judgeCalls * (AVG_JUDGE_INPUT_TOKENS + AVG_JUDGE_OUTPUT_TOKENS);

    return {
      combos,
      generationCalls,
      judgeCalls,
      totalCalls,
      generationInputTokens,
      generationOutputTokens: AVG_GENERATION_OUTPUT_TOKENS,
      judgeInputTokens: AVG_JUDGE_INPUT_TOKENS,
      judgeOutputTokens: AVG_JUDGE_OUTPUT_TOKENS,
      generationTokens,
      judgeTokens,
      totalTokens: generationTokens + judgeTokens,
      generationCost,
      judgeCost,
      cost,
      avgCostPerCase: caseCount > 0 ? cost / caseCount : 0,
      modelBreakdown,
      hasMissingPrices:
        modelBreakdown.some((m) => !m.hasPrice) ||
        (!!judge &&
          judge.def.inputPricePer1k === 0 &&
          judge.def.outputPricePer1k === 0),
    };
  }, [
    suiteId,
    versionIds,
    modelIds,
    caseCount,
    judgeModelId,
    models,
    selectedKbId,
    topK,
  ]);

  function validate(): string | null {
    if (!suiteId) return "请选择测试集";
    if (caseCount === 0) return "选中的测试集没有用例，请先添加";
    if (versionIds.size === 0) return "至少选择一个 Prompt 版本";
    if (modelIds.size === 0) return "至少选择一个模型";
    if (rubric.length === 0) return "至少配置一个评估维度";
    for (const d of rubric) {
      if (!d.name.trim() || !d.description.trim()) {
        return "评估维度的名称和描述都不能为空";
      }
    }
    if (!judgeModelId) return "请选择 Judge 模型";
    if (!effectiveName) return "请填写评估名称";
    return null;
  }

  async function handleStart() {
    const err = validate();
    if (err) {
      toast.error(err);
      return;
    }
    setSubmitting(true);
    try {
      // 前置：对每个被勾选的模型 + judge 模型做一次 ping，
      // 避免假 Key / 错 baseURL 也能进入 running 状态卡死
      const modelDefIdsToCheck = new Set([
        ...Array.from(modelIds),
        judgeModelId,
      ]);
      const checks = Array.from(modelDefIdsToCheck).map(async (defId) => {
        const entry = models.find((m) => m.def.id === defId);
        if (!entry) return null;
        const res = await fetch("/api/test-connection", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            provider: entry.config.provider,
            apiKey: entry.config.apiKey,
            baseURL: entry.config.baseURL,
            modelId: entry.def.modelId,
          }),
        });
        const data = await res.json();
        if (!data.ok) {
          return {
            label: `${entry.config.provider} / ${entry.def.modelId}`,
            error: data.error ?? "未知错误",
          };
        }
        return null;
      });
      const failures = (await Promise.all(checks)).filter(
        (x): x is { label: string; error: string } => x !== null
      );
      if (failures.length > 0) {
        const first = failures[0];
        toast.error(
          `模型校验失败：${first.label} — ${first.error}${
            failures.length > 1 ? `（共 ${failures.length} 个失败）` : ""
          }`
        );
        return;
      }

      const run = await createEvalRun({
        name: effectiveName,
        testSuiteId: suiteId,
        promptVersionIds: Array.from(versionIds),
        modelDefIds: Array.from(modelIds),
        rubric: rubric.map((d) => ({
          name: d.name.trim(),
          description: d.description.trim(),
        })),
        judgeModelDefId: judgeModelId,
        knowledgeBaseId: selectedKbId || undefined,
        topK: selectedKbId ? topK : undefined,
      });
      // 后台启动（不 await），用户立刻进入进度页
      void startEvaluation(run.id);
      toast.success("评估已启动");
      router.push(`/evaluations/${run.id}`);
    } catch (e) {
      toast.error(`启动失败：${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="px-6 sm:px-10 lg:px-12 py-8 max-w-4xl mx-auto">
        <Skeleton className="h-10 w-64 mb-6" />
        <div className="space-y-4">
          {[0, 1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-32 rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  // 前置检查：如果什么数据都没有
  const noData =
    testSuites.length === 0 || promptOptions.length === 0 || models.length === 0;

  if (noData) {
    return (
      <div className="px-6 sm:px-10 lg:px-12 py-8 max-w-4xl mx-auto">
        <Link
          href="/"
          className="text-sm text-text-secondary hover:text-text-primary transition-colors flex items-center gap-1 mb-4"
        >
          <ArrowLeft className="w-4 h-4" />
          返回首页
        </Link>
        <PageHeader
          icon={Zap}
          title="新建评估"
          description="选择测试集、Prompt 版本和模型，一键运行评估"
        />
        <SpotlightCard className="border-dashed">
          <div className="py-16 px-6 text-center">
            <div className="w-14 h-14 rounded-xl bg-bg-card border border-border-subtle flex items-center justify-center mx-auto mb-4">
              <Zap className="w-6 h-6 text-text-tertiary" />
            </div>
            <h3 className="text-base font-semibold text-text-primary mb-1">
              准备工作还没完成
            </h3>
            <p className="text-sm text-text-secondary mb-6 max-w-md mx-auto">
              在新建评估前，需要先准备好测试集、Prompt 版本和模型配置
            </p>
            <div className="flex flex-col items-center gap-3">
              <CheckRow ok={testSuites.length > 0} href="/test-suites">
                {testSuites.length > 0
                  ? `${testSuites.length} 个测试集`
                  : "尚未创建测试集"}
              </CheckRow>
              <CheckRow ok={promptOptions.length > 0} href="/prompts">
                {promptOptions.length > 0
                  ? `${promptOptions.length} 个 Prompt（含版本）`
                  : "尚未创建 Prompt 版本"}
              </CheckRow>
              <CheckRow ok={models.length > 0} href="/models">
                {models.length > 0
                  ? `${models.length} 个启用模型`
                  : "尚未配置模型"}
              </CheckRow>
            </div>
          </div>
        </SpotlightCard>
      </div>
    );
  }

  return (
    <div className="px-6 sm:px-10 lg:px-12 py-8 max-w-4xl mx-auto">
      <Link
        href="/"
        className="text-sm text-text-secondary hover:text-text-primary transition-colors flex items-center gap-1 mb-4"
      >
        <ArrowLeft className="w-4 h-4" />
        返回首页
      </Link>
      <PageHeader
        icon={Zap}
        title="新建评估"
        description="选择测试集、Prompt 版本和模型，一键运行评估并生成对比报告"
      />

      <div className="space-y-4">
        {/* ① 测试集 */}
        <Step number={1} icon={Database} title="选择测试集">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {testSuites.map((s) => {
              const cnt = suiteStats[s.id]?.count ?? 0;
              const selected = s.id === suiteId;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setSuiteId(s.id)}
                  className={cn(
                    "text-left p-3 rounded-md border transition-all",
                    selected
                      ? "bg-primary-muted border-primary text-text-primary"
                      : "bg-bg-card border-border-subtle hover:border-border-strong"
                  )}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-base">📦</span>
                    <span className="text-sm font-medium truncate">
                      {s.name}
                    </span>
                  </div>
                  <div className="text-xs text-text-tertiary">
                    {cnt} 条用例 · {s.type === "single-turn" ? "单轮" : "多轮"}
                  </div>
                </button>
              );
            })}
          </div>
        </Step>

        {/* ② Prompt 版本 */}
        <Step
          number={2}
          icon={FileText}
          title="选择 Prompt 版本"
          subtitle={`已选 ${versionIds.size} 个版本`}
        >
          <div className="space-y-3">
            {promptOptions.map((opt) => (
              <div key={opt.prompt.id}>
                <div className="text-xs text-text-tertiary mb-1.5 px-1 flex items-center gap-1.5">
                  <span>📝</span>
                  <span className="font-medium text-text-secondary">
                    {opt.prompt.name}
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {opt.versions.map((v) => {
                    const checked = versionIds.has(v.id);
                    return (
                      <button
                        key={v.id}
                        type="button"
                        onClick={() => toggleVersion(v.id)}
                        className={cn(
                          "h-8 px-3 rounded-md text-sm font-mono transition-colors flex items-center gap-1.5 border",
                          checked
                            ? "bg-primary-muted text-primary border-[rgba(124,92,252,0.4)]"
                            : "bg-bg-card text-text-secondary hover:text-text-primary hover:bg-bg-hover border-border-subtle"
                        )}
                      >
                        {checked && <Check className="w-3 h-3" />}
                        v{v.versionNumber}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </Step>

        {/* ③ 模型 */}
        <Step
          number={3}
          icon={Cpu}
          title="选择模型"
          subtitle={`已选 ${modelIds.size} 个模型`}
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {models.map((m) => {
              const checked = modelIds.has(m.def.id);
              return (
                <button
                  key={m.def.id}
                  type="button"
                  onClick={() => toggleModel(m.def.id)}
                  className={cn(
                    "text-left p-3 rounded-md border transition-all flex items-start gap-2",
                    checked
                      ? "bg-primary-muted border-primary"
                      : "bg-bg-card border-border-subtle hover:border-border-strong"
                  )}
                >
                  <span
                    className={cn(
                      "w-4 h-4 rounded border flex items-center justify-center shrink-0 mt-0.5 transition-colors",
                      checked
                        ? "bg-primary border-primary"
                        : "border-border-default"
                    )}
                  >
                    {checked && (
                      <svg
                        viewBox="0 0 12 12"
                        className="w-3 h-3 text-white"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <path d="M2.5 6.5l2.5 2.5 4.5-5" />
                      </svg>
                    )}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-text-primary mb-0.5">
                      {m.def.label}
                    </div>
                    <div className="text-[11px] font-mono text-text-tertiary">
                      {m.config.provider} · in ${m.def.inputPricePer1k}/1k
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </Step>

        {/* ④ Rubric */}
        <Step number={4} icon={Sparkles} title="评估维度">
          <div className="flex items-center gap-2 mb-3 flex-wrap">
            <span className="text-xs text-text-tertiary mr-1">模板：</span>
            {RUBRIC_TEMPLATES.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => applyTemplate(t.id)}
                className={cn(
                  "h-7 px-3 rounded-md text-xs transition-colors border",
                  selectedTemplateId === t.id
                    ? "bg-primary-muted text-primary border-[rgba(124,92,252,0.4)]"
                    : "bg-bg-card text-text-secondary hover:text-text-primary hover:bg-bg-hover border-border-subtle"
                )}
              >
                {t.name}
              </button>
            ))}
            {selectedTemplateId === "custom" && (
              <Badge
                variant="secondary"
                className="bg-bg-hover text-text-tertiary border-border-subtle text-[10px]"
              >
                已自定义
              </Badge>
            )}
          </div>
          <div className="space-y-2">
            {rubric.map((d, idx) => (
              <div
                key={idx}
                className="grid grid-cols-[140px_1fr_auto] gap-2 items-start"
              >
                <Input
                  value={d.name}
                  placeholder="维度名"
                  onChange={(e) =>
                    updateDimension(idx, { name: e.target.value })
                  }
                  maxLength={20}
                />
                <Input
                  value={d.description}
                  placeholder="说明 Judge 如何评分这个维度"
                  onChange={(e) =>
                    updateDimension(idx, { description: e.target.value })
                  }
                  maxLength={200}
                />
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => removeDimension(idx)}
                  disabled={rubric.length <= 1}
                  aria-label="删除维度"
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={addDimension}
            >
              <Plus className="w-3.5 h-3.5" />
              添加维度
            </Button>
          </div>
        </Step>

        {/* ⑤ Judge */}
        <Step
          number={5}
          icon={Sparkles}
          title="Judge 模型"
          subtitle="用于给输出打分（建议选便宜且稳定的模型）"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {models.map((m) => {
              const checked = m.def.id === judgeModelId;
              return (
                <button
                  key={m.def.id}
                  type="button"
                  onClick={() => setJudgeModelId(m.def.id)}
                  className={cn(
                    "text-left p-3 rounded-md border transition-all flex items-center gap-2",
                    checked
                      ? "bg-primary-muted border-primary"
                      : "bg-bg-card border-border-subtle hover:border-border-strong"
                  )}
                >
                  <span
                    className={cn(
                      "w-4 h-4 rounded-full border flex items-center justify-center shrink-0 transition-colors",
                      checked
                        ? "border-primary"
                        : "border-border-default"
                    )}
                  >
                    {checked && (
                      <span className="w-2 h-2 rounded-full bg-primary" />
                    )}
                  </span>
                  <span className="text-sm font-medium text-text-primary">
                    {m.def.label}
                  </span>
                </button>
              );
            })}
          </div>
        </Step>

        {/* ⑥ 知识库（可选） */}
        <Step
          number={6}
          icon={BookOpen}
          title="知识库（可选）"
          subtitle={selectedKbId ? `已选择知识库` : "不注入上下文"}
        >
          <div className="space-y-2">
            <label className="flex items-center gap-2 p-3 rounded-md border border-border-subtle bg-bg-card cursor-pointer hover:border-border-strong transition-colors">
              <input
                type="radio"
                name="kb"
                checked={selectedKbId === ""}
                onChange={() => setSelectedKbId("")}
                className="accent-primary"
              />
              <span className="text-sm text-text-secondary">不使用知识库</span>
            </label>
            {knowledgeBases.map((kb) => (
              <label
                key={kb.id}
                className="flex items-center gap-2 p-3 rounded-md border border-border-subtle bg-bg-card cursor-pointer hover:border-border-strong transition-colors"
              >
                <input
                  type="radio"
                  name="kb"
                  checked={selectedKbId === kb.id}
                  onChange={() => setSelectedKbId(kb.id)}
                  className="accent-primary"
                />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-text-primary">{kb.name}</div>
                  <div className="text-xs text-text-tertiary">
                    {kb.chunkCount} 个片段 · {kb.embeddingModel}
                  </div>
                </div>
              </label>
            ))}
            {selectedKbId && (
              <div className="flex items-center gap-2 pl-7">
                <span className="text-xs text-text-tertiary">检索 Top-K:</span>
                <input
                  type="number"
                  min={1}
                  max={10}
                  value={topK}
                  onChange={(e) => setTopK(Math.max(1, Math.min(10, Number(e.target.value) || 3)))}
                  className="w-16 h-7 px-2 rounded-md text-xs font-mono bg-bg-card border border-border-subtle text-text-primary outline-none focus:border-primary"
                />
                <span className="text-xs text-text-tertiary">
                  （评测时会从知识库检索最相关的 {topK} 个片段，通过 {"{{context}}"} 注入到 Prompt 模板）
                </span>
              </div>
            )}
          </div>
        </Step>

        {/* 名称 + 摘要 */}
        <SpotlightCard className="p-5">
          <div className="flex flex-col gap-2 mb-4">
            <Label htmlFor="eval-name">评估名称</Label>
              <Input
                id="eval-name"
                value={name || (selectedSuite ? `${selectedSuite.name} 评估 ${createdAtLabel}` : "")}
                onChange={(e) => setName(e.target.value)}
                maxLength={100}
              />
          </div>

          {estimate && (
            <div className="rounded-md bg-bg-base border border-border-subtle p-4 mb-4">
              <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
                <div className="flex items-center gap-2">
                  <DollarSign className="w-4 h-4 text-primary" />
                  <div>
                    <div className="text-sm font-semibold text-text-primary">
                      评估规模与成本预估
                    </div>
                    <div className="text-xs text-text-tertiary">
                      按生成 {estimate.generationInputTokens} in / {estimate.generationOutputTokens} out，Judge {estimate.judgeInputTokens} in / {estimate.judgeOutputTokens} out 估算
                    </div>
                  </div>
                </div>
                <Badge
                  variant="secondary"
                  className="bg-primary-muted text-primary border-[rgba(124,92,252,0.25)] font-mono"
                >
                  ≈ ${estimate.cost.toFixed(4)}
                </Badge>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm mb-4">
                <div>
                  <div className="text-text-tertiary text-xs">组合数</div>
                  <div className="font-mono text-text-primary">
                    {estimate.combos}
                  </div>
                </div>
                <div>
                  <div className="text-text-tertiary text-xs">生成调用</div>
                  <div className="font-mono text-text-primary">
                    {estimate.generationCalls} 次
                  </div>
                </div>
                <div>
                  <div className="text-text-tertiary text-xs">Judge 调用</div>
                  <div className="font-mono text-text-primary">
                    {estimate.judgeCalls} 次
                  </div>
                </div>
                <div>
                  <div className="text-text-tertiary text-xs">总调用</div>
                  <div className="font-mono text-text-primary">
                    {estimate.totalCalls} 次
                  </div>
                </div>
                <div>
                  <div className="text-text-tertiary text-xs">预估 Token</div>
                  <div className="font-mono text-text-primary">
                    {estimate.totalTokens.toLocaleString()}
                  </div>
                </div>
                <div>
                  <div className="text-text-tertiary text-xs">生成成本</div>
                  <div className="font-mono text-text-primary">
                    ${estimate.generationCost.toFixed(4)}
                  </div>
                </div>
                <div>
                  <div className="text-text-tertiary text-xs">Judge 成本</div>
                  <div className="font-mono text-text-primary">
                    ${estimate.judgeCost.toFixed(4)}
                  </div>
                </div>
                <div>
                  <div className="text-text-tertiary text-xs">每条用例全量成本</div>
                  <div className="font-mono text-primary">
                    ${estimate.avgCostPerCase.toFixed(4)}
                  </div>
                </div>
              </div>

              <div className="space-y-1.5 mb-3">
                {estimate.modelBreakdown.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between gap-3 text-xs"
                  >
                    <span className="text-text-secondary truncate">
                      {item.provider} · {item.label}
                    </span>
                    <span className="font-mono text-text-tertiary shrink-0">
                      {item.calls} 次 · ${item.cost.toFixed(4)}
                    </span>
                  </div>
                ))}
              </div>

              <div className="space-y-1 text-xs text-text-tertiary border-t border-border-subtle pt-3">
                <p>
                  这是提交前的粗略预算，实际费用取决于 Prompt 长度、知识库上下文、模型返回长度和 Provider 真实计费。
                </p>
                {estimate.hasMissingPrices && (
                  <p className="text-warning">
                    部分模型价格为 0，成本可能被低估。建议在模型配置中补充自定义价格。
                  </p>
                )}
                {estimate.totalCalls >= 100 && (
                  <p className="text-warning">
                    本次评估调用量较大，建议先用小测试集抽样验证，再运行全量评估。
                  </p>
                )}
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2">
            <Button
              variant="ghost"
              onClick={() => router.back()}
              disabled={submitting}
            >
              取消
            </Button>
            <Button onClick={handleStart} disabled={submitting}>
              {submitting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Zap className="w-4 h-4" />
              )}
              {submitting ? "启动中..." : "开始评估"}
            </Button>
          </div>
        </SpotlightCard>
      </div>
    </div>
  );
}

function Step({
  number,
  icon: Icon,
  title,
  subtitle,
  children,
}: {
  number: number;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <SpotlightCard className="p-5">
      <div className="flex items-center gap-2.5 mb-4">
        <div className="w-7 h-7 rounded-md bg-primary-muted text-primary text-xs font-mono font-semibold flex items-center justify-center border border-[rgba(124,92,252,0.2)]">
          {number}
        </div>
        <Icon className="w-4 h-4 text-text-secondary" />
        <span className="font-semibold text-text-primary">{title}</span>
        {subtitle && (
          <span className="text-xs text-text-tertiary ml-auto">{subtitle}</span>
        )}
      </div>
      {children}
    </SpotlightCard>
  );
}

function CheckRow({
  ok,
  href,
  children,
}: {
  ok: boolean;
  href: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "flex items-center gap-2 px-4 py-2 rounded-md border transition-colors",
        ok
          ? "bg-primary-muted/40 border-[rgba(124,92,252,0.3)] text-text-primary"
          : "bg-bg-card border-border-subtle text-text-secondary hover:text-text-primary hover:bg-bg-hover"
      )}
    >
      {ok ? (
        <Check className="w-4 h-4 text-primary" />
      ) : (
        <Plus className="w-4 h-4 text-text-tertiary" />
      )}
      <span className="text-sm">{children}</span>
    </Link>
  );
}

export default function NewEvalPage() {
  return (
    <Suspense
      fallback={
        <div className="px-6 sm:px-10 lg:px-12 py-8 max-w-4xl mx-auto">
          <Skeleton className="h-10 w-64 mb-6" />
        </div>
      }
    >
      <NewEvalInner />
    </Suspense>
  );
}
