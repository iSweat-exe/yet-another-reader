import { describe, expect, it } from "vitest";
import { alignedPosition, averageGap, boundingBox, distributionShifts, intersects, resizeBox, snapMove, snapResize, spacingShifts, unitsOf } from "./geometry";
import type { WidgetInstance } from "../overlay/layout";

const box = (left: number, top: number, width: number, height: number) => ({ left, top, width, height });

describe("snapMove", () => {
  it("snaps a box edge to the screen edge when close", () => {
    const snap = snapMove(box(4, 300, 100, 50), [], 1920, 1080, 8);
    expect(snap.dx).toBe(-4);
    expect(snap.guides).toContainEqual({ axis: "x", at: 0 });
  });

  it("snaps the centre to the screen centre", () => {
    const snap = snapMove(box(910 - 50 + 3, 300, 100, 50), [], 1920, 1080, 8);
    expect(snap.dx).toBe(-3);
  });

  it("aligns with another widget's edge", () => {
    const snap = snapMove(box(503, 10, 100, 50), [box(300, 200, 200, 80)], 1920, 1080, 8);
    expect(snap.dx).toBe(-3); // left edge to the other's right edge (500)
    expect(snap.guides).toContainEqual({ axis: "x", at: 500 });
  });

  it("leaves boxes alone when nothing is within the threshold", () => {
    const snap = snapMove(box(123, 456, 100, 50), [], 1920, 1080, 4);
    expect(snap).toEqual({ dx: 0, dy: 0, guides: [] });
  });

  it("falls back to the grid when nothing else is close", () => {
    const snap = snapMove(box(123, 456, 100, 50), [], 1920, 1080, 4, 10);
    expect([snap.dx, snap.dy]).toEqual([-3, 4]);
  });
});

describe("resizeBox", () => {
  it("moves only the dragged edges", () => {
    expect(resizeBox(box(100, 100, 200, 100), "se", 30, 20, { min: 10, keepAspect: false })).toEqual(box(100, 100, 230, 120));
    expect(resizeBox(box(100, 100, 200, 100), "nw", 30, 20, { min: 10, keepAspect: false })).toEqual(box(130, 120, 170, 80));
  });

  it("never goes below the minimum size", () => {
    const r = resizeBox(box(100, 100, 200, 100), "e", -500, 0, { min: 24, keepAspect: false });
    expect(r.width).toBe(24);
    expect(r.left).toBe(100);
  });

  it("keeps the aspect ratio when asked", () => {
    const r = resizeBox(box(0, 0, 200, 100), "se", 100, 0, { min: 10, keepAspect: true });
    expect(r.width / r.height).toBeCloseTo(2);
    expect(r.width).toBe(300);
  });
});

describe("snapResize", () => {
  it("snaps the moving edge to the screen edge", () => {
    const { box: snapped } = snapResize(box(1000, 100, 915, 50), "e", [], 1920, 1080, 8, 10);
    expect(snapped.left + snapped.width).toBe(1920);
  });
});

describe("boundingBox / intersects / alignedPosition", () => {
  it("computes the bounding box", () => {
    expect(boundingBox([box(0, 0, 10, 10), box(20, 30, 5, 5)])).toEqual(box(0, 0, 25, 35));
  });

  it("detects overlapping rectangles", () => {
    expect(intersects(box(0, 0, 10, 10), box(5, 5, 10, 10))).toBe(true);
    expect(intersects(box(0, 0, 10, 10), box(10, 0, 10, 10))).toBe(false);
  });

  it("aligns inside a target", () => {
    const target = box(0, 0, 100, 100);
    expect(alignedPosition(box(40, 40, 20, 20), target, "right")).toEqual({ left: 80, top: 40 });
    expect(alignedPosition(box(40, 40, 20, 20), target, "middle")).toEqual({ left: 40, top: 40 });
    expect(alignedPosition(box(40, 40, 20, 20), target, "center")).toEqual({ left: 40, top: 40 });
    expect(alignedPosition(box(40, 40, 20, 20), target, "top")).toEqual({ left: 40, top: 0 });
  });
});

describe("spacing", () => {
  const row = [box(0, 0, 100, 50), box(130, 0, 100, 50), box(400, 0, 100, 50)];

  it("measures the average gap along an axis", () => {
    expect(averageGap(row, "x")).toBe((30 + 170) / 2);
    expect(averageGap([row[0]], "x")).toBe(0);
  });

  it("sets a uniform gap, keeping the first box in place whatever the input order", () => {
    expect(spacingShifts(row, "x", 10)).toEqual([0, -20, -180]);
    expect(spacingShifts([row[2], row[0], row[1]], "x", 10)).toEqual([-180, 0, -20]);
  });

  it("allows overlapping with a negative gap", () => {
    expect(spacingShifts(row, "x", -10)).toEqual([0, -40, -220]);
  });

  it("distributes evenly between the outer boxes", () => {
    // Free space: 500 - 300 = 200, shared in two gaps.
    expect(distributionShifts(row, "x")).toEqual([0, -30 + 100, 0]);
    expect(distributionShifts(row.slice(0, 2), "x")).toEqual([0, 0]);
  });
});

describe("unitsOf", () => {
  const widget = (id: string, x: number, group?: string): WidgetInstance => ({ id, type: "score", anchor: "top-left", x, y: 0, w: 100, h: 50, pages: ["playing"], group });

  it("counts a group once, with the bounding box of its members", () => {
    const units = unitsOf([widget("a", 0, "g"), widget("b", 200, "g"), widget("c", 500)], 1920, 1080);
    expect(units.map((u) => u.ids)).toEqual([["a", "b"], ["c"]]);
    expect(units[0].rect).toEqual(box(0, 0, 300, 50));
  });
});
