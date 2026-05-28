import { describe, expect, it } from "vitest";

import { buildJudgeUserPrompt, overallScore, parseJudgeOutput } from "./judge";
import type { RubricDimension } from "@/lib/types";

const rubric: RubricDimension[] = [
  { name: "准确性", description: "是否回答正确" },
  { name: "完整性", description: "是否覆盖关键点" },
];

describe("parseJudgeOutput", () => {
  it("extracts JSON from fenced model output and clamps scores", () => {
    const result = parseJudgeOutput(
      '```json\n{"scores":{"准确性":5.4,"完整性":"0"},"reasoning":"基本符合"}\n```',
      rubric
    );

    expect(result).toEqual({
      scores: { "准确性": 5, "完整性": 1 },
      reasoning: "基本符合",
    });
  });

  it("throws when a rubric dimension is missing", () => {
    expect(() =>
      parseJudgeOutput('{"scores":{"准确性":4}}', rubric)
    ).toThrow("维度「完整性」缺失或不是数字");
  });
});

describe("buildJudgeUserPrompt", () => {
  it("includes tested prompt constraints for judging terse outputs", () => {
    const prompt = buildJudgeUserPrompt({
      rubric,
      testInput: "这个订单能退款吗？",
      testedSystemPrompt: "你只能回答“是”或“否”。",
      testedUserPrompt: "这个订单能退款吗？",
      expected: "是",
      actualOutput: "是",
    });

    expect(prompt).toContain("[被测 System Prompt]");
    expect(prompt).toContain("你只能回答“是”或“否”。");
    expect(prompt).toContain("[被测实际 User Prompt]");
    expect(prompt).toContain("不应因为没有解释而直接判低分");
  });
});

describe("overallScore", () => {
  it("returns the arithmetic mean of dimensions", () => {
    expect(overallScore({ "准确性": 4, "完整性": 2 })).toBe(3);
  });

  it("returns 0 for empty scores", () => {
    expect(overallScore({})).toBe(0);
  });
});
