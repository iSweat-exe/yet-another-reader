import { describe, expect, it } from "vitest";
import { NO_ADJUSTMENTS, cssFilter, isUntouched, needsSvgFilter, readAdjustments, temperatureGain, toneTable } from "./imageAdjust";

describe("readAdjustments", () => {
  it("should give no adjustment when nothing is saved", () => {
    expect(readAdjustments({})).toEqual(NO_ADJUSTMENTS);
    expect(isUntouched(readAdjustments({}))).toBe(true);
  });

  it("should clamp each value to its range and ignore non-numbers", () => {
    const a = readAdjustments({ exposure: 500, hue: -999, contrast: "high", saturation: Number.NaN, shadows: 40 });
    expect(a.exposure).toBe(100);
    expect(a.hue).toBe(-180);
    expect(a.contrast).toBe(0);
    expect(a.saturation).toBe(0);
    expect(a.shadows).toBe(40);
  });
});

describe("cssFilter", () => {
  it("should be empty for an untouched picture", () => {
    expect(cssFilter(NO_ADJUSTMENTS)).toBe("");
  });

  it("should map exposure to a brightness that doubles at +100", () => {
    expect(cssFilter({ ...NO_ADJUSTMENTS, exposure: 100 })).toBe("brightness(2.000)");
    expect(cssFilter({ ...NO_ADJUSTMENTS, exposure: -100 })).toBe("brightness(0.500)");
  });

  it("should chain the adjustments CSS knows", () => {
    expect(cssFilter({ ...NO_ADJUSTMENTS, contrast: 50, saturation: -100, hue: 30 })).toBe("contrast(1.500) saturate(0.000) hue-rotate(30deg)");
  });
});

describe("toneTable", () => {
  it("should be the identity when nothing is moved", () => {
    const t = toneTable(0, 0);
    expect(t[0]).toBe(0);
    expect(t[t.length - 1]).toBe(1);
    expect(t[4]).toBeCloseTo(0.5);
  });

  it("should keep black and white fixed and stay inside 0..1", () => {
    for (const [s, h] of [
      [100, 100],
      [-100, -100],
      [100, -100],
    ]) {
      const t = toneTable(s, h);
      expect(t[0]).toBe(0);
      expect(t[t.length - 1]).toBe(1);
      expect(t.every((v) => v >= 0 && v <= 1)).toBe(true);
    }
  });

  it("should lift the darks with positive shadows and the brights with positive highlights", () => {
    expect(toneTable(100, 0)[2]).toBeGreaterThan(0.25);
    expect(toneTable(0, 100)[6]).toBeGreaterThan(0.75);
    expect(toneTable(-100, 0)[2]).toBeLessThan(0.25);
  });
});

describe("temperature", () => {
  it("should warm with red up and blue down, and cool the other way", () => {
    const warm = temperatureGain(100);
    expect(warm.r).toBeGreaterThan(1);
    expect(warm.b).toBeLessThan(1);
    expect(temperatureGain(-100).b).toBeGreaterThan(1);
    expect(needsSvgFilter({ ...NO_ADJUSTMENTS, temperature: 10 })).toBe(true);
    expect(needsSvgFilter({ ...NO_ADJUSTMENTS, hue: 10 })).toBe(false);
  });
});
