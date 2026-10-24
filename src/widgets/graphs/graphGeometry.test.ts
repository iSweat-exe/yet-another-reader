import { describe, expect, it } from "vitest";
import { barRadius, barRects, playedFraction } from "./graphGeometry";

describe("barRects", () => {
  it("makes one bottom-aligned bar per value, inside the box", () => {
    const rects = barRects([0, 0.5, 1], 300, 100);
    expect(rects).toHaveLength(3);
    for (const r of rects) {
      expect(r.x).toBeGreaterThanOrEqual(0);
      expect(r.x + r.w).toBeLessThanOrEqual(300);
      expect(r.y + r.h).toBeCloseTo(100);
    }
    expect(rects[2].h).toBe(100);
    expect(rects[1].h).toBe(50);
  });

  it("keeps a calm bar visible", () => {
    expect(barRects([0], 100, 40)[0].h).toBe(2);
  });

  it("clamps bad values instead of drawing outside the box", () => {
    const [a, b, c] = barRects([-3, 7, Number.NaN], 90, 50);
    expect(a.h).toBe(2);
    expect(b.h).toBe(50);
    expect(c.h).toBe(2);
  });

  it("returns nothing for no values or an empty box", () => {
    expect(barRects([], 100, 100)).toEqual([]);
    expect(barRects([1], 0, 100)).toEqual([]);
    expect(barRects([1], 100, 0)).toEqual([]);
  });
});

describe("barRadius", () => {
  it("scales with the option and never exceeds half the bar width", () => {
    const rect = { x: 0, y: 0, w: 4, h: 80 };
    expect(barRadius(rect, 0)).toBe(0);
    expect(barRadius(rect, 100)).toBe(2);
    expect(barRadius(rect, 50)).toBe(1);
    expect(barRadius(rect, 999)).toBe(2);
    expect(barRadius(rect, Number.NaN)).toBe(0);
  });
});

describe("playedFraction", () => {
  it("is the share of the song played, clamped", () => {
    expect(playedFraction(5000, 20000)).toBe(0.25);
    expect(playedFraction(-2000, 20000)).toBe(0);
    expect(playedFraction(99999, 20000)).toBe(1);
  });

  it("is 0 when the position or the length is unknown", () => {
    expect(playedFraction(null, 20000)).toBe(0);
    expect(playedFraction(1000, 0)).toBe(0);
    expect(playedFraction(Number.NaN, 20000)).toBe(0);
  });
});

import { curvePoints, monotoneSegments, resample } from "./graphGeometry";

describe("resample", () => {
  it("keeps the highest value of each group when reducing", () => {
    expect(resample([0, 1, 0, 0, 0.5, 0.2], 3)).toEqual([1, 0, 0.5]);
  });

  it("interpolates when increasing and keeps the ends", () => {
    const out = resample([0, 1], 4);
    expect(out).toHaveLength(4);
    expect(out[0]).toBe(0);
    expect(out[3]).toBe(1);
    for (let i = 1; i < out.length; i++) expect(out[i]).toBeGreaterThanOrEqual(out[i - 1]);
  });

  it("returns the same values for the same count, and nothing for nothing", () => {
    expect(resample([0.2, 0.4], 2)).toEqual([0.2, 0.4]);
    expect(resample([], 10)).toEqual([]);
    expect(resample([1], 0)).toEqual([]);
    expect(resample([Number.NaN, 1], 2)).toEqual([0, 1]);
  });

  it("never leaves 0..1 for values inside it", () => {
    const values = Array.from({ length: 120 }, (_, i) => Math.abs(Math.sin(i)));
    for (const n of [20, 77, 120, 240]) for (const v of resample(values, n)) expect(v).toBeGreaterThanOrEqual(0), expect(v).toBeLessThanOrEqual(1);
  });
});

describe("monotoneSegments", () => {
  function bezier(a: number, b: number, c: number, d: number, t: number) {
    const u = 1 - t;
    return u * u * u * a + 3 * u * u * t * b + 3 * u * t * t * c + t * t * t * d;
  }

  it("stays between the heights of its two points, so a spike cannot overshoot 0..1", () => {
    const values = [0, 0, 1, 0, 0.9, 0.9, 0.1, 1, 0, 0];
    const pts = curvePoints(values, 100, 100);
    for (const smooth of [0, 0.5, 1]) {
      const segs = monotoneSegments(pts, smooth);
      expect(segs).toHaveLength(values.length - 1);
      segs.forEach((seg, i) => {
        const from = pts[i];
        const lo = Math.min(from.y, seg.to.y) - 1e-9;
        const hi = Math.max(from.y, seg.to.y) + 1e-9;
        for (let t = 0; t <= 1; t += 0.05) {
          const y = bezier(from.y, seg.c1.y, seg.c2.y, seg.to.y, t);
          expect(y).toBeGreaterThanOrEqual(lo);
          expect(y).toBeLessThanOrEqual(hi);
        }
      });
    }
  });

  it("is a straight line at smooth 0", () => {
    const [seg] = monotoneSegments([{ x: 0, y: 0 }, { x: 30, y: 60 }], 0);
    expect(seg.c1).toEqual({ x: 10, y: 20 });
    expect(seg.c2).toEqual({ x: 20, y: 40 });
  });

  it("needs two points", () => {
    expect(monotoneSegments([{ x: 0, y: 0 }], 1)).toEqual([]);
    expect(curvePoints([], 10, 10)).toEqual([]);
  });
});
