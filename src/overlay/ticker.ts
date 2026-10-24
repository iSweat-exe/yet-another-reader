/**
 * One animation clock shared by every animated widget, capped at the overlay's refresh rate.
 *
 * Painting a transparent window over the game has a real cost, so animations must not run at
 * the monitor's rate by default: they advance at the user's chosen fps (see Settings), and the
 * loop only runs while something is animating.
 */

type Tick = (now: number) => void;

const subscribers = new Set<Tick>();
let fps = 30;
let frame = 0;
let last = 0;

function loop(now: number) {
  frame = requestAnimationFrame(loop);
  // Small tolerance: rAF timestamps jitter around the frame boundary (a quarter of the frame at
  // high rates, so 240-360 fps still follows the display's refresh instead of skipping frames).
  const interval = 1000 / fps;
  if (now - last < interval - Math.min(2, interval / 4)) return;
  last = now;
  for (const tick of subscribers) tick(now);
}

export function setTickerFps(next: number) {
  fps = Math.max(1, next);
}

/** Calls `tick` every frame until the returned function is called. */
export function subscribeTicker(tick: Tick): () => void {
  subscribers.add(tick);
  if (subscribers.size === 1) frame = requestAnimationFrame(loop);
  return () => {
    subscribers.delete(tick);
    if (subscribers.size === 0) cancelAnimationFrame(frame);
  };
}
