import { describe, expect, it } from "vitest";

import { splitIntoChunks } from "../knowledge/chunking";

describe("splitIntoChunks", () => {
  it("splits a single long paragraph instead of storing one oversized chunk", () => {
    const chunks = splitIntoChunks("长".repeat(1200));

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((chunk) => chunk.length <= 500)).toBe(true);
    expect(chunks.join("")).toHaveLength(1200);
  });

  it("combines short paragraphs without exceeding the chunk limit", () => {
    const chunks = splitIntoChunks(["第一段", "第二段", "第三段"].join("\n\n"));

    expect(chunks).toEqual(["第一段\n\n第二段\n\n第三段"]);
  });
});
