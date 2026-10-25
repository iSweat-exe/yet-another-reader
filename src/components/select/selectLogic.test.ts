import { describe, expect, it } from "vitest";
import { firstEnabled, lastEnabled, moveIndex, typeaheadIndex } from "./selectLogic";

const opts = (...disabled: boolean[]) => disabled.map((d) => ({ disabled: d }));

describe("moveIndex", () => {
  it("moves to the next enabled option", () => {
    expect(moveIndex(opts(false, true, false), 0, 1)).toBe(2);
    expect(moveIndex(opts(false, true, false), 2, -1)).toBe(0);
  });

  it("stays put at the ends", () => {
    expect(moveIndex(opts(false, false), 1, 1)).toBe(1);
    expect(moveIndex(opts(false, false), 0, -1)).toBe(0);
  });

  it("stays put when only disabled options follow", () => {
    expect(moveIndex(opts(false, true, true), 0, 1)).toBe(0);
  });
});

describe("firstEnabled / lastEnabled", () => {
  it("skip disabled options", () => {
    expect(firstEnabled(opts(true, false, false, true))).toBe(1);
    expect(lastEnabled(opts(true, false, false, true))).toBe(2);
  });

  it("report -1 when everything is disabled", () => {
    expect(firstEnabled(opts(true))).toBe(-1);
    expect(lastEnabled(opts(true))).toBe(-1);
  });
});

describe("typeaheadIndex", () => {
  const labels = ["Apple", "Avocado", "Banana", "Berry"];
  const none = [false, false, false, false];

  it("jumps to the next option starting with the letter, wrapping around", () => {
    expect(typeaheadIndex(labels, none, "b", 0)).toBe(2);
    expect(typeaheadIndex(labels, none, "a", 1)).toBe(0);
  });

  it("matches multi-letter prefixes, including the current option", () => {
    expect(typeaheadIndex(labels, none, "av", 1)).toBe(1);
    expect(typeaheadIndex(labels, none, "be", 0)).toBe(3);
  });

  it("cycles when the same letter is typed repeatedly", () => {
    expect(typeaheadIndex(labels, none, "bb", 2)).toBe(3);
  });

  it("ignores disabled options and reports misses", () => {
    expect(typeaheadIndex(labels, [false, false, true, false], "b", 0)).toBe(3);
    expect(typeaheadIndex(labels, none, "z", 0)).toBe(-1);
    expect(typeaheadIndex(labels, none, "", 0)).toBe(-1);
  });
});
