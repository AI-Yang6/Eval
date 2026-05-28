import { describe, expect, it } from "vitest";

import { parseCSVCases, parseJSONCases } from "./import-parser";

describe("parseJSONCases", () => {
  it("parses valid JSON cases and normalizes optional fields", () => {
    const result = parseJSONCases(
      JSON.stringify([
        { input: "我想退款", expected: "引导退款流程", tags: ["退款", 12] },
        { input: "多久到账" },
      ])
    );

    expect(result.error).toBeUndefined();
    expect(result.cases).toEqual([
      { input: "我想退款", expected: "引导退款流程", tags: ["退款"] },
      { input: "多久到账", expected: "", tags: [] },
    ]);
  });

  it("returns a row-level error when input is missing", () => {
    const result = parseJSONCases(JSON.stringify([{ expected: "x" }]));

    expect(result.cases).toEqual([]);
    expect(result.error).toContain("第 1 行缺少 input");
  });
});

describe("parseCSVCases", () => {
  it("parses quoted fields and semicolon-separated tags", () => {
    const result = parseCSVCases(
      'input,expected,tags\n"用户说 ""退款""",说明政策,"退款; 政策"\n'
    );

    expect(result.error).toBeUndefined();
    expect(result.cases).toEqual([
      {
        input: '用户说 "退款"',
        expected: "说明政策",
        tags: ["退款", "政策"],
      },
    ]);
  });

  it("requires an input column", () => {
    const result = parseCSVCases("expected,tags\n说明,退款");

    expect(result.cases).toEqual([]);
    expect(result.error).toBe("CSV 表头必须包含 input 列");
  });
});
