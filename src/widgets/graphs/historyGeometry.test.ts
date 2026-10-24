import { describe, expect, it } from "vitest";
import { areaPath, effectiveOd, ghostAt, ghostPoints, hitWindows, linePath, meanError, signed, yRange } from "./historyGeometry";

const SAMPLES = [
  [0, 0, 0, 1],
  [1000, 1000, 10, 0.98],
  [2000, 3000, 30, 0.96],
];

describe("ghostAt", () => {
  it("interpolates between two samples", () => {
    expect(ghostAt(SAMPLES, 500, "score")).toBe(500);
    expect(ghostAt(SAMPLES, 1500, "pp")).toBe(20);
  });
  it("holds the first and last values outside the samples", () => {
    expect(ghostAt(SAMPLES, -100, "score")).toBe(0);
    expect(ghostAt(SAMPLES, 9999, "score")).toBe(3000);
  });
  it("is null without samples", () => {
    expect(ghostAt([], 100, "pp")).toBeNull();
  });
  it("reads the accuracy column", () => {
    expect(ghostAt(SAMPLES, 1000, "accuracy")).toBeCloseTo(0.98);
  });
});

describe("ghostPoints", () => {
  it("maps a column to points", () => {
    expect(ghostPoints(SAMPLES, "pp")).toEqual([
      { t: 0, value: 0 },
      { t: 1000, value: 10 },
      { t: 2000, value: 30 },
    ]);
  });
});

describe("yRange", () => {
  it("starts PP at zero with headroom", () => {
    expect(yRange([10, 95], "pp")).toEqual([0, 110]);
  });
  it("zooms accuracy on its top without going above 95 percent for the floor", () => {
    expect(yRange([0.99, 0.985], "accuracy")).toEqual([0.95, 1]);
    expect(yRange([0.9, 0.97], "accuracy")).toEqual([0.89, 1]);
  });
  it("has a default for no data", () => {
    expect(yRange([], "pp")).toEqual([0, 1]);
  });
});

describe("paths", () => {
  const domain = { x0: 0, x1: 100, y0: 0, y1: 10 };
  it("draws a polyline in the box, y pointing down", () => {
    expect(
      linePath(
        [
          { t: 0, value: 0 },
          { t: 100, value: 10 },
        ],
        domain,
        200,
        50,
      ),
    ).toBe("M0 50 L200 0");
  });
  it("clamps points outside the domain", () => {
    expect(linePath([{ t: 500, value: 99 }], domain, 200, 50)).toBe("M200 0");
  });
  it("closes the area down to the bottom edge", () => {
    expect(areaPath([{ t: 0, value: 5 }, { t: 100, value: 5 }], domain, 200, 50)).toBe("M0 25 L200 25 L200 50 L0 50 Z");
    expect(areaPath([], domain, 200, 50)).toBe("");
  });
});

describe("hit windows", () => {
  it("follows the osu!standard formulas", () => {
    expect(hitWindows(8)).toEqual({ great: 32, ok: 76, meh: 120 });
  });
  it("applies HR, EZ and Difficulty Adjust to the OD", () => {
    expect(effectiveOd(8, ["HR"], null)).toBe(10);
    expect(effectiveOd(8, ["EZ"], null)).toBe(4);
    expect(effectiveOd(8, ["HR"], 5)).toBe(5);
    expect(effectiveOd(8, [], undefined)).toBe(8);
  });
});

describe("meanError", () => {
  it("averages the errors", () => {
    expect(meanError([-10, 10, 6])).toBe(2);
    expect(meanError([])).toBeNull();
  });
});

describe("signed", () => {
  it("writes a sign for a difference", () => {
    expect(signed(1234)).toBe("+1,234");
    expect(signed(-5.26, 1)).toBe("-5.3");
    expect(signed(0.04, 1)).toBe("0.0");
    expect(signed(0)).toBe("0");
  });
});
