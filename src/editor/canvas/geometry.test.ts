import { describe, expect, it } from "vitest";
import { alignedPosition, angleBetween, averageGap, boundingBox, distributionShifts, intersects, normalizeAngle, resizeBox, resizeRotatedBox, rotateAround, rotatePoint, rotatedBounds, rotatedCorners, rotatedHandleCursor, rotatedIntersects, snapAngle, snapGaps, snapMove, snapResize, spacingShifts, unitsOf } from "./geometry";
import type { WidgetInstance } from "../../overlay/model/layout";

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
    expect(snap).toEqual({ dx: 0, dy: 0, guides: [], gaps: [] });
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

describe("rotation geometry", () => {
  const close = (a: number, b: number) => expect(a).toBeCloseTo(b, 6);

  it("normalises angles to (-180, 180] and survives garbage", () => {
    expect(normalizeAngle(190)).toBe(-170);
    expect(normalizeAngle(-190)).toBe(170);
    expect(normalizeAngle(180)).toBe(180);
    expect(normalizeAngle(-180)).toBe(180);
    expect(normalizeAngle(720)).toBe(0);
    expect(normalizeAngle(Number.NaN)).toBe(0);
    expect(normalizeAngle(-0)).toBe(0);
  });

  it("snaps to 15 degree steps", () => {
    expect(snapAngle(7)).toBe(0);
    expect(snapAngle(8)).toBe(15);
    expect(snapAngle(-52)).toBe(-45);
    expect(snapAngle(179)).toBe(180);
    expect(snapAngle(-179)).toBe(180);
  });

  it("rotates a point clockwise on screen around an origin", () => {
    const p = rotatePoint({ x: 10, y: 0 }, { x: 0, y: 0 }, 90);
    close(p.x, 0);
    close(p.y, 10);
    const q = rotatePoint({ x: 5, y: 5 }, { x: 5, y: 5 }, 33);
    close(q.x, 5);
    close(q.y, 5);
  });

  it("measures the angle of a direction (0 right, 90 down)", () => {
    close(angleBetween({ x: 0, y: 0 }, { x: 1, y: 0 }), 0);
    close(angleBetween({ x: 0, y: 0 }, { x: 0, y: 1 }), 90);
    close(angleBetween({ x: 0, y: 0 }, { x: -1, y: 0 }), 180);
  });

  it("gives the bounding box of a turned rectangle", () => {
    expect(rotatedBounds(box(0, 0, 100, 50), 0)).toEqual(box(0, 0, 100, 50));
    const quarter = rotatedBounds(box(0, 0, 100, 50), 90);
    close(quarter.left, 25);
    close(quarter.top, -25);
    close(quarter.width, 50);
    close(quarter.height, 100);
    const diag = rotatedBounds(box(0, 0, 100, 100), 45);
    close(diag.width, 100 * Math.SQRT2);
    close(diag.left + diag.width / 2, 50);
  });

  it("tests the lasso against the turned rectangle, not its bounding box", () => {
    // A thin bar turned 45 degrees: the empty corner of its bounding box is not hit.
    const bar = box(0, 0, 200, 10);
    const corner = box(26, 55, 15, 20);
    expect(intersects(corner, rotatedBounds(bar, 45))).toBe(true);
    expect(rotatedIntersects(bar, 45, corner)).toBe(false);
    expect(rotatedIntersects(bar, 45, box(95, 0, 10, 10))).toBe(true);
    expect(rotatedIntersects(bar, 0, box(300, 0, 10, 10))).toBe(false);
  });

  it("resizes in the local frame with the opposite edge fixed on screen", () => {
    const start = box(100, 100, 200, 100);
    const options = { min: 8, keepAspect: false };
    // Turned 90 degrees clockwise, the local x axis points down on screen: dragging "e" down by 40 grows the width.
    const grown = resizeRotatedBox(start, 90, "e", 0, 40, options);
    close(grown.width, 240);
    close(grown.height, 100);
    // The west edge (the anchor) did not move on screen.
    const before = rotatedCorners(start, 90);
    const after = rotatedCorners(grown, 90);
    close(after[0].x, before[0].x);
    close(after[0].y, before[0].y);
    close(after[3].x, before[3].x);
    close(after[3].y, before[3].y);
    // A screen movement across the widget's width does nothing to it.
    const sideways = resizeRotatedBox(start, 90, "e", 40, 0, options);
    close(sideways.width, 200);
  });

  it("keeps the opposite corner fixed for a corner handle at any angle", () => {
    const start = box(50, 80, 160, 90);
    const turn = 37;
    const before = rotatedCorners(start, turn);
    const next = resizeRotatedBox(start, turn, "se", 25, -10, { min: 8, keepAspect: false });
    const after = rotatedCorners(next, turn);
    close(after[0].x, before[0].x);
    close(after[0].y, before[0].y);
  });

  it("is the plain resize when not turned", () => {
    const start = box(10, 10, 100, 50);
    const options = { min: 8, keepAspect: false };
    expect(resizeRotatedBox(start, 0, "se", 20, 5, options)).toEqual(resizeBox(start, "se", 20, 5, options));
  });

  it("orbits a rigid selection around its pivot and adds the angle to each member", () => {
    const turned = rotateAround({ x: 100, y: 0 }, 170, { x: 0, y: 0 }, 20);
    close(turned.centre.x, 100 * Math.cos((20 * Math.PI) / 180));
    close(turned.centre.y, 100 * Math.sin((20 * Math.PI) / 180));
    expect(turned.rotation).toBe(-170);
  });

  it("points resize cursors along the turned edges", () => {
    expect(rotatedHandleCursor("e", 0)).toBe("ew-resize");
    expect(rotatedHandleCursor("e", 90)).toBe("ns-resize");
    expect(rotatedHandleCursor("se", 90)).toBe("nesw-resize");
    expect(rotatedHandleCursor("n", -90)).toBe("ew-resize");
    expect(rotatedHandleCursor("nw", 45)).toBe("ns-resize");
  });

  it("counts a turned widget by its bounding box in a unit", () => {
    const w = { id: "a", type: "score", anchor: "top-left", x: 0, y: 0, w: 100, h: 50, pages: ["playing"], rotation: 90 } as WidgetInstance;
    const [unit] = unitsOf([w], 1920, 1080);
    close(unit.rect.width, 50);
    close(unit.rect.height, 100);
  });
});

describe("snapGaps", () => {
  const row = (left: number, width = 100) => box(left, 100, width, 50);

  it("centres a box between two neighbours so both gaps are equal", () => {
    // A: 0..100, C: 400..500, the box (width 100) at 193: gaps 93 and 107.
    const snap = snapGaps(row(193), [row(0), row(400)], "x", 8);
    expect(snap?.shift).toBe(7);
    expect(snap?.marks).toHaveLength(2);
    expect(snap?.marks[0]).toMatchObject({ axis: "x", from: 100, to: 200 });
    expect(snap?.marks[1]).toMatchObject({ axis: "x", from: 300, to: 400 });
  });

  it("takes the same gap as two other boxes already have", () => {
    // A and B are 40 apart; the box dropped 44 right of B snaps to 40.
    const snap = snapGaps(row(284), [row(0), row(140)], "x", 8);
    expect(snap?.shift).toBe(-4);
    expect(snap?.marks.map((m) => Math.round(m.to - m.from))).toEqual([40, 40]);
  });

  it("ignores boxes that are not in the same row", () => {
    expect(snapGaps(row(193), [box(0, 400, 100, 50), box(400, 400, 100, 50)], "x", 8)).toBeNull();
  });

  it("does nothing when no gap is within the threshold", () => {
    expect(snapGaps(row(150), [row(0), row(500)], "x", 8)).toBeNull();
  });

  it("works vertically too", () => {
    const col = (top: number) => box(100, top, 50, 100);
    const snap = snapGaps(col(193), [col(0), col(400)], "y", 8);
    expect(snap?.shift).toBe(7);
    expect(snap?.marks[0]).toMatchObject({ axis: "y" });
  });
});

describe("snapMove with equal spacing", () => {
  it("prefers lining up with an edge to an equal gap", () => {
    const snap = snapMove(box(193, 100, 100, 50), [box(0, 100, 100, 50), box(400, 100, 100, 50)], 1920, 1080, 8);
    // 200 is the right edge of nothing, but the box centre 243 is not on a line: the gap snap applies.
    expect(snap.gaps.length).toBeGreaterThan(0);
  });
});
