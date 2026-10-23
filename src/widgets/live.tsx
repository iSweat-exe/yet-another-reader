import { useT } from "../i18n";
import { useReaderStore } from "../lib/store";
import { AnimatedNumber } from "../overlay/AnimatedNumber";
import { useRef } from "react";
import { Line, usePresence } from "./shared";
import { animationMsFor, fontSizeFor, type WidgetDefinition, type WidgetProps } from "./types";

/** `pp` with its caption, for the live PP figures that only exist during a play. */
function ppValue(label: string, pick: (pp: { live: number; fc: number; ss: number }) => number) {
  return function PpValue({ instance }: WidgetProps) {
    const value = useReaderStore((s) => {
      const pp = s.game.gameplay?.pp;
      return pp ? pick(pp) : null;
    });
    return (
      <Line instance={instance} fraction={0.7}>
        <AnimatedNumber value={value ?? 0} format={(n) => (value === null ? "—pp" : `${Math.round(n)}pp`)} durationMs={animationMsFor(instance)} />
        <span style={{ fontSize: "0.55em", opacity: 0.75, marginLeft: "0.4em" }}>{label}</span>
      </Line>
    );
  };
}

const PpFc = ppValue("FC", (pp) => pp.fc);
const PpSs = ppValue("SS", (pp) => pp.ss);

const ACCURACIES = [
  ["95%", "pp95"],
  ["98%", "pp98"],
  ["99%", "pp99"],
  ["100%", "pp100"],
] as const;

/** What the beatmap is worth at 95 / 98 / 99 / 100 % accuracy, with the active mods. */
function PpTable({ instance }: WidgetProps) {
  const difficulty = useReaderStore((s) => s.game.difficulty);
  return (
    <div className="flex justify-between tabular-nums">
      {ACCURACIES.map(([label, key]) => (
        <div key={key} className="text-center leading-none">
          <div style={{ fontSize: fontSizeFor(instance, 0.5), fontWeight: 700 }}>{difficulty ? Math.round(difficulty[key]) : "—"}</div>
          <div style={{ fontSize: fontSizeFor(instance, 0.28), opacity: 0.75, fontWeight: 700 }}>{label}</div>
        </div>
      ))}
    </div>
  );
}

/** PAUSED or FAILED while that is the case, nothing otherwise. */
function PlayStatus({ instance }: WidgetProps) {
  const t = useT();
  const failed = useReaderStore((s) => s.game.gameplay?.failed === true);
  const paused = useReaderStore((s) => s.game.gameplay?.paused === true);
  const active = failed || paused;
  // Keeps the last wording on screen while it fades out.
  const text = useRef("");
  if (active) text.current = failed ? t("widget.status.failed") : t("widget.status.paused");
  const { mounted, shown } = usePresence(active);
  if (!mounted) return null;
  return (
    <div style={{ opacity: shown ? 1 : 0, transition: "opacity 150ms ease-out" }}>
      <Line instance={instance} fraction={0.8}>
        {text.current}
      </Line>
    </div>
  );
}

export const LIVE_WIDGETS: WidgetDefinition[] = [
  { type: "ppFc", labelKey: "widget.ppFc", defaultSize: { w: 240, h: 44 }, Component: PpFc },
  { type: "ppSs", labelKey: "widget.ppSs", defaultSize: { w: 240, h: 44 }, Component: PpSs },
  { type: "ppTable", labelKey: "widget.ppTable", defaultSize: { w: 420, h: 64 }, Component: PpTable },
  { type: "playStatus", labelKey: "widget.playStatus", defaultSize: { w: 320, h: 56 }, Component: PlayStatus },
];
