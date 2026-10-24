/** Pure geometry of the difficulty graph: where each bar goes, and how far the song has played. */

export interface BarRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** A bar never gets thinner than this, so a calm section stays visible. */
const MIN_BAR_PX = 2;

/**
 * One rectangle per value (`0..1`, a bar's height relative to the box), bottom-aligned inside a box
 * of `width` × `height`. `gap` is the share of a slot left empty between two bars. Values outside
 * `0..1` and non-numbers are clamped, so a bad payload cannot draw outside the box.
 */
export function barRects(values: readonly number[], width: number, height: number, gap = 0.25): BarRect[] {
  const count = values.length;
  if (count === 0 || width <= 0 || height <= 0) return [];
  const slot = width / count;
  const barW = Math.max(slot * (1 - Math.min(Math.max(gap, 0), 0.9)), 0.5);
  return values.map((raw, i) => {
    const v = Number.isFinite(raw) ? Math.min(Math.max(raw, 0), 1) : 0;
    const h = Math.min(height, Math.max(MIN_BAR_PX, v * height));
    return { x: i * slot + (slot - barW) / 2, y: height - h, w: barW, h };
  });
}

/** Corner radius of a bar from the option (`0..100`, 100 = fully round), never more than half its width. */
export function barRadius(rect: BarRect, round: number): number {
  const pct = Math.min(Math.max(Number.isFinite(round) ? round : 0, 0), 100) / 100;
  return Math.min(rect.w / 2, rect.h) * pct;
}

/** How much of the song has played, `0..1`; `0` when the length is unknown. */
export function playedFraction(currentMs: number | null | undefined, durationMs: number): number {
  if (!(durationMs > 0) || currentMs == null || !Number.isFinite(currentMs)) return 0;
  return Math.min(Math.max(currentMs / durationMs, 0), 1);
}

/** Most points the graph can be asked to show: the data has 120 buckets, so more is interpolation. */
export const MAX_POINTS = 240;
export const MIN_POINTS = 20;

/**
 * `values` resampled to `count` points. Fewer points keep the **highest** value of each group (a short
 * spike must not disappear), more points interpolate linearly. Non-numbers count as `0`.
 */
export function resample(values: readonly number[], count: number): number[] {
  const n = Math.round(count);
  const src = values.map((v) => (Number.isFinite(v) ? v : 0));
  if (src.length === 0 || !(n > 0)) return [];
  if (n === src.length) return src;
  if (n < src.length) {
    return Array.from({ length: n }, (_, i) => {
      const from = Math.floor((i * src.length) / n);
      const to = Math.max(from + 1, Math.floor(((i + 1) * src.length) / n));
      let max = 0;
      for (let j = from; j < to; j++) max = Math.max(max, src[j]);
      return max;
    });
  }
  return Array.from({ length: n }, (_, i) => {
    // Centre of the new point, in source-bucket units.
    const pos = Math.min(Math.max(((i + 0.5) * src.length) / n - 0.5, 0), src.length - 1);
    const lo = Math.floor(pos);
    const hi = Math.min(lo + 1, src.length - 1);
    return src[lo] + (src[hi] - src[lo]) * (pos - lo);
  });
}

export interface Point {
  x: number;
  y: number;
}

export interface CubicSegment {
  c1: Point;
  c2: Point;
  to: Point;
}

/**
 * Cubic segments through `points` (x strictly increasing) with monotone tangents (Fritsch-Carlson): between two
 * points the curve never leaves the range of their two heights, so it cannot overshoot `0..1` the way a
 * Catmull-Rom spline does. `smooth` (`0..1`) scales the tangents: `0` is a polyline, `1` the full curve.
 */
export function monotoneSegments(points: readonly Point[], smooth: number): CubicSegment[] {
  const n = points.length;
  if (n < 2) return [];
  const s = Math.min(Math.max(Number.isFinite(smooth) ? smooth : 0, 0), 1);
  const dx = points.slice(1).map((p, i) => p.x - points[i].x);
  const slope = points.slice(1).map((p, i) => (dx[i] > 0 ? (p.y - points[i].y) / dx[i] : 0));
  const m = points.map((_, i) => {
    if (i === 0) return slope[0];
    if (i === n - 1) return slope[n - 2];
    // A local extremum (or flat) gets a flat tangent; otherwise the harmonic mean keeps it monotone.
    if (slope[i - 1] * slope[i] <= 0) return 0;
    return (2 * slope[i - 1] * slope[i]) / (slope[i - 1] + slope[i]);
  });
  // Limit the tangents so no interval overshoots.
  for (let i = 0; i < n - 1; i++) {
    if (slope[i] === 0) {
      m[i] = 0;
      m[i + 1] = 0;
      continue;
    }
    const a = m[i] / slope[i];
    const b = m[i + 1] / slope[i];
    const h = Math.hypot(a, b);
    if (h > 3) {
      m[i] = (3 * a * slope[i]) / h;
      m[i + 1] = (3 * b * slope[i]) / h;
    }
  }
  // Blend the monotone tangent with the chord's slope: `smooth` 0 is the straight line between the two points.
  const tangent = (k: number, i: number) => s * m[k] + (1 - s) * slope[i];
  return dx.map((d, i) => ({
    c1: { x: points[i].x + d / 3, y: points[i].y + (tangent(i, i) * d) / 3 },
    c2: { x: points[i + 1].x - d / 3, y: points[i + 1].y - (tangent(i + 1, i) * d) / 3 },
    to: points[i + 1],
  }));
}

/** One point per value, `x` at the centre of its slot and `y` from the top of a box of `height` (`pad` kept free). */
export function curvePoints(values: readonly number[], width: number, height: number, pad = 0): Point[] {
  if (values.length === 0 || width <= 0 || height <= 0) return [];
  const slot = width / values.length;
  const inner = Math.max(height - 2 * pad, 0);
  return values.map((raw, i) => {
    const v = Number.isFinite(raw) ? Math.min(Math.max(raw, 0), 1) : 0;
    return { x: (i + 0.5) * slot, y: pad + (1 - v) * inner };
  });
}
