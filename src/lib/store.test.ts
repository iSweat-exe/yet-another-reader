import { describe, expect, it } from "vitest";
import { shareStructure } from "./store";

describe("shareStructure", () => {
  it("should keep the previous object when nothing changed", () => {
    const prev = { a: { b: [1, 2, { c: 3 }] }, d: "x" };
    const next = { a: { b: [1, 2, { c: 3 }] }, d: "x" };
    expect(shareStructure(prev, next)).toBe(prev);
  });

  it("should reuse unchanged branches and replace the changed ones", () => {
    const prev = { beatmap: { id: 1 }, gameplay: { score: 10 } };
    const next = { beatmap: { id: 1 }, gameplay: { score: 11 } };
    const out = shareStructure(prev, next);
    expect(out).not.toBe(prev);
    expect(out.beatmap).toBe(prev.beatmap);
    expect(out.gameplay).toEqual({ score: 11 });
  });

  it("should handle null, added keys and array length changes", () => {
    expect(shareStructure({ a: null }, { a: { x: 1 } })).toEqual({ a: { x: 1 } });
    expect(shareStructure<Record<string, number>>({ a: 1 }, { a: 1, b: 2 })).toEqual({ a: 1, b: 2 });
    expect(shareStructure([1, 2], [1, 2, 3])).toEqual([1, 2, 3]);
  });
});
