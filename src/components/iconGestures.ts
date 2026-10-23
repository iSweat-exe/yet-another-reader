import type { IconName } from "./Icon";

/**
 * What an icon does when the pointer (or the keyboard focus) reaches the control it sits in: one short
 * gesture that says what the icon means, then back to rest. Never a loop, never on its own.
 * Only icons whose meaning is an action or a direction have one; the others (widget and view icons) stay
 * still, because the same wiggle on every icon would say nothing.
 */
export type Gesture =
  | { kind: "spin"; deg: number; ms?: number }
  | { kind: "draw" }
  | { kind: "nudge"; x: number; y: number }
  | { kind: "tilt"; deg: number };

const nudge = (x: number, y: number): Gesture => ({ kind: "nudge", x, y });
const tilt = (deg: number): Gesture => ({ kind: "tilt", deg });

export const GESTURES: Partial<Record<IconName, Gesture>> = {
  plus: { kind: "spin", deg: 90 },
  close: { kind: "spin", deg: 90 },
  check: { kind: "draw" },
  "check-circle": { kind: "draw" },
  copy: nudge(1, -1),
  pencil: tilt(12),
  trash: tilt(10),
  download: nudge(0, 1.5),
  upload: nudge(0, -1.5),
  undo: nudge(-1.5, 0),
  redo: nudge(1.5, 0),
  refresh: { kind: "spin", deg: 360, ms: 500 },
  external: nudge(1, -1),
  lock: tilt(10),
  unlock: tilt(10),
  "chevron-up": nudge(0, -1.5),
  "chevron-down": nudge(0, 1.5),
  "chevron-right": nudge(1.5, 0),
  "align-left": nudge(-1.5, 0),
  "align-right": nudge(1.5, 0),
  "align-top": nudge(0, -1.5),
  "align-bottom": nudge(0, 1.5),
};
