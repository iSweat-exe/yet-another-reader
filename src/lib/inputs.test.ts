import { describe, expect, it } from "vitest";
import { EMPTY_INPUT_STATS, applyInput, inputId, keyLabel, pressRate, trailSpans, updateTrail } from "./inputs";

const held = (keys: string[] = [], mouse: string[] = []) => ({ keys, mouse });

describe("applyInput", () => {
  it("counts a key once however long it is held", () => {
    let stats = applyInput(EMPTY_INPUT_STATS, held(), held(["Z"]), 0, true);
    stats = applyInput(stats, held(["Z"]), held(["Z"]), 50, true);
    stats = applyInput(stats, held(["Z"]), held(), 100, true);
    stats = applyInput(stats, held(), held(["Z"]), 150, true);
    expect(stats.counts[inputId("keyboard", "Z")]).toBe(2);
  });

  it("tells keyboard keys from mouse buttons of the same name", () => {
    const stats = applyInput(EMPTY_INPUT_STATS, held(), held(["Left"], ["Left"]), 0, true);
    expect(stats.counts).toEqual({ "keyboard:Left": 1, "mouse:Left": 1 });
  });

  it("does not add up outside a play, but still feeds the rate", () => {
    const stats = applyInput(EMPTY_INPUT_STATS, held(), held(["Z"]), 0, false);
    expect(stats.counts).toEqual({});
    expect(stats.presses).toEqual([0]);
  });

  it("forgets old presses", () => {
    let stats = applyInput(EMPTY_INPUT_STATS, held(), held(["Z"]), 0, true);
    stats = applyInput(stats, held(["Z"]), held(["Z", "X"]), 5000, true);
    expect(stats.presses).toEqual([5000]);
  });
});

describe("pressRate", () => {
  it("counts the presses of the last second", () => {
    let stats = EMPTY_INPUT_STATS;
    for (const t of [0, 100, 200, 300]) stats = applyInput(stats, held(), held(["Z"]), t, true);
    expect(pressRate(stats, 300)).toBe(4);
    expect(pressRate(stats, 1250)).toBe(1);
    expect(pressRate(stats, 3000)).toBe(0);
  });
});

describe("keyLabel", () => {
  it("shortens the long names", () => {
    expect(keyLabel("keyboard", "Z")).toBe("Z");
    expect(keyLabel("keyboard", "ShiftLeft")).toBe("LShift");
    expect(keyLabel("keyboard", "Number1")).toBe("1");
    expect(keyLabel("mouse", "Left")).toBe("M1");
    expect(keyLabel("mouse", "Button2")).toBe("M5");
  });
});

describe("key trail", () => {
  it("opens a bar on press, closes it on release and keeps a hold as one bar", () => {
    let bars = updateTrail([], true, 100, 1000);
    bars = updateTrail(bars, true, 200, 1000);
    expect(bars).toEqual([{ start: 100, end: null }]);
    bars = updateTrail(bars, false, 300, 1000);
    expect(bars).toEqual([{ start: 100, end: 300 }]);
    bars = updateTrail(bars, true, 400, 1000);
    expect(bars).toHaveLength(2);
  });

  it("drops a bar once it has slid away", () => {
    const bars = updateTrail([{ start: 0, end: 100 }], false, 1200, 1000);
    expect(bars).toEqual([]);
  });

  it("moves a bar along the trail at one trail length per duration", () => {
    const bars = [{ start: 0, end: 200 }];
    expect(trailSpans(bars, 500, 1000, 100)).toEqual([{ near: 30, far: 50 }]);
    // A held key starts at the cap and grows.
    expect(trailSpans([{ start: 0, end: null }], 500, 1000, 100)).toEqual([{ near: 0, far: 50 }]);
    // Past the end of the trail: nothing left to draw.
    expect(trailSpans(bars, 5000, 1000, 100)).toEqual([]);
  });
});
