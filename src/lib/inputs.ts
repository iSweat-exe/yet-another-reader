import type { InputState } from "./types";

export type InputDevice = "keyboard" | "mouse";

/** Presses are only kept for this long: enough to compute the rate over the last second or two. */
const PRESS_MEMORY_MS = 2000;

export interface InputStats {
  /** How many times each key was pressed, by `inputId`, since the counts were last reset. */
  counts: Record<string, number>;
  /** Times (ms, `performance.now()` clock) of the latest presses, oldest first. */
  presses: number[];
}

export const EMPTY_INPUT_STATS: InputStats = { counts: {}, presses: [] };

/** Key of `InputStats.counts` for a key of a device. */
export const inputId = (device: InputDevice, key: string) => `${device}:${key}`;

/**
 * The statistics after the held inputs went from `before` to `after`. Only new presses count, a key
 * held down is a single press. `counting` is `false` outside a play: the held keys then do not add up.
 */
export function applyInput(stats: InputStats, before: InputState, after: InputState, now: number, counting: boolean): InputStats {
  const pressed: string[] = [
    ...after.keys.filter((k) => !before.keys.includes(k)).map((k) => inputId("keyboard", k)),
    ...after.mouse.filter((k) => !before.mouse.includes(k)).map((k) => inputId("mouse", k)),
  ];
  const recent = stats.presses.filter((t) => now - t <= PRESS_MEMORY_MS);
  if (pressed.length === 0) return recent.length === stats.presses.length ? stats : { ...stats, presses: recent };
  const counts = { ...stats.counts };
  if (counting) for (const id of pressed) counts[id] = (counts[id] ?? 0) + 1;
  return { counts: counting ? counts : stats.counts, presses: [...recent, ...pressed.map(() => now)] };
}

/** Presses per second over the last `windowMs` (a second by default). */
export function pressRate(stats: InputStats, now: number, windowMs = 1000): number {
  const recent = stats.presses.filter((t) => now - t <= windowMs).length;
  return (recent * 1000) / windowMs;
}

/** One press of a key, as drawn in the trail behind its cap: held from `start` until `end` (`null` while still held). */
export interface TrailBar {
  start: number;
  end: number | null;
}

/**
 * The trail after the key became `pressed` or released at `now`. A press opens a bar, the release closes
 * it, and bars that have scrolled out of sight (`durationMs` after their end) are dropped. Returns the
 * same array when nothing changed.
 */
export function updateTrail(bars: TrailBar[], pressed: boolean, now: number, durationMs: number): TrailBar[] {
  let next = bars;
  const last = bars[bars.length - 1];
  if (pressed && (!last || last.end !== null)) next = [...bars, { start: now, end: null }];
  else if (!pressed && last && last.end === null) next = [...bars.slice(0, -1), { start: last.start, end: now }];
  const alive = next.filter((b) => b.end === null || now - b.end <= durationMs);
  return alive.length === next.length ? next : alive;
}

/**
 * Where each bar is at `now`, as distances from the cap along a trail `length` long. A bar travels the
 * whole trail in `durationMs`; the part that is not on the trail yet or already past its end is cut.
 */
export function trailSpans(bars: TrailBar[], now: number, durationMs: number, length: number): { near: number; far: number }[] {
  const at = (t: number) => Math.min(length, Math.max(0, ((now - t) / durationMs) * length));
  return bars.map((b) => ({ near: at(b.end ?? now), far: at(b.start) })).filter((s) => s.far > s.near);
}

/** What a key cap shows for a key: `ShiftLeft` -> `LShift`, `Number1` -> `1`, mouse `Left` -> `M1`. */
export function keyLabel(device: InputDevice, key: string): string {
  if (device === "mouse") {
    const mouse: Record<string, string> = { Left: "M1", Right: "M2", Middle: "M3", Button1: "M4", Button2: "M5" };
    return mouse[key] ?? key;
  }
  const short: Record<string, string> = {
    ShiftLeft: "LShift",
    ShiftRight: "RShift",
    ControlLeft: "LCtrl",
    ControlRight: "RCtrl",
    AltLeft: "LAlt",
    AltRight: "RAlt",
    Space: "Space",
    BackSpace: "Back",
    Escape: "Esc",
    Up: "↑",
    Down: "↓",
    Left: "←",
    Right: "→",
    Semicolon: ";",
    Comma: ",",
    Period: ".",
    Slash: "/",
    Quote: "'",
    Minus: "-",
    Plus: "+",
  };
  if (short[key]) return short[key];
  if (/^Number\d$/.test(key)) return key.slice(6);
  if (/^Keypad\d$/.test(key)) return `N${key.slice(6)}`;
  return key;
}
