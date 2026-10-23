import type { ComponentType } from "react";
import { Icon } from "../components/Icon";
import { ModIcon } from "../components/ModIcon";
import { HitErrorStrip } from "../components/HitErrorStrip";
import { formatDuration } from "../lib/format";
import { useReaderStore } from "../lib/store";
import type { Beatmap } from "../lib/types";
import { AnimatedNumber } from "../overlay/AnimatedNumber";
import { animationMsFor, fontSizeFor, type WidgetDefinition, type WidgetProps } from "./types";

function BeatmapInfo({ instance }: WidgetProps) {
  const map = useReaderStore((s) => s.game.beatmap);
  const stars = useReaderStore((s) => s.game.difficulty?.stars ?? s.game.beatmap?.starRating ?? 0);
  if (!map) return null;
  return (
    <div className="leading-tight">
      <div className="truncate font-bold" style={{ fontSize: fontSizeFor(instance, 0.4) }}>
        {map.title}
      </div>
      <div className="truncate opacity-80" style={{ fontSize: fontSizeFor(instance, 0.28) }}>
        {map.artist} · [{map.version}]
      </div>
      <div className="tabular-nums opacity-80" style={{ fontSize: fontSizeFor(instance, 0.28) }}>
        {stars.toFixed(2)}
        <Icon name="star" className="mx-0.5 -mt-[0.15em] inline size-[0.8em]" /> · {Math.round(map.bpm)} BPM · AR{map.ar.toFixed(1)} OD{map.od.toFixed(1)}
      </div>
    </div>
  );
}

function Mods({ instance }: WidgetProps) {
  const mods = useReaderStore((s) => s.game.mods);
  if (mods.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {mods.map((m) => (
        <ModIcon key={m} mod={m} height={fontSizeFor(instance, 1)} />
      ))}
    </div>
  );
}

const HIT_KEYS = ["great", "ok", "meh", "miss"] as const;
const HIT_COLORS = { great: "#60a5fa", ok: "#4ade80", meh: "#fbbf24", miss: "#f87171" } as const;
const HIT_LABELS = { great: "300", ok: "100", meh: "50", miss: "miss" } as const;

function HitCounts({ instance }: WidgetProps) {
  const hits = useReaderStore((s) => s.game.gameplay?.hits);
  return (
    <div className="flex justify-between tabular-nums">
      {HIT_KEYS.map((k) => (
        <div key={k} className="text-center leading-none">
          <div style={{ fontSize: fontSizeFor(instance, 0.5), fontWeight: 700 }}>
            <AnimatedNumber value={hits?.[k] ?? 0} format={(n) => String(Math.round(n))} snapDown durationMs={animationMsFor(instance)} />
          </div>
          <div style={{ fontSize: fontSizeFor(instance, 0.28), color: HIT_COLORS[k], fontWeight: 700 }}>{HIT_LABELS[k]}</div>
        </div>
      ))}
    </div>
  );
}

function hitCount(key: (typeof HIT_KEYS)[number]): ComponentType<WidgetProps> {
  return function HitCount({ instance }: WidgetProps) {
    const value = useReaderStore((s) => s.game.gameplay?.hits[key] ?? 0);
    return (
      <div className="text-center leading-none tabular-nums">
        <div style={{ fontSize: fontSizeFor(instance, 0.6), fontWeight: 700 }}>
          <AnimatedNumber value={value} format={(n) => String(Math.round(n))} snapDown durationMs={animationMsFor(instance)} />
        </div>
        <div style={{ fontSize: fontSizeFor(instance, 0.3), color: HIT_COLORS[key], fontWeight: 700 }}>{HIT_LABELS[key]}</div>
      </div>
    );
  };
}

const Great = hitCount("great");
const Ok = hitCount("ok");
const Meh = hitCount("meh");
const Miss = hitCount("miss");

function HitErrors() {
  const errors = useReaderStore((s) => s.game.gameplay?.hitErrors);
  // The most recent hits are the readable ones; drawing fewer lines also repaints faster.
  return <HitErrorStrip errors={(errors ?? []).slice(-64)} className="size-full" />;
}

function MaxCombo({ instance }: WidgetProps) {
  const max = useReaderStore((s) => s.game.gameplay?.maxCombo ?? 0);
  const full = useReaderStore((s) => s.game.gameplay?.beatmapMaxCombo ?? s.game.difficulty?.maxCombo ?? 0);
  return (
    <div className="leading-none whitespace-nowrap tabular-nums" style={{ fontSize: fontSizeFor(instance, 0.7), fontWeight: 700 }}>
      <AnimatedNumber value={max} format={(n) => `${Math.round(n)}x`} snapDown durationMs={animationMsFor(instance)} />
      {full > 0 && <span style={{ fontSize: "0.65em", opacity: 0.7 }}> / {full}x</span>}
    </div>
  );
}

function Stars({ instance }: WidgetProps) {
  const stars = useReaderStore((s) => s.game.difficulty?.stars ?? s.game.beatmap?.starRating ?? null);
  return (
    <div className="leading-none whitespace-nowrap tabular-nums" style={{ fontSize: fontSizeFor(instance, 0.8), fontWeight: 700 }}>
      {stars === null ? "—" : stars.toFixed(2)}
      <Icon name="star" className="ml-[0.15em] -mt-[0.15em] inline size-[0.8em]" />
    </div>
  );
}

function Bpm({ instance }: WidgetProps) {
  const bpm = useReaderStore((s) => s.game.beatmap?.bpm ?? null);
  return (
    <div className="leading-none whitespace-nowrap tabular-nums" style={{ fontSize: fontSizeFor(instance, 0.8), fontWeight: 700 }}>
      {bpm === null ? "—" : Math.round(bpm)} BPM
    </div>
  );
}

/** A difficulty value (CS, AR, OD, HP) under its label, like one column of the hit counts. */
function difficultyStat(label: string, pick: (map: Beatmap) => number): ComponentType<WidgetProps> {
  return function DifficultyStat({ instance }: WidgetProps) {
    const value = useReaderStore((s) => (s.game.beatmap ? pick(s.game.beatmap) : null));
    return (
      <div className="text-center leading-none tabular-nums">
        <div style={{ fontSize: fontSizeFor(instance, 0.6), fontWeight: 700 }}>{value === null ? "—" : value.toFixed(1)}</div>
        <div style={{ fontSize: fontSizeFor(instance, 0.3), opacity: 0.75, fontWeight: 700 }}>{label}</div>
      </div>
    );
  };
}

const Cs = difficultyStat("CS", (m) => m.cs);
const Ar = difficultyStat("AR", (m) => m.ar);
const Od = difficultyStat("OD", (m) => m.od);
const Hp = difficultyStat("HP", (m) => m.hp);

function Timer({ instance }: WidgetProps) {
  // Selecting whole seconds keeps the widget from re-rendering on every clock tick.
  const current = useReaderStore((s) => Math.floor((s.game.time?.currentMs ?? 0) / 1000) * 1000);
  const length = useReaderStore((s) => s.game.beatmap?.lengthMs ?? 0);
  return (
    <div className="leading-none whitespace-nowrap tabular-nums" style={{ fontSize: fontSizeFor(instance, 0.7), fontWeight: 700 }}>
      {formatDuration(current)}
      <span style={{ opacity: 0.7 }}> / {formatDuration(length)}</span>
    </div>
  );
}

export const INFO_WIDGETS: WidgetDefinition[] = [
  { type: "beatmapInfo", labelKey: "widget.beatmapInfo", defaultSize: { w: 760, h: 80 }, Component: BeatmapInfo },
  { type: "mods", labelKey: "widget.mods", defaultSize: { w: 400, h: 40 }, Component: Mods },
  { type: "stars", labelKey: "widget.stars", defaultSize: { w: 180, h: 44 }, Component: Stars },
  { type: "bpm", labelKey: "widget.bpm", defaultSize: { w: 200, h: 44 }, Component: Bpm },
  { type: "cs", labelKey: "widget.cs", defaultSize: { w: 80, h: 64 }, Component: Cs },
  { type: "ar", labelKey: "widget.ar", defaultSize: { w: 80, h: 64 }, Component: Ar },
  { type: "od", labelKey: "widget.od", defaultSize: { w: 80, h: 64 }, Component: Od },
  { type: "hp", labelKey: "widget.hp", defaultSize: { w: 80, h: 64 }, Component: Hp },
  { type: "timer", labelKey: "widget.timer", defaultSize: { w: 240, h: 44 }, Component: Timer },
  { type: "maxCombo", labelKey: "widget.maxCombo", defaultSize: { w: 300, h: 44 }, Component: MaxCombo },
  { type: "hitCounts", labelKey: "widget.hitCounts", defaultSize: { w: 400, h: 80 }, Component: HitCounts },
  { type: "great", labelKey: "widget.great", defaultSize: { w: 100, h: 80 }, Component: Great },
  { type: "ok", labelKey: "widget.ok", defaultSize: { w: 100, h: 80 }, Component: Ok },
  { type: "meh", labelKey: "widget.meh", defaultSize: { w: 100, h: 80 }, Component: Meh },
  { type: "miss", labelKey: "widget.miss", defaultSize: { w: 100, h: 80 }, Component: Miss },
  { type: "hitErrors", labelKey: "widget.hitErrors", defaultSize: { w: 500, h: 36 }, Component: HitErrors },
];
