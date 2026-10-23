import { useEffect, useState, type ReactNode } from "react";
import { fontSizeFor, type WidgetProps } from "./types";

/** One line of text sized from the widget's height, like the other text widgets. */
export function Line({ instance, fraction, weight = 700, children }: WidgetProps & { fraction: number; weight?: number; children: ReactNode }) {
  return (
    <div className="leading-tight whitespace-nowrap tabular-nums" style={{ fontSize: fontSizeFor(instance, fraction), fontWeight: weight }}>
      {children}
    </div>
  );
}

/** A truncated line: a long title must not spill out of its box. */
export function Truncated({ instance, fraction, weight = 700, children }: WidgetProps & { fraction: number; weight?: number; children: ReactNode }) {
  return (
    <Line instance={instance} fraction={fraction} weight={weight}>
      <span className="block truncate">{children}</span>
    </Line>
  );
}

/** `true` when the system asks for less motion; read once, tweens are not worth a listener. */
export function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Keeps something mounted while it fades out. `mounted` says whether to render it, `shown` is the
 * opacity target (`false` on the first frame of an entrance so the transition has a start).
 */
export function usePresence(show: boolean, exitMs = 150): { mounted: boolean; shown: boolean } {
  const [mounted, setMounted] = useState(show);
  const [shown, setShown] = useState(show);
  useEffect(() => {
    if (show) {
      setMounted(true);
      const id = requestAnimationFrame(() => setShown(true));
      return () => cancelAnimationFrame(id);
    }
    setShown(false);
    const id = setTimeout(() => setMounted(false), exitMs);
    return () => clearTimeout(id);
  }, [show, exitMs]);
  return { mounted: mounted || show, shown: shown && show };
}
