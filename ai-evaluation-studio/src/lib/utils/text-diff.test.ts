import { describe, expect, it } from "vitest";

import { diffLines } from "./text-diff";

describe("diffLines", () => {
  it("marks added, removed, and unchanged lines", () => {
    expect(diffLines("a\nb\nc", "a\nx\nc\nd")).toEqual([
      { type: "same", text: "a" },
      { type: "removed", text: "b" },
      { type: "added", text: "x" },
      { type: "same", text: "c" },
      { type: "added", text: "d" },
    ]);
  });

  it("handles empty input", () => {
    expect(diffLines("", "new")).toEqual([
      { type: "removed", text: "" },
      { type: "added", text: "new" },
    ]);
  });
});
