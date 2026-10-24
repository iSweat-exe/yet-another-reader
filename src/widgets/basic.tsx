import type { ReactNode } from "react";
import { formatScore } from "../lib/format";
import { useReaderStore } from "../lib/store";
import { AnimatedNumber } from "../overlay/AnimatedNumber";
import { animationMsFor, fontSizeFor, type WidgetDefinition, type WidgetProps } from "./types";

function Text({ instance, fraction, weight = 700, children }: WidgetProps & { fraction: number; weight?: number; children: ReactNode }) {
  return (
    <div className="leading-none whitespace-nowrap tabular-nums" style={{ fontSize: fontSizeFor(instance, fraction), fontWeight: weight }}>
      {children}
    </div>
  );
}

function Score({ instance }: WidgetProps) {
  const score = useReaderStore((s) => s.game.gameplay?.score ?? 0);
  return (
    <Text instance={instance} fraction={0.85}>
      <AnimatedNumber value={score} format={(n) => formatScore(Math.round(n))} snapDown durationMs={animationMsFor(instance)} />
    </Text>
  );
}

function Combo({ instance }: WidgetProps) {
  const combo = useReaderStore((s) => s.game.gameplay?.combo ?? 0);
  return (
    <Text instance={instance} fraction={0.9}>
      <AnimatedNumber value={combo} format={(n) => `${Math.round(n)}x`} snapDown durationMs={animationMsFor(instance)} />
    </Text>
  );
}

function Accuracy({ instance }: WidgetProps) {
  const acc = useReaderStore((s) => s.game.gameplay?.accuracy ?? 1);
  return (
    <Text instance={instance} fraction={0.8}>
      <AnimatedNumber value={acc * 100} format={(n) => `${n.toFixed(2)}%`} durationMs={animationMsFor(instance)} />
    </Text>
  );
}

function Rank({ instance }: WidgetProps) {
  const rank = useReaderStore((s) => s.game.gameplay?.rank ?? "");
  return (
    <Text instance={instance} fraction={0.9}>
      {rank}
    </Text>
  );
}

function Ur({ instance }: WidgetProps) {
  const ur = useReaderStore((s) => s.game.gameplay?.unstableRate ?? null);
  return (
    <Text instance={instance} fraction={0.7} weight={600}>
      UR <AnimatedNumber value={ur ?? 0} format={(n) => (ur === null ? "—" : n.toFixed(1))} durationMs={animationMsFor(instance)} />
    </Text>
  );
}

function Pp({ instance }: WidgetProps) {
  const pp = useReaderStore((s) => s.game.gameplay?.pp ?? null);
  return (
    <Text instance={instance} fraction={0.7} weight={700}>
      <AnimatedNumber value={pp?.live ?? 0} format={(n) => (pp ? `${Math.round(n)}pp` : "—pp")} durationMs={animationMsFor(instance)} />
    </Text>
  );
}

export const BASIC_WIDGETS: WidgetDefinition[] = [
  { type: "score", labelKey: "widget.score", defaultSize: { w: 500, h: 84 }, Component: Score },
  { type: "combo", labelKey: "widget.combo", defaultSize: { w: 360, h: 110 }, Component: Combo },
  { type: "accuracy", labelKey: "widget.accuracy", defaultSize: { w: 300, h: 48 }, Component: Accuracy },
  { type: "rank", labelKey: "widget.rank", defaultSize: { w: 120, h: 80 }, Component: Rank },
  { type: "ur", labelKey: "widget.ur", defaultSize: { w: 200, h: 36 }, Component: Ur },
  { type: "pp", labelKey: "widget.pp", defaultSize: { w: 300, h: 70 }, Component: Pp },
];
