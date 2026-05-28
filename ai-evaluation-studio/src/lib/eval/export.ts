import type {
  EvalRun,
  EvalResult,
  TestCase,
  TestSuite,
} from "@/lib/types";
import { overallScore } from "./judge";

interface ComboMeta {
  promptVersionId: string;
  modelDefId: string;
  promptName: string;
  versionNumber: number;
  modelLabel: string;
  inputPricePer1k: number;
  outputPricePer1k: number;
}

interface ExportPayload {
  run: EvalRun;
  suite: TestSuite;
  cases: TestCase[];
  results: EvalResult[];
  combos: ComboMeta[];
}

function csvEscape(v: unknown): string {
  const s = v === null || v === undefined ? "" : String(v);
  if (s.includes(",") || s.includes('"') || s.includes("\n") || s.includes("\r")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

// 一行一个 (case × combo) 结果
export function buildCSV(p: ExportPayload): string {
  const dimNames = p.run.rubric.map((d) => d.name);
  const headers = [
    "case_order",
    "case_input",
    "case_expected",
    "prompt_name",
    "prompt_version",
    "model_label",
    ...dimNames.map((n) => `score_${n}`),
    "score_overall",
    "actual_output",
    "judge_reasoning",
    "latency_ms",
    "input_tokens",
    "output_tokens",
    "cost",
    "error",
  ];
  const rows: string[] = [headers.join(",")];

  const resultMap = new Map<string, EvalResult>();
  for (const r of p.results) {
    resultMap.set(`${r.testCaseId}::${r.promptVersionId}::${r.modelDefId}`, r);
  }

  for (const tc of p.cases) {
    for (const c of p.combos) {
      const r = resultMap.get(`${tc.id}::${c.promptVersionId}::${c.modelDefId}`);
      const cells: unknown[] = [
        tc.order,
        tc.input,
        tc.expected,
        c.promptName,
        `v${c.versionNumber}`,
        c.modelLabel,
        ...dimNames.map((n) => r?.scores?.[n] ?? ""),
        r && !r.error && Object.keys(r.scores).length > 0
          ? overallScore(r.scores).toFixed(2)
          : "",
        r?.actualOutput ?? "",
        r?.judgeReasoning ?? "",
        r?.latency ?? "",
        r?.tokenUsage?.input ?? "",
        r?.tokenUsage?.output ?? "",
        r && !r.error
          ? (
              (r.tokenUsage.input / 1000) * c.inputPricePer1k +
              (r.tokenUsage.output / 1000) * c.outputPricePer1k
            ).toFixed(6)
          : "",
        r?.error ?? "",
      ];
      rows.push(cells.map(csvEscape).join(","));
    }
  }
  return rows.join("\n");
}

// Markdown 报告：摘要 + 综合分排名 + 维度详情 + 逐 case 简要
export function buildMarkdown(p: ExportPayload): string {
  const lines: string[] = [];
  const dimNames = p.run.rubric.map((d) => d.name);

  // 头
  lines.push(`# ${p.run.name}`);
  lines.push("");
  lines.push(
    `- 测试集：${p.suite.name}（${p.cases.length} 条用例）`
  );
  lines.push(`- 创建：${new Date(p.run.createdAt).toLocaleString()}`);
  if (p.run.completedAt) {
    lines.push(`- 完成：${new Date(p.run.completedAt).toLocaleString()}`);
  }
  lines.push(`- 状态：${p.run.status}`);
  const failed = p.results.filter((r) => r.error).length;
  lines.push(
    `- 完成调用：${p.results.length - failed} / ${p.results.length}${
      failed > 0 ? `（${failed} 条失败）` : ""
    }`
  );
  // 成本
  const priceMap = new Map<string, { inP: number; outP: number }>();
  for (const c of p.combos) {
    priceMap.set(c.modelDefId, { inP: c.inputPricePer1k, outP: c.outputPricePer1k });
  }
  let totalCost = 0;
  let totalIn = 0;
  let totalOut = 0;
  for (const r of p.results) {
    if (r.error) continue;
    const pr = priceMap.get(r.modelDefId) ?? { inP: 0, outP: 0 };
    totalCost += (r.tokenUsage.input / 1000) * pr.inP + (r.tokenUsage.output / 1000) * pr.outP;
    totalIn += r.tokenUsage.input;
    totalOut += r.tokenUsage.output;
  }
  lines.push(`- Token 消耗：${totalIn.toLocaleString()} in + ${totalOut.toLocaleString()} out`);
  lines.push(`- 实际成本：≈ $${totalCost.toFixed(4)}`);
  lines.push("");

  // 评分维度
  lines.push("## 评分维度");
  lines.push("");
  for (const d of p.run.rubric) {
    lines.push(`- **${d.name}**：${d.description}`);
  }
  lines.push("");

  // 每组合得分
  const resultMap = new Map<string, EvalResult>();
  for (const r of p.results) {
    resultMap.set(`${r.testCaseId}::${r.promptVersionId}::${r.modelDefId}`, r);
  }

  const comboScores = p.combos.map((c) => {
    const subset = p.results.filter(
      (r) =>
        r.promptVersionId === c.promptVersionId &&
        r.modelDefId === c.modelDefId &&
        !r.error &&
        Object.keys(r.scores).length > 0
    );
    const perDim: Record<string, number> = {};
    for (const dn of dimNames) {
      const sum = subset.reduce((a, r) => a + (r.scores[dn] ?? 0), 0);
      perDim[dn] = subset.length > 0 ? sum / subset.length : 0;
    }
    const overall =
      Object.values(perDim).reduce((a, b) => a + b, 0) /
      (dimNames.length || 1);
    const cost = subset.reduce(
      (sum, r) =>
        sum +
        (r.tokenUsage.input / 1000) * c.inputPricePer1k +
        (r.tokenUsage.output / 1000) * c.outputPricePer1k,
      0
    );
    const avgCost = subset.length > 0 ? cost / subset.length : 0;
    const scorePerDollar = cost > 0 && overall > 0 ? overall / cost : null;
    return {
      combo: c,
      perDim,
      overall,
      count: subset.length,
      cost,
      avgCost,
      scorePerDollar,
    };
  });
  comboScores.sort((a, b) => b.overall - a.overall);

  lines.push("## 综合得分排名");
  lines.push("");
  lines.push("| 排名 | Prompt | 版本 | 模型 | 综合分 | 有效样本 | 成本 | 平均成本/样本 | 分/$ |");
  lines.push("| --- | --- | --- | --- | --- | --- | --- | --- | --- |");
  comboScores.forEach((cs, i) => {
    lines.push(
      `| ${i + 1}${i === 0 ? " 🏆" : ""} | ${cs.combo.promptName} | v${
        cs.combo.versionNumber
      } | ${cs.combo.modelLabel} | ${cs.overall.toFixed(2)} | ${cs.count} | $${cs.cost.toFixed(4)} | $${cs.avgCost.toFixed(4)} | ${
        cs.scorePerDollar === null ? "-" : cs.scorePerDollar.toFixed(1)
      } |`
    );
  });
  lines.push("");

  // 维度详情
  lines.push("## 维度得分详情");
  lines.push("");
  lines.push(
    "| 组合 | " + dimNames.join(" | ") + " |"
  );
  lines.push(
    "| --- |" + dimNames.map(() => " --- |").join("")
  );
  for (const cs of comboScores) {
    lines.push(
      `| v${cs.combo.versionNumber} + ${cs.combo.modelLabel} | ` +
        dimNames.map((dn) => cs.perDim[dn].toFixed(2)).join(" | ") +
        " |"
    );
  }
  lines.push("");

  // 逐 case 摘要
  lines.push("## 逐 Case 概览");
  lines.push("");
  for (const tc of p.cases) {
    lines.push(`### #${tc.order} ${truncate(tc.input, 60)}`);
    lines.push("");
    lines.push(`**输入：** ${tc.input}`);
    if (tc.expected) {
      lines.push("");
      lines.push(`**期望：** ${tc.expected}`);
    }
    lines.push("");
    for (const c of p.combos) {
      const r = resultMap.get(`${tc.id}::${c.promptVersionId}::${c.modelDefId}`);
      lines.push(
        `#### v${c.versionNumber} + ${c.modelLabel}` +
          (r && !r.error && Object.keys(r.scores).length > 0
            ? ` — 综合分 **${overallScore(r.scores).toFixed(2)}**`
            : "")
      );
      lines.push("");
      if (!r) {
        lines.push("_无数据_");
      } else if (r.error) {
        lines.push(`> ❌ ${r.error}`);
      } else {
        const dimText = dimNames
          .map((dn) => `${dn}: ${r.scores[dn] ?? "-"}`)
          .join(" · ");
        lines.push("```");
        lines.push(r.actualOutput);
        lines.push("```");
        lines.push("");
        lines.push(`**评分：** ${dimText}`);
        if (r.judgeReasoning) {
          lines.push("");
          lines.push(`**Judge：** ${r.judgeReasoning}`);
        }
      }
      lines.push("");
    }
  }

  return lines.join("\n");
}

function truncate(s: string, n: number): string {
  if (s.length <= n) return s;
  return s.slice(0, n) + "…";
}

export function downloadFile(
  filename: string,
  content: string,
  mime: string
): void {
  const bom = mime.startsWith("text/csv") ? "﻿" : "";
  const blob = new Blob([bom + content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
