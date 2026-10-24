import { describe, expect, it } from "vitest";
import { barsOf, bucketMax, dotsOf, ringPath, stepPath } from "./ppGraphGeometry";
import type { Domain, Point } from "./historyGeometry";

const domain: Domain = { x0: 0, x1: 100, y0: 0, y1: 200 };

describe("bucketMax", () => {
  it("keeps the highest value of each time slice and leaves empty slices null", () => {
    const points: Point[] = [
      { t: 5, value: 10 },
      { t: 8, value: 30 },
      { t: 60, value: 20 },
    ];
    expect(bucketMax(points, domain, 4)).toEqual([30, null, 20, null]);
  });

  it("ignores non-finite values and degenerate domains", () => {
    expect(bucketMax([{ t: 1, value: Number.NaN }], domain, 2)).toEqual([null, null]);
    expect(bucketMax([{ t: 1, value: 4 }], { ...domain, x1: 0 }, 2)).toEqual([null, null]);
    expect(bucketMax([], domain, 0)).toEqual([]);
  });
});

describe("barsOf", () => {
  it("draws one bar per filled bucket inside the box", () => {
    const bars = barsOf([100, null, 400], domain, 40, 20);
    expect(bars).toHaveLength(2);
    for (const b of bars) {
      expect(b.y).toBeGreaterThanOrEqual(0);
      expect(b.y + b.h).toBeCloseTo(20);
    }
    expect(bars[0].h).toBeCloseTo(10);
    // Above the top of the range, the bar is clamped to the box.
    expect(bars[1].h).toBeCloseTo(20);
  });

  it("gives a near-zero value a visible minimum height", () => {
    expect(barsOf([0], domain, 10, 20)[0].h).toBe(2);
  });
});

describe("dotsOf", () => {
  it("puts each dot at the centre of its slice", () => {
    expect(dotsOf([200, null], domain, 40, 20)).toEqual([[10, 0]]);
  });
});

describe("stepPath", () => {
  it("holds each value before jumping to the next", () => {
    const path = stepPath(
      [
        { t: 0, value: 0 },
        { t: 50, value: 100 },
      ],
      domain,
      100,
      100,
    );
    expect(path).toBe("M0 100 L50 100 L50 50");
  });

  it("is empty without points", () => {
    expect(stepPath([], domain, 100, 100)).toBe("");
  });
});

describe("ringPath", () => {
  it("is empty at zero and a full circle at one", () => {
    expect(ringPath(0, 50, 50, 40)).toBe("");
    expect(ringPath(Number.NaN, 50, 50, 40)).toBe("");
    expect(ringPath(1, 50, 50, 40)).toContain("A40 40 0 1 1 50 90");
  });

  it("clamps above one and uses the large-arc flag past half", () => {
    expect(ringPath(3, 50, 50, 40)).toBe(ringPath(1, 50, 50, 40));
    expect(ringPath(0.75, 50, 50, 40)).toContain("0 1 1");
    expect(ringPath(0.25, 50, 50, 40)).toContain("0 0 1");
  });
});
