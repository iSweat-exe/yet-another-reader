import { playSpan } from "../lib/format";
import { useReaderStore } from "../lib/store";
import { prefersReducedMotion } from "./shared";
import { animationMsFor, type WidgetDefinition, type WidgetProps } from "./types";

/**
 * The fill is a full-width bar slid with `transform` (compositor only, no layout) and a short
 * transition: it retargets from where it is when the value changes again, and the 30 fps updates
 * glide instead of stepping. `transitionMs` is `0` for "reduce motion".
 */
function Bar({ ratio, instance, transitionMs, easing }: WidgetProps & { ratio: number; transitionMs: number; easing: string }) {
  const radius = instance.h / 2;
  const clamped = Number.isFinite(ratio) ? Math.max(0, Math.min(1, ratio)) : 0;
  return (
    <div
      className="size-full overflow-hidden"
      // The faint ring keeps an empty track visible over a bright background.
      style={{ borderRadius: radius, background: "rgb(255 255 255 / 0.18)", boxShadow: "0 0 0 1px rgb(0 0 0 / 0.35)" }}
    >
      <div
        className="h-full w-full"
        style={{
          borderRadius: radius,
          background: "currentColor",
          transform: `translateX(${(clamped - 1) * 100}%)`,
          transition: transitionMs > 0 ? `transform ${transitionMs}ms ${easing}` : "none",
        }}
      />
    </div>
  );
}

function Health({ instance }: WidgetProps) {
  const health = useReaderStore((s) => s.game.gameplay?.health ?? 1);
  return <Bar instance={instance} ratio={health} transitionMs={animationMsFor(instance) > 0 && !prefersReducedMotion() ? 200 : 0} easing="cubic-bezier(0.23, 1, 0.32, 1)" />;
}

function Progress({ instance }: WidgetProps) {
  const ratio = useReaderStore((s) => {
    const span = playSpan(s.game.difficulty, s.game.beatmap?.lengthMs ?? 0);
    return span.length > 0 ? ((s.game.time?.currentMs ?? 0) - span.start) / span.length : 0;
  });
  // The song position moves at a constant rate: a linear glide just fills the gap between two updates.
  return <Bar instance={instance} ratio={ratio} transitionMs={animationMsFor(instance) > 0 && !prefersReducedMotion() ? 120 : 0} easing="linear" />;
}

export const BAR_WIDGETS: WidgetDefinition[] = [
  { type: "health", labelKey: "widget.health", defaultSize: { w: 620, h: 14 }, Component: Health },
  { type: "progress", labelKey: "widget.progress", defaultSize: { w: 1000, h: 6 }, Component: Progress },
];
