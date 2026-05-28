import type { RubricDimension } from "@/lib/types";

export interface JudgeInput {
  rubric: RubricDimension[];
  testInput: string;
  testedSystemPrompt: string;
  testedUserPrompt: string;
  expected: string;
  actualOutput: string;
  context?: string;
}

export interface JudgeResult {
  scores: Record<string, number>;
  reasoning: string;
}

export function buildJudgeSystemPrompt(rubric: RubricDimension[]): string {
  const dimList = rubric
    .map((d, i) => `${i + 1}. ${d.name}：${d.description}`)
    .join("\n");

  return `你是一名严谨的 AI 输出评审。给定一个用户输入与一段 AI 回复，请按照以下维度逐项打分（1~5 分整数）：

${dimList}

打分标准：
- 5 分：完全满足该维度要求，无明显瑕疵
- 4 分：基本满足，存在轻微改进空间
- 3 分：部分满足，存在明显问题但可用
- 2 分：勉强相关，问题较多
- 1 分：完全不满足或与该维度无关

输出严格遵循以下 JSON（不要任何额外文字、不要 markdown 代码块）：
{
  "scores": {${rubric.map((d) => `"${d.name}": <1-5 整数>`).join(", ")}},
  "reasoning": "<不超过 200 字的中文总评，指出关键优点与问题>"
}`;
}

export function buildJudgeUserPrompt(input: JudgeInput): string {
  const expectedSection = input.expected
    ? `\n[参考期望]\n${input.expected}`
    : "";
  const contextSection = input.context
    ? `\n[参考知识]\n${input.context}`
    : "";
  return `[被测 System Prompt]
${input.testedSystemPrompt}

[被测实际 User Prompt]
${input.testedUserPrompt}

[原始用户输入]
${input.testInput}
${expectedSection}
${contextSection}

[AI 实际回复]
${input.actualOutput}

评分要求：
- 必须结合被测 System Prompt 和实际 User Prompt 判断回复是否符合任务约束。
- 如果被测 Prompt 明确限制输出形式、长度、语言、格式或语气，不要因为回复遵守这些限制而扣分。
- 例如被测 System Prompt 要求只回答“是/否”时，应优先判断“是/否”是否准确，不应因为没有解释而直接判低分。
- 只有当回复违反被测 Prompt 约束、与参考期望冲突、或没有正确回答原始用户输入时，才按评分维度扣分。

请输出评分 JSON。`;
}

// 从模型输出里抠出 JSON。模型偶尔会包 markdown 代码块或前缀文字。
export function parseJudgeOutput(
  raw: string,
  rubric: RubricDimension[]
): JudgeResult {
  let text = raw.trim();
  // 去 ```json ... ``` 包裹
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) text = fence[1].trim();

  // 取第一个 { 到最后一个 }
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start >= 0 && end > start) {
    text = text.slice(start, end + 1);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    throw new Error(
      `Judge 输出不是合法 JSON：${e instanceof Error ? e.message : String(e)}`
    );
  }

  if (
    !parsed ||
    typeof parsed !== "object" ||
    !("scores" in parsed) ||
    typeof (parsed as { scores: unknown }).scores !== "object"
  ) {
    throw new Error("Judge 输出缺少 scores 字段");
  }

  const obj = parsed as Record<string, unknown>;
  const rawScores = obj.scores as Record<string, unknown>;
  const reasoning =
    typeof obj.reasoning === "string" ? obj.reasoning : "";

  const scores: Record<string, number> = {};
  for (const dim of rubric) {
    const v = rawScores[dim.name];
    const num = typeof v === "number" ? v : Number(v);
    if (!Number.isFinite(num)) {
      throw new Error(`维度「${dim.name}」缺失或不是数字`);
    }
    scores[dim.name] = Math.min(5, Math.max(1, Math.round(num)));
  }

  return { scores, reasoning };
}

// 综合得分：所有维度算术平均
export function overallScore(scores: Record<string, number>): number {
  const values = Object.values(scores);
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}
