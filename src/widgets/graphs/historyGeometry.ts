/** Pure maths of the history widgets (graph over time, hit error bar, comparison with a record). */

export type Metric = "pp" | "accuracy" | "score";

export interface Point {
  /** Song time in ms. */
  t: number;
  value: number;
}

export interface Domain {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

/** A record's samples: `[songTimeMs, score, pp, accuracy]`. */
export type Sample = readonly number[];

const COLUMN: Record<Metric, 1 | 2 | 3> = { score: 1, pp: 2, accuracy: 3 };

/** The record's value of `metric` at song time `t`, interpolated between its samples (`null` without samples). */
export function ghostAt(samples: readonly Sample[], t: number, metric: Metric): number | null {
  if (samples.length === 0) return null;
  const col = COLUMN[metric];
  if (t <= samples[0][0]) return samples[0][col];
  const last = samples[samples.length - 1];
  if (t >= last[0]) return last[col];
  // Samples are in song-time order: binary search for the first one at or after `t`.
  let lo = 1;
  let hi = samples.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (samples[mid][0] < t) lo = mid + 1;
    else hi = mid;
  }
  const a = samples[lo - 1];
  const b = samples[lo];
  const span = b[0] - a[0];
  return span <= 0 ? b[col] : a[col] + ((b[col] - a[col]) * (t - a[0])) / span;
}

/** The record's samples as graph points of `metric`. */
export function ghostPoints(samples: readonly Sample[], metric: Metric): Point[] {
  const col = COLUMN[metric];
  return samples.map((s) => ({ t: s[0], value: s[col] }));
}

/** A readable vertical range: PP from zero, accuracy zoomed on its top, both with some headroom. */
export function yRange(values: readonly number[], metric: Metric): [number, number] {
  const finite = values.filter(Number.isFinite);
  if (finite.length === 0) return metric === "accuracy" ? [0.9, 1] : [0, 1];
  const max = Math.max(...finite);
  const min = Math.min(...finite);
  if (metric === "accuracy") {
    // A play is usually above 90 %: zoom in, but never so far that a drop looks like a cliff.
    const low = Math.max(0, Math.min(0.95, Math.floor((min - 0.005) * 100) / 100));
    return [low, 1];
  }
  const top = max <= 0 ? 1 : max * 1.1;
  return [0, metric === "score" ? Math.ceil(top / 1000) * 1000 : Math.ceil(top / 10) * 10];
}

function project(p: Point, d: Domain, w: number, h: number): [number, number] {
  const fx = d.x1 === d.x0 ? 0 : (p.t - d.x0) / (d.x1 - d.x0);
  const fy = d.y1 === d.y0 ? 0 : (p.value - d.y0) / (d.y1 - d.y0);
  return [Math.min(Math.max(fx, 0), 1) * w, h - Math.min(Math.max(fy, 0), 1) * h];
}

const fixed = (n: number) => (Math.round(n * 10) / 10).toString();

/** SVG path of the points as a polyline (empty string for fewer than one point). */
export function linePath(points: readonly Point[], d: Domain, w: number, h: number): string {
  return points
    .map((p, i) => {
      const [x, y] = project(p, d, w, h);
      return `${i === 0 ? "M" : "L"}${fixed(x)} ${fixed(y)}`;
    })
    .join(" ");
}

/** The same polyline closed down to the bottom edge, to be filled. */
export function areaPath(points: readonly Point[], d: Domain, w: number, h: number): string {
  if (points.length === 0) return "";
  const [firstX] = project(points[0], d, w, h);
  const [lastX] = project(points[points.length - 1], d, w, h);
  return `${linePath(points, d, w, h)} L${fixed(lastX)} ${fixed(h)} L${fixed(firstX)} ${fixed(h)} Z`;
}

/** Overall difficulty after the mods that change it (Difficulty Adjust wins over HR / EZ). */
export function effectiveOd(od: number, mods: readonly string[], adjusted: number | null | undefined): number {
  if (typeof adjusted === "number") return adjusted;
  if (mods.includes("HR")) return Math.min(od * 1.4, 10);
  if (mods.includes("EZ")) return od * 0.5;
  return od;
}

/** Half-widths in ms of the osu!standard hit windows for an overall difficulty. */
export function hitWindows(od: number): { great: number; ok: number; meh: number } {
  return { great: 80 - 6 * od, ok: 140 - 8 * od, meh: 200 - 10 * od };
}

/** Mean timing error (negative = early); `null` without hits. */
export function meanError(errors: readonly number[]): number | null {
  if (errors.length === 0) return null;
  return errors.reduce((a, b) => a + b, 0) / errors.length;
}

/** `+12`, `-3`, `0`: a signed number for a difference. */
export function signed(value: number, decimals = 0): string {
  const rounded = Number(value.toFixed(decimals));
  const text = Math.abs(rounded).toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  return rounded > 0 ? `+${text}` : rounded < 0 ? `-${text}` : text;
}
