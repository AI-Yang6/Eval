import type { TestCase } from "@/lib/types";

// 解析 JSON 文本 → 测试用例数组
export function parseJSONCases(
  text: string
): { cases: Array<Pick<TestCase, "input" | "expected" | "tags">>; error?: string } {
  try {
    const parsed = JSON.parse(text);
    if (!Array.isArray(parsed)) {
      return { cases: [], error: "JSON 必须是数组格式" };
    }
    const cases: Array<Pick<TestCase, "input" | "expected" | "tags">> = [];
    for (let i = 0; i < parsed.length; i++) {
      const item = parsed[i];
      if (typeof item !== "object" || item === null) {
        return { cases: [], error: `第 ${i + 1} 行不是合法对象` };
      }
      if (typeof item.input !== "string" || !item.input.trim()) {
        return { cases: [], error: `第 ${i + 1} 行缺少 input 字段或为空` };
      }
      cases.push({
        input: item.input,
        expected: typeof item.expected === "string" ? item.expected : "",
        tags: Array.isArray(item.tags)
          ? item.tags.filter((t: unknown) => typeof t === "string")
          : [],
      });
    }
    return { cases };
  } catch (e) {
    return {
      cases: [],
      error: `JSON 解析失败：${e instanceof Error ? e.message : String(e)}`,
    };
  }
}

// 解析 CSV 文本 → 测试用例数组
// 表头：input,expected,tags（tags 用分号分隔）
export function parseCSVCases(
  text: string
): { cases: Array<Pick<TestCase, "input" | "expected" | "tags">>; error?: string } {
  const lines = text.replace(/\r\n/g, "\n").split("\n").filter((l) => l.trim());
  if (lines.length < 2) {
    return { cases: [], error: "CSV 至少需要表头 + 1 行数据" };
  }

  const header = parseCSVLine(lines[0]).map((h) => h.toLowerCase().trim());
  const inputIdx = header.indexOf("input");
  if (inputIdx < 0) {
    return { cases: [], error: "CSV 表头必须包含 input 列" };
  }
  const expectedIdx = header.indexOf("expected");
  const tagsIdx = header.indexOf("tags");

  const cases: Array<Pick<TestCase, "input" | "expected" | "tags">> = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = parseCSVLine(lines[i]);
    const input = cols[inputIdx]?.trim();
    if (!input) {
      return { cases: [], error: `第 ${i + 1} 行 input 为空` };
    }
    cases.push({
      input,
      expected: expectedIdx >= 0 ? (cols[expectedIdx] ?? "").trim() : "",
      tags:
        tagsIdx >= 0 && cols[tagsIdx]
          ? cols[tagsIdx]
              .split(";")
              .map((t) => t.trim())
              .filter(Boolean)
          : [],
    });
  }
  return { cases };
}

// 简化 CSV 行解析：支持双引号包裹的字段
function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cur += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ",") {
        result.push(cur);
        cur = "";
      } else {
        cur += ch;
      }
    }
  }
  result.push(cur);
  return result;
}
