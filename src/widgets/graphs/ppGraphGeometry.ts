/** Pure maths of the PP graph in its shapes: line, area, steps, bars, dots and ring. */

import { project, type Domain, type Point } from "./historyGeometry";

export type PpShape = "line" | "area" | "step" | "bars" | "dots" | "ring";
export const PP_SHAPES: readonly PpShape[] = ["line", "area", "step", "bars", "dots", "ring"];

/** A bar never gets thinner than this, so a small value stays visible. */
const MIN_BAR_PX = 2;

const fixed = (n: number) => (Math.round(n * 10) / 10).toString();
const clamp01 = (v: number) => Math.min(Math.max(v, 0), 1);

/** Where `value` sits in the domain's vertical range, `0..1` (the bottom is 0). */
function fraction(value: number, d: Domain): number {
  return d.y1 === d.y0 ? 0 : clamp01((value - d.y0) / (d.y1 - d.y0));
}

/** The highest value of each of `count` equal time slices of the domain; `null` where there is none. */
export function bucketMax(points: readonly Point[], d: Domain, count: number): (number | null)[] {
  const buckets: (number | null)[] = Array.from({ length: Math.max(count, 0) }, () => null);
  const span = d.x1 - d.x0;
  if (count <= 0 || span <= 0) return buckets;
  for (const p of points) {
    if (!Number.isFinite(p.value)) continue;
    const i = Math.min(count - 1, Math.max(0, Math.floor(((p.t - d.x0) / span) * count)));
    const prev = buckets[i];
    buckets[i] = prev === null ? p.value : Math.max(prev, p.value);
  }
  return buckets;
}

export interface BarRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** One bar per bucket that has a value, bottom-aligned in a `w` × `h` box. `gap` is the empty share of a slot. */
export function barsOf(buckets: readonly (number | null)[], d: Domain, w: number, h: number, gap = 0.25): BarRect[] {
  if (buckets.length === 0 || w <= 0 || h <= 0) return [];
  const slot = w / buckets.length;
  const barW = slot * (1 - clamp01(gap));
  const bars: BarRect[] = [];
  buckets.forEach((value, i) => {
    if (value === null) return;
    const barH = Math.min(h, Math.max(MIN_BAR_PX, fraction(value, d) * h));
    bars.push({ x: i * slot + (slot - barW) / 2, y: h - barH, w: barW, h: barH });
  });
  return bars;
}

/** The centre of a dot per bucket that has a value. */
export function dotsOf(buckets: readonly (number | null)[], d: Domain, w: number, h: number): [number, number][] {
  if (buckets.length === 0 || w <= 0 || h <= 0) return [];
  const slot = w / buckets.length;
  const dots: [number, number][] = [];
  buckets.forEach((value, i) => {
    if (value === null) return;
    dots.push([(i + 0.5) * slot, h - fraction(value, d) * h]);
  });
  return dots;
}

/** A staircase: each value holds until the next point, then jumps to it. */
export function stepPath(points: readonly Point[], d: Domain, w: number, h: number): string {
  let path = "";
  let prev: [number, number] | undefined;
  for (const p of points) {
    const [x, y] = project(p, d, w, h);
    path += prev === undefined ? `M${fixed(x)} ${fixed(y)}` : ` L${fixed(x)} ${fixed(prev[1])} L${fixed(x)} ${fixed(y)}`;
    prev = [x, y];
  }
  return path;
}

/** An arc from the top, clockwise, covering `fraction` of the circle (a full circle at 1). */
export function ringPath(fraction: number, cx: number, cy: number, r: number): string {
  if (!Number.isFinite(fraction) || r <= 0) return "";
  const f = clamp01(fraction);
  if (f <= 0) return "";
  const top = `M${fixed(cx)} ${fixed(cy - r)}`;
  if (f >= 1) return `${top} A${fixed(r)} ${fixed(r)} 0 1 1 ${fixed(cx)} ${fixed(cy + r)} A${fixed(r)} ${fixed(r)} 0 1 1 ${fixed(cx)} ${fixed(cy - r)}`;
  const angle = -Math.PI / 2 + f * 2 * Math.PI;
  const x = cx + r * Math.cos(angle);
  const y = cy + r * Math.sin(angle);
  return `${top} A${fixed(r)} ${fixed(r)} 0 ${f > 0.5 ? 1 : 0} 1 ${fixed(x)} ${fixed(y)}`;
}
