import { useEffect, useMemo, useState } from "react";
import { useT } from "../../i18n";
import { formatScore } from "../../lib/system/format";
import { isTauri, MOCK_GHOST } from "../../lib/state/mock";
import { usePlaySeries } from "../../lib/state/playSeries";
import { useReaderStore } from "../../lib/state/store";
import type { PersonalBestGhost } from "../../lib/state/types";
import { AnimatedNumber } from "../../overlay/AnimatedNumber";
import {
  areaPath,
  effectiveOd,
  ghostAt,
  ghostPoints,
  hitWindows,
  linePath,
  meanError,
  signed,
  yRange,
  type Metric,
  type Point,
} from "../graphs/historyGeometry";
import { animationMsFor, fontSizeFor, type BuiltinOption, type WidgetDefinition, type WidgetProps } from "../types";
import { optionValues } from "../web";

const num = (v: unknown, fallback: number, min: number, max: number) => (typeof v === "number" && Number.isFinite(v) ? Math.min(Math.max(v, min), max) : fallback);
const METRICS: readonly Metric[] = ["pp", "accuracy", "score"];
const metricOf = (v: unknown, fallback: Metric): Metric => (METRICS.includes(v as Metric) ? (v as Metric) : fallback);

/** The osu! judgement colours (lazer's `OsuColour`): great, ok and meh. */
const JUDGEMENT = { great: "#66ccff", ok: "#b3d944", meh: "#ffcc22" } as const;

// ---------------------------------------------------------------------------------------------
// Hit error bar
// ---------------------------------------------------------------------------------------------

const BAR_OPTIONS: BuiltinOption[] = [
  { key: "windows", type: "boolean", labelKey: "widget.opt.hebWindows", default: true },
  { key: "colorize", type: "boolean", labelKey: "widget.opt.hebColorize", default: true },
  { key: "count", type: "number", labelKey: "widget.opt.hebCount", default: 30, min: 5, max: 100 },
  { key: "average", type: "boolean", labelKey: "widget.opt.hebAverage", default: true },
  { key: "labels", type: "boolean", labelKey: "widget.opt.hebLabels", default: false },
];

/** Half-range of the bar when the hit windows are unknown (not osu!standard), in ms. */
const FALLBACK_RANGE_MS = 120;

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);

/**
 * Where each hit landed on the timing scale, like lazer's hit error meter: the coloured bands are the
 * great / ok / meh windows, every hit leaves a tick (the newest is the boldest, older ones fade) and a
 * marker shows the average, which tells whether the player is early or late as a whole.
 */
function HitErrorBar({ instance }: WidgetProps) {
  const t = useT();
  const options = optionValues({ options: BAR_OPTIONS }, instance.options);
  const showWindows = options.windows !== false;
  const colorize = options.colorize !== false;
  const count = Math.round(num(options.count, 30, 5, 100));
  const labels = options.labels === true;
  const errors = useReaderStore((s) => s.game.gameplay?.hitErrors);
  const od = useReaderStore((s) => s.game.beatmap?.od ?? null);
  const mods = useReaderStore((s) => s.game.mods.join(","));
  const adjusted = useReaderStore((s) => s.game.difficultyAdjust?.od ?? null);
  const standard = useReaderStore((s) => s.game.ruleset === "osu");

  const windows = standard && od !== null ? hitWindows(effectiveOd(od, mods ? mods.split(",") : [], adjusted)) : null;
  const range = windows ? Math.max(Math.ceil(windows.meh), 20) : FALLBACK_RANGE_MS;
  const pct = (ms: number) => 50 + clamp(ms / range, -1, 1) * 50;
  const recent = (errors ?? []).slice(-count);
  const mean = options.average === false ? null : meanError(errors ?? []);
  const colorOf = (ms: number) => {
    if (!colorize || !windows) return "currentColor";
    const a = Math.abs(ms);
    return a <= windows.great ? JUDGEMENT.great : a <= windows.ok ? JUDGEMENT.ok : JUDGEMENT.meh;
  };
  const band = (half: number, color: string, opacity: number) => (
    <div key={color} className="absolute inset-y-0 rounded-[2px]" style={{ left: `${pct(-half)}%`, right: `${100 - pct(half)}%`, background: color, opacity }} />
  );
  const small = fontSizeFor(instance, 0.22);

  return (
    <div className="relative size-full" role="img" aria-label={t("widget.hitErrorBar")} style={{ filter: "drop-shadow(0 0 1px rgb(0 0 0 / 0.6))" }}>
      {showWindows && windows && (
        <div className="absolute inset-x-0 top-[38%] h-[24%]">
          {band(windows.meh, JUDGEMENT.meh, 0.22)}
          {band(windows.ok, JUDGEMENT.ok, 0.3)}
          {band(windows.great, JUDGEMENT.great, 0.4)}
        </div>
      )}
      <div className="absolute inset-y-[18%] left-1/2 w-px -translate-x-1/2 bg-current opacity-60" />
      {recent.map((ms, i) => {
        const newest = i === recent.length - 1;
        return (
          <div
            key={`${recent.length - i}`}
            className="absolute inset-y-[22%] -translate-x-1/2 rounded-full"
            style={{
              left: `${pct(ms)}%`,
              width: newest ? 3 : 2,
              background: colorOf(ms),
              opacity: 0.3 + (0.7 * (i + 1)) / recent.length,
            }}
          />
        );
      })}
      {mean !== null && (
        <div
          className="absolute top-0 size-0 -translate-x-1/2 border-x-[5px] border-t-[7px] border-x-transparent border-t-current transition-[left] duration-200 ease-out motion-reduce:transition-none"
          style={{ left: `${pct(mean)}%` }}
        />
      )}
      {labels && (
        <>
          <span className="absolute bottom-0 left-0 leading-none opacity-60" style={{ fontSize: small }}>
            {t("widget.hitErrorBar.early")}
          </span>
          <span className="absolute right-0 bottom-0 leading-none opacity-60" style={{ fontSize: small }}>
            {t("widget.hitErrorBar.late")}
          </span>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// The personal best (record) of the current map
// ---------------------------------------------------------------------------------------------

/** The personal best of the current beatmap with its per-second samples, fetched when it changes. */
export function usePersonalBestGhost(): PersonalBestGhost | null {
  const key = useReaderStore((s) => (s.game.personalBest ? `${s.game.personalBest.playedAt}:${s.game.personalBest.score}` : null));
  const base = useReaderStore((s) => (s.api?.running ? s.api.url : null));
  const [loaded, setLoaded] = useState<{ key: string; ghost: PersonalBestGhost | null } | null>(null);

  useEffect(() => {
    if (!key) return;
    let cancelled = false;
    const done = (ghost: PersonalBestGhost | null) => {
      if (!cancelled) setLoaded({ key, ghost });
    };
    // In a plain browser (the design preview) there may be no server: a made-up record stands in.
    const fallback = isTauri ? null : MOCK_GHOST;
    if (!base) {
      done(fallback);
      return () => {
        cancelled = true;
      };
    }
    fetch(`${base}/api/v1/personal-best`)
      .then((r) => (r.ok ? (r.json() as Promise<PersonalBestGhost | null>) : null))
      .then((ghost) => done(ghost ?? fallback))
      .catch(() => done(fallback));
    return () => {
      cancelled = true;
    };
  }, [key, base]);

  return key && loaded?.key === key ? loaded.ghost : null;
}

function formatMetric(metric: Metric, value: number): string {
  if (metric === "pp") return `${Math.round(value)}pp`;
  if (metric === "accuracy") return `${(value * 100).toFixed(2)}%`;
  return formatScore(Math.round(value));
}

// ---------------------------------------------------------------------------------------------
// Graph over time
// ---------------------------------------------------------------------------------------------

const GRAPH_OPTIONS: BuiltinOption[] = [
  { key: "metric", type: "select", labelKey: "widget.opt.pgMetric", default: "pp", choices: METRICS.map((value) => ({ value })) },
  { key: "style", type: "select", labelKey: "widget.opt.pgStyle", default: "area", choices: [{ value: "line" }, { value: "area" }] },
  { key: "color", type: "color", labelKey: "widget.opt.pgColor", default: "#f472b6" },
  { key: "lineWidth", type: "number", labelKey: "widget.opt.pgLineWidth", default: 3, min: 1, max: 10 },
  { key: "record", type: "boolean", labelKey: "widget.opt.pgRecord", default: true },
  { key: "showValue", type: "boolean", labelKey: "widget.opt.pgValue", default: true },
];

/**
 * PP, accuracy or score over the song, drawn as the play unfolds and filling the width of the map.
 * The record's own curve can sit behind it (dashed), so the play is read against what it has to beat.
 */
function PlayGraph({ instance }: WidgetProps) {
  const t = useT();
  const options = optionValues({ options: GRAPH_OPTIONS }, instance.options);
  const metric = metricOf(options.metric, "pp");
  const color = typeof options.color === "string" ? options.color : "#f472b6";
  const lineWidth = num(options.lineWidth, 3, 1, 10);
  const filled = options.style !== "line";
  const showValue = options.showValue !== false;
  const series = usePlaySeries();
  const ghost = usePersonalBestGhost();
  const first = useReaderStore((s) => s.game.difficulty?.firstObjectMs ?? 0);
  const last = useReaderStore((s) => s.game.difficulty?.lastObjectMs || s.game.beatmap?.lengthMs || 0);

  const w = Math.max(instance.w, 1);
  const h = Math.max(instance.h, 1);
  const pad = lineWidth / 2 + 1;
  const drawing = useMemo(() => {
    const points: Point[] = series.map((p) => ({ t: p.t, value: metric === "pp" ? p.pp : metric === "accuracy" ? p.accuracy : p.score }));
    const record = options.record !== false && ghost ? ghostPoints(ghost.samples, metric) : [];
    const end = last > first ? last : Math.max(first + 1, ...points.map((p) => p.t));
    const [y0, y1] = yRange([...points, ...record].map((p) => p.value), metric);
    const domain = { x0: first, x1: end, y0, y1 };
    return {
      domain,
      current: points[points.length - 1],
      line: linePath(points, domain, w, h - 2 * pad).trim(),
      area: filled ? areaPath(points, domain, w, h - 2 * pad) : "",
      record: linePath(record, domain, w, h - 2 * pad),
    };
  }, [series, ghost, metric, first, last, w, h, pad, filled, options.record]);

  return (
    <div className="relative size-full" role="img" aria-label={t(`widget.choice.metric.${metric}`)}>
      <svg viewBox={`0 0 ${w} ${h}`} className="absolute inset-0 size-full overflow-visible" style={{ filter: "drop-shadow(0 0 1px rgb(0 0 0 / 0.5))" }}>
        <defs>
          <linearGradient id={`pg-${instance.id}`} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor={color} stopOpacity="0.5" />
            <stop offset="1" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        <g transform={`translate(0 ${pad})`}>
          {drawing.record && <path d={drawing.record} fill="none" stroke="currentColor" strokeOpacity="0.45" strokeWidth={Math.max(1, lineWidth * 0.6)} strokeDasharray="6 5" strokeLinejoin="round" />}
          {drawing.area && <path d={drawing.area} fill={`url(#pg-${instance.id})`} />}
          {drawing.line && <path d={drawing.line} fill="none" stroke={color} strokeWidth={lineWidth} strokeLinejoin="round" strokeLinecap="round" />}
        </g>
      </svg>
      {showValue && drawing.current && (
        <div className="absolute top-0 right-0 leading-none whitespace-nowrap tabular-nums" style={{ fontSize: fontSizeFor(instance, 0.28), fontWeight: 700, color }}>
          {formatMetric(metric, drawing.current.value)}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Gap to the record
// ---------------------------------------------------------------------------------------------

const DELTA_OPTIONS: BuiltinOption[] = [
  { key: "metric", type: "select", labelKey: "widget.opt.pbMetric", default: "pp", choices: METRICS.map((value) => ({ value })) },
  { key: "showRecord", type: "boolean", labelKey: "widget.opt.pbShowRecord", default: true },
  { key: "ahead", type: "color", labelKey: "widget.opt.pbAhead", default: "#4ade80" },
  { key: "behind", type: "color", labelKey: "widget.opt.pbBehind", default: "#f87171" },
];

/** Decimals of a difference, and the factor that brings the metric to the unit it is shown in. */
const DELTA_FORMAT: Record<Metric, { decimals: number; scale: number; unit: string }> = {
  pp: { decimals: 1, scale: 1, unit: "pp" },
  accuracy: { decimals: 2, scale: 100, unit: "%" },
  score: { decimals: 0, scale: 1, unit: "" },
};

/**
 * How far ahead of (green) or behind (red) the record the play is *at this very moment of the song*,
 * because the record's own score at the same time is what a live score should be compared with.
 */
function PersonalBestDelta({ instance }: WidgetProps) {
  const t = useT();
  const options = optionValues({ options: DELTA_OPTIONS }, instance.options);
  const metric = metricOf(options.metric, "pp");
  const ahead = typeof options.ahead === "string" ? options.ahead : "#4ade80";
  const behind = typeof options.behind === "string" ? options.behind : "#f87171";
  const ghost = usePersonalBestGhost();
  const live = useReaderStore((s) => {
    const g = s.game.gameplay;
    if (!g) return null;
    return metric === "pp" ? (g.pp?.live ?? 0) : metric === "accuracy" ? g.accuracy : g.score;
  });
  const time = useReaderStore((s) => s.game.time?.currentMs ?? 0);

  const fmt = DELTA_FORMAT[metric];
  const record = ghost ? ghostAt(ghost.samples, time, metric) : null;
  const final = ghost ? { pp: ghost.pp, accuracy: ghost.accuracy, score: ghost.score }[metric] : null;
  const delta = live !== null && record !== null ? (live - record) * fmt.scale : null;
  const color = delta === null ? undefined : delta >= 0 ? ahead : behind;

  return (
    <div className="text-center leading-none tabular-nums">
      <div style={{ fontSize: fontSizeFor(instance, 0.6), fontWeight: 700, color }}>
        {delta === null ? (
          "—"
        ) : (
          <AnimatedNumber value={delta} format={(n) => `${signed(n, fmt.decimals)}${fmt.unit}`} durationMs={animationMsFor(instance)} />
        )}
      </div>
      {options.showRecord !== false && (
        <div style={{ fontSize: fontSizeFor(instance, 0.26), opacity: 0.7, fontWeight: 600 }}>
          {final === null ? t("widget.pbNone") : `${t("widget.pbRecord")} ${formatMetric(metric, final)}`}
        </div>
      )}
    </div>
  );
}

export const HISTORY_WIDGETS: WidgetDefinition[] = [
  { type: "hitErrorBar", labelKey: "widget.hitErrorBar", defaultSize: { w: 500, h: 48 }, Component: HitErrorBar, options: BAR_OPTIONS },
  { type: "playGraph", labelKey: "widget.playGraph", defaultSize: { w: 520, h: 140 }, Component: PlayGraph, options: GRAPH_OPTIONS },
  { type: "pbDelta", labelKey: "widget.pbDelta", defaultSize: { w: 280, h: 84 }, Component: PersonalBestDelta, options: DELTA_OPTIONS },
];
