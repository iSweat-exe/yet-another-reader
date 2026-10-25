import { animate } from "motion";
import { GESTURES } from "./iconGestures";
import type { IconName } from "./Icon";

const OUT = [0.23, 1, 0.32, 1] as const;

/**
 * Plays the gesture of `name` on `svg` (the icon's root: an `<svg>`, or the box of an osu icon, which has no
 * `path` to draw: it pops in instead); resolves when the icon is back at rest.
 */
export async function playGesture(name: IconName, svg: Element, path: SVGPathElement | null): Promise<void> {
  const g = GESTURES[name];
  if (!g) return;
  switch (g.kind) {
    case "spin":
      await animate(svg, { rotate: [0, g.deg] }, { duration: (g.ms ?? 250) / 1000, ease: OUT });
      // A quarter or full turn looks the same as rest, so the reset is invisible.
      await animate(svg, { rotate: 0 }, { duration: 0 });
      break;
    case "draw":
      if (path) await animate(path, { pathLength: [0.1, 1] }, { duration: 0.35, ease: OUT });
      else await animate(svg, { scale: [0.8, 1] }, { duration: 0.3, ease: OUT });
      break;
    case "nudge":
      await animate(svg, { x: [0, g.x, 0], y: [0, g.y, 0] }, { duration: 0.28, ease: "easeOut" });
      break;
    case "tilt":
      await animate(svg, { rotate: [0, -g.deg, g.deg * 0.7, 0] }, { duration: 0.4, ease: "easeOut" });
      break;
  }
}
