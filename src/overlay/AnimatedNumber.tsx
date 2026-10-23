import { useEffect, useRef } from "react";
import { subscribeTicker } from "./ticker";

interface Props {
  value: number;
  /** Turns the (possibly fractional) displayed number into text. */
  format: (n: number) => string;
  /** Tween length in ms; `0` disables the animation. */
  durationMs?: number;
  /** A drop is a reset (new play, retry), not a trend: show it at once instead of counting down. */
  snapDown?: boolean;
  className?: string;
}

const easeOutCubic = (t: number) => 1 - (1 - t) ** 3;

/**
 * A number that counts up or down to its new value instead of jumping.
 *
 * The text is written straight into the DOM from the shared ticker, so a tween never causes
 * React renders: only the changing text node is touched.
 */
export function AnimatedNumber({ value, format, durationMs = 250, snapDown = false, className }: Props) {
  const element = useRef<HTMLSpanElement>(null);
  const shown = useRef(value);
  const formatRef = useRef(format);
  formatRef.current = format;
  // Rendered once: later text is written by the tween, so React never overwrites it.
  const initial = useRef(format(value));
  // Re-sync when only the wording changes (e.g. "—" becoming a number) while the value stays.
  const finalText = format(value);

  useEffect(() => {
    const el = element.current;
    if (!el) return;
    const from = shown.current;
    const to = value;
    if (from === to) {
      el.textContent = formatRef.current(to);
      return;
    }
    // A count-up is motion on screen all game long: with "reduce motion" the number simply changes.
    if (durationMs <= 0 || (snapDown && to < from) || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      shown.current = to;
      el.textContent = formatRef.current(to);
      return;
    }

    const started = performance.now();
    const stop = subscribeTicker((now) => {
      const t = Math.min(1, (now - started) / durationMs);
      shown.current = from + (to - from) * easeOutCubic(t);
      el.textContent = formatRef.current(shown.current);
      if (t >= 1) stop();
    });
    // A newer value restarts the tween from wherever the number currently is.
    return stop;
  }, [value, durationMs, snapDown, finalText]);

  return (
    <span ref={element} className={className}>
      {initial.current}
    </span>
  );
}
