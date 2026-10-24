import { type Rect, type WidgetInstance, normalizeRotation, resolveRect } from "../../overlay/model/layout";

export type Handle = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

export const HANDLES: readonly Handle[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];

export interface Guide {
  axis: "x" | "y";
  /** Position of the guide line in layout pixels. */
  at: number;
}

export const right = (r: Rect) => r.left + r.width;
export const bottom = (r: Rect) => r.top + r.height;

/** Smallest rectangle containing all `rects`. */
export function boundingBox(rects: Rect[]): Rect {
  const left = Math.min(...rects.map((r) => r.left));
  const top = Math.min(...rects.map((r) => r.top));
  return { left, top, width: Math.max(...rects.map(right)) - left, height: Math.max(...rects.map(bottom)) - top };
}

export function intersects(a: Rect, b: Rect): boolean {
  return a.left < right(b) && right(a) > b.left && a.top < bottom(b) && bottom(a) > b.top;
}

/** Candidate snap lines: the screen's edges and centre, plus each other box's edges and centre. */
export function snapLines(others: Rect[], viewWidth: number, viewHeight: number): { xs: number[]; ys: number[] } {
  const xs = [0, viewWidth / 2, viewWidth];
  const ys = [0, viewHeight / 2, viewHeight];
  for (const r of others) {
    xs.push(r.left, r.left + r.width / 2, right(r));
    ys.push(r.top, r.top + r.height / 2, bottom(r));
  }
  return { xs, ys };
}

/** The candidate closest to any of `points` (within `threshold`), as the shift to apply. */
function nearestShift(points: number[], candidates: number[], threshold: number): { shift: number; at: number } | null {
  let best: { shift: number; at: number } | null = null;
  for (const p of points) {
    for (const c of candidates) {
      const shift = c - p;
      if (Math.abs(shift) <= threshold && (!best || Math.abs(shift) < Math.abs(best.shift))) best = { shift, at: c };
    }
  }
  return best;
}

export interface MoveSnap {
  dx: number;
  dy: number;
  guides: Guide[];
  /** Spacing markers when the move snapped to an equal gap. */
  gaps: GapMark[];
}

/**
 * How much to shift a box being moved so that it lines up with other boxes / the screen, or with
 * the grid when nothing else is close. `box` is the box at its proposed (unsnapped) position.
 */
export function snapMove(box: Rect, others: Rect[], viewWidth: number, viewHeight: number, threshold: number, grid = 0): MoveSnap {
  const { xs, ys } = snapLines(others, viewWidth, viewHeight);
  const x = nearestShift([box.left, box.left + box.width / 2, right(box)], xs, threshold);
  const y = nearestShift([box.top, box.top + box.height / 2, bottom(box)], ys, threshold);
  const guides: Guide[] = [];
  const gaps: GapMark[] = [];
  let dx = 0;
  let dy = 0;
  // Lining up with an edge wins; otherwise an equal spacing does, and the grid comes last.
  const gapX = x ? null : snapGaps(box, others, "x", threshold);
  const gapY = y ? null : snapGaps(box, others, "y", threshold);
  if (x) {
    dx = x.shift;
    guides.push({ axis: "x", at: x.at });
  } else if (gapX) {
    dx = gapX.shift;
    gaps.push(...gapX.marks);
  } else if (grid > 0) {
    dx = Math.round(box.left / grid) * grid - box.left;
  }
  if (y) {
    dy = y.shift;
    guides.push({ axis: "y", at: y.at });
  } else if (gapY) {
    dy = gapY.shift;
    gaps.push(...gapY.marks);
  } else if (grid > 0) {
    dy = Math.round(box.top / grid) * grid - box.top;
  }
  return { dx, dy, guides, gaps };
}


/** A spacing marker: the distance between two boxes, drawn as a segment (`axis: "x"` is horizontal, at height `at`). */
export interface GapMark {
  axis: "x" | "y";
  from: number;
  to: number;
  /** Position on the other axis, where the marker is drawn. */
  at: number;
}

interface Span {
  a0: number;
  a1: number;
  c0: number;
  c1: number;
}

/** A box as seen along `axis` (`a`) and across it (`c`). */
const spanOf = (r: Rect, axis: "x" | "y"): Span => (axis === "x" ? { a0: r.left, a1: right(r), c0: r.top, c1: bottom(r) } : { a0: r.top, a1: bottom(r), c0: r.left, c1: right(r) });

/**
 * Snaps the spacing of a box being moved: next to a neighbour it takes the same gap as two other boxes
 * already have between them, and between two neighbours it centres itself so both gaps are equal.
 * Only boxes that overlap it across the axis count (a gap between boxes in different rows means nothing).
 */
export function snapGaps(box: Rect, others: Rect[], axis: "x" | "y", threshold: number): { shift: number; marks: GapMark[] } | null {
  const b = spanOf(box, axis);
  const spans = others
    .map((r) => spanOf(r, axis))
    .filter((s) => s.c0 < b.c1 && s.c1 > b.c0)
    .sort((p, q) => p.a0 - q.a0);
  if (spans.length === 0) return null;
  const mark = (from: number, to: number, at: number): GapMark => ({ axis, from, to, at });
  const before = spans.filter((s) => s.a1 <= b.a0).sort((p, q) => q.a1 - p.a1)[0];
  const after = spans.filter((s) => s.a0 >= b.a1).sort((p, q) => p.a0 - q.a0)[0];
  const here = (b.c0 + b.c1) / 2;

  let best: { shift: number; marks: GapMark[] } | null = null;
  const offer = (shift: number, marks: GapMark[]) => {
    if (Math.abs(shift) <= threshold && (!best || Math.abs(shift) < Math.abs(best.shift))) best = { shift, marks };
  };

  if (before && after) {
    const leftGap = b.a0 - before.a1;
    const rightGap = after.a0 - b.a1;
    const shift = (rightGap - leftGap) / 2;
    offer(shift, [mark(before.a1, b.a0 + shift, here), mark(b.a1 + shift, after.a0, here)]);
  }
  for (let i = 0; i + 1 < spans.length; i += 1) {
    const size = spans[i + 1].a0 - spans[i].a1;
    if (size <= 0) continue;
    const source = mark(spans[i].a1, spans[i + 1].a0, (Math.max(spans[i].c0, spans[i + 1].c0) + Math.min(spans[i].c1, spans[i + 1].c1)) / 2);
    if (before) {
      const shift = size - (b.a0 - before.a1);
      offer(shift, [mark(before.a1, b.a0 + shift, here), source]);
    }
    if (after) {
      const shift = after.a0 - b.a1 - size;
      offer(shift, [mark(b.a1 + shift, after.a0, here), source]);
    }
  }
  return best;
}

export interface ResizeOptions {
  /** Smallest allowed width/height. */
  min: number;
  keepAspect: boolean;
}

/** The box after dragging `handle` by (`dx`, `dy`) layout pixels. */
export function resizeBox(start: Rect, handle: Handle, dx: number, dy: number, { min, keepAspect }: ResizeOptions): Rect {
  let left = start.left;
  let top = start.top;
  let r = right(start);
  let b = bottom(start);
  if (handle.includes("w")) left = Math.min(left + dx, r - min);
  if (handle.includes("e")) r = Math.max(r + dx, left + min);
  if (handle.includes("n")) top = Math.min(top + dy, b - min);
  if (handle.includes("s")) b = Math.max(b + dy, top + min);

  if (keepAspect && start.width > 0 && start.height > 0) {
    const ratio = start.width / start.height;
    const width = r - left;
    const height = b - top;
    // Follow whichever dimension the user changed the most.
    const byWidth = Math.abs(width - start.width) / start.width >= Math.abs(height - start.height) / start.height;
    const newWidth = byWidth ? width : Math.max(min, height * ratio);
    const newHeight = byWidth ? Math.max(min, width / ratio) : height;
    if (handle.includes("w")) left = r - newWidth;
    else r = left + newWidth;
    if (handle.includes("n")) top = b - newHeight;
    else b = top + newHeight;
  }
  return { left, top, width: r - left, height: b - top };
}

/** Snaps the edges a resize is moving to nearby lines; returns the adjusted box and the guides hit. */
export function snapResize(box: Rect, handle: Handle, others: Rect[], viewWidth: number, viewHeight: number, threshold: number, min: number): { box: Rect; guides: Guide[] } {
  const { xs, ys } = snapLines(others, viewWidth, viewHeight);
  let { left, top } = box;
  let r = right(box);
  let b = bottom(box);
  const guides: Guide[] = [];
  const snapEdge = (value: number, candidates: number[], axis: "x" | "y") => {
    const hit = nearestShift([value], candidates, threshold);
    if (hit) guides.push({ axis, at: hit.at });
    return value + (hit?.shift ?? 0);
  };
  if (handle.includes("w")) left = Math.min(snapEdge(left, xs, "x"), r - min);
  if (handle.includes("e")) r = Math.max(snapEdge(r, xs, "x"), left + min);
  if (handle.includes("n")) top = Math.min(snapEdge(top, ys, "y"), b - min);
  if (handle.includes("s")) b = Math.max(snapEdge(b, ys, "y"), top + min);
  return { box: { left, top, width: r - left, height: b - top }, guides };
}

// --- Rotation -------------------------------------------------------------------------------
// A widget is rotated around the centre of its (unrotated) rectangle, in degrees, clockwise
// (like CSS `rotate()`; the y axis points down). The rectangle `resolveRect` returns is always the
// unrotated one: rotation never moves the centre.

export interface Point {
  x: number;
  y: number;
}

/** Step of the angle snap (Shift while rotating). */
export const ROTATION_STEP = 15;

/** An angle in degrees, wrapped to (-180, 180] and rounded to 0.01 (the precision stored in a layout). */
export const normalizeAngle = normalizeRotation;

/** The angle snapped to the nearest multiple of `step` degrees. */
export const snapAngle = (deg: number, step = ROTATION_STEP): number => normalizeAngle(Math.round(deg / step) * step);

export const rectCenter = (r: Rect): Point => ({ x: r.left + r.width / 2, y: r.top + r.height / 2 });

/** `p` turned by `deg` degrees (clockwise on screen) around `origin`. */
export function rotatePoint(p: Point, origin: Point, deg: number): Point {
  const rad = (deg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const dx = p.x - origin.x;
  const dy = p.y - origin.y;
  return { x: origin.x + dx * cos - dy * sin, y: origin.y + dx * sin + dy * cos };
}

/** Angle in degrees of the direction from `from` to `to` (0 = right, 90 = down). */
export const angleBetween = (from: Point, to: Point): number => (Math.atan2(to.y - from.y, to.x - from.x) * 180) / Math.PI;

/** The four corners of `rect` turned by `deg` around its centre (top-left, top-right, bottom-right, bottom-left). */
export function rotatedCorners(rect: Rect, deg: number): Point[] {
  const c = rectCenter(rect);
  return [
    { x: rect.left, y: rect.top },
    { x: right(rect), y: rect.top },
    { x: right(rect), y: bottom(rect) },
    { x: rect.left, y: bottom(rect) },
  ].map((p) => (deg ? rotatePoint(p, c, deg) : p));
}

/** Smallest axis-aligned rectangle containing `rect` once turned by `deg` around its centre. */
export function rotatedBounds(rect: Rect, deg: number): Rect {
  if (!deg) return rect;
  const corners = rotatedCorners(rect, deg);
  const xs = corners.map((p) => p.x);
  const ys = corners.map((p) => p.y);
  const left = Math.min(...xs);
  const top = Math.min(...ys);
  return { left, top, width: Math.max(...xs) - left, height: Math.max(...ys) - top };
}

/** Whether the turned `rect` and the axis-aligned `box` overlap (separating axis test: used by the lasso). */
export function rotatedIntersects(rect: Rect, deg: number, box: Rect): boolean {
  if (!deg) return intersects(rect, box);
  const corners = rotatedCorners(rect, deg);
  const boxCorners: Point[] = [
    { x: box.left, y: box.top },
    { x: right(box), y: box.top },
    { x: right(box), y: bottom(box) },
    { x: box.left, y: bottom(box) },
  ];
  const rad = (deg * Math.PI) / 180;
  const axes: Point[] = [
    { x: 1, y: 0 },
    { x: 0, y: 1 },
    { x: Math.cos(rad), y: Math.sin(rad) },
    { x: -Math.sin(rad), y: Math.cos(rad) },
  ];
  return axes.every((a) => {
    const project = (pts: Point[]) => pts.map((p) => p.x * a.x + p.y * a.y);
    const p1 = project(corners);
    const p2 = project(boxCorners);
    return Math.min(...p1) < Math.max(...p2) && Math.max(...p1) > Math.min(...p2);
  });
}

/**
 * The box after dragging `handle` by (`dx`, `dy`) layout pixels (a *screen* movement) when the box is turned by `deg`:
 * the movement is read in the widget's own axes, so a handle slides its edge along the local axis, and the
 * opposite edge (or corner) stays fixed on screen. The result is the new unrotated rectangle (same `deg`).
 */
export function resizeRotatedBox(start: Rect, deg: number, handle: Handle, dx: number, dy: number, options: ResizeOptions): Rect {
  if (!deg) return resizeBox(start, handle, dx, dy, options);
  const origin = rectCenter(start);
  const local = rotatePoint({ x: origin.x + dx, y: origin.y + dy }, origin, -deg);
  const resized = resizeBox(start, handle, local.x - origin.x, local.y - origin.y, options);
  // The centre of the resized box (still in the widget's frame) goes back to screen space.
  const centre = rotatePoint(rectCenter(resized), origin, deg);
  return { left: centre.x - resized.width / 2, top: centre.y - resized.height / 2, width: resized.width, height: resized.height };
}

/**
 * A widget turned by `delta` degrees around `pivot` as part of a rigid selection: its centre orbits the pivot
 * and its own angle grows by `delta`. Returns the new centre and angle.
 */
export function rotateAround(centre: Point, rotation: number, pivot: Point, delta: number): { centre: Point; rotation: number } {
  return { centre: rotatePoint(centre, pivot, delta), rotation: normalizeAngle(rotation + delta) };
}

/** CSS cursor name of a resize handle on a box turned by `deg` (the arrow follows the box). */
export function rotatedHandleCursor(handle: Handle, deg: number): string {
  const base: Record<Handle, number> = { e: 0, se: 45, s: 90, sw: 135, w: 180, nw: 225, n: 270, ne: 315 };
  const names = ["ew-resize", "nwse-resize", "ns-resize", "nesw-resize"];
  const turned = (((base[handle] + deg) % 180) + 180) % 180;
  return names[Math.round(turned / 45) % 4];
}

export type AlignMode ="left" | "center" | "right" | "top" | "middle" | "bottom";

/** New top-left corner for `rect` when aligned inside `target`. */
export function alignedPosition(rect: Rect, target: Rect, mode: AlignMode): { left: number; top: number } {
  switch (mode) {
    case "left":
      return { left: target.left, top: rect.top };
    case "center":
      return { left: target.left + (target.width - rect.width) / 2, top: rect.top };
    case "right":
      return { left: right(target) - rect.width, top: rect.top };
    case "top":
      return { left: rect.left, top: target.top };
    case "middle":
      return { left: rect.left, top: target.top + (target.height - rect.height) / 2 };
    case "bottom":
      return { left: rect.left, top: bottom(target) - rect.height };
  }
}

/** What is moved as one object: a group (all its widgets) or a widget on its own. */
export interface Unit {
  ids: string[];
  rect: Rect;
}

/** The objects formed by `widgets`: each group counts once, its rectangle being the bounding box of its members as drawn (turned ones included). */
export function unitsOf(widgets: readonly WidgetInstance[], viewWidth: number, viewHeight: number): Unit[] {
  const units: { key: string; ids: string[]; rects: Rect[] }[] = [];
  for (const w of widgets) {
    const key = w.group ?? `\0${w.id}`;
    let unit = units.find((u) => u.key === key);
    if (!unit) units.push((unit = { key, ids: [], rects: [] }));
    unit.ids.push(w.id);
    unit.rects.push(rotatedBounds(resolveRect(w, viewWidth, viewHeight), w.rotation ?? 0));
  }
  return units.map((u) => ({ ids: u.ids, rect: boundingBox(u.rects) }));
}

export type Axis = "x" | "y";

const startOf = (r: Rect, axis: Axis) => (axis === "x" ? r.left : r.top);
const sizeOf = (r: Rect, axis: Axis) => (axis === "x" ? r.width : r.height);

/** Indices of `rects` in order along `axis`. */
const order = (rects: Rect[], axis: Axis) => rects.map((_, i) => i).sort((a, b) => startOf(rects[a], axis) - startOf(rects[b], axis));

/** Mean empty space between neighbours along `axis` (negative when they overlap); 0 for fewer than two boxes. */
export function averageGap(rects: Rect[], axis: Axis): number {
  if (rects.length < 2) return 0;
  const sorted = order(rects, axis).map((i) => rects[i]);
  let total = 0;
  for (let i = 1; i < sorted.length; i++) total += startOf(sorted[i], axis) - (startOf(sorted[i - 1], axis) + sizeOf(sorted[i - 1], axis));
  return total / (sorted.length - 1);
}

/** Shift of each box (same order as `rects`) so that neighbours along `axis` are `gap` apart; the first one stays. */
export function spacingShifts(rects: Rect[], axis: Axis, gap: number): number[] {
  const shifts = rects.map(() => 0);
  const sorted = order(rects, axis);
  if (sorted.length < 2) return shifts;
  let cursor = startOf(rects[sorted[0]], axis);
  for (const i of sorted) {
    shifts[i] = cursor - startOf(rects[i], axis);
    cursor += sizeOf(rects[i], axis) + gap;
  }
  return shifts;
}

/** Shifts that spread the boxes so the gaps are equal, keeping the first and last (by position) where they are. */
export function distributionShifts(rects: Rect[], axis: Axis): number[] {
  if (rects.length < 3) return rects.map(() => 0);
  const span = boundingBox(rects);
  const free = sizeOf(span, axis) - rects.reduce((sum, r) => sum + sizeOf(r, axis), 0);
  return spacingShifts(rects, axis, free / (rects.length - 1));
}
