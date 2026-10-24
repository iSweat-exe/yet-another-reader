import { useMemo } from "react";
import { useT } from "../../i18n";
import { usePlaySeries } from "../../lib/state/playSeries";
import { useReaderStore } from "../../lib/state/store";
import { AnimatedNumber } from "../../overlay/AnimatedNumber";
import { areaPath, linePath, signed, yRange, type Domain, type Point } from "../graphs/historyGeometry";
import { barsOf, bucketMax, dotsOf, PP_SHAPES, ringPath, stepPath, type PpShape } from "../graphs/ppGraphGeometry";
import { animationMsFor, fontSizeFor, type BuiltinOption, type WidgetDefinition, type WidgetProps } from "../types";
import { optionValues } from "../web";
import { usePersonalBestGhost } from "./history";

const num = (v: unknown, fallback: number, min: number, max: number) => (typeof v === "number" && Number.isFinite(v) ? Math.min(Math.max(v, min), max) : fallback);
const shapeOf = (v: unknown): PpShape => (PP_SHAPES.includes(v as PpShape) ? (v as PpShape) : "area");

// ---------------------------------------------------------------------------------------------
// Gap to the highest PP of the map
// ---------------------------------------------------------------------------------------------

const MAX_DELTA_OPTIONS: BuiltinOption[] = [
  { key: "showMax", type: "boolean", labelKey: "widget.opt.ppMaxShow", default: true },
  { key: "ahead", type: "color", labelKey: "widget.opt.pbAhead", default: "#4ade80" },
  { key: "behind", type: "color", labelKey: "widget.opt.pbBehind", default: "#f87171" },
];

/**
 * The live PP against the most PP the player has reached on this map: at or above it (green) is a
 * new high, below it (red) is how far there is to go. The app keeps that maximum across every
 * completed play it has seen, not only the record's.
 */
function PpMaxDelta({ instance }: WidgetProps) {
  const t = useT();
  const options = optionValues({ options: MAX_DELTA_OPTIONS }, instance.options);
  const ahead = typeof options.ahead === "string" ? options.ahead : "#4ade80";
  const behind = typeof options.behind === "string" ? options.behind : "#f87171";
  const ghost = usePersonalBestGhost();
  const live = useReaderStore((s) => s.game.gameplay?.pp?.live ?? null);
  const max = ghost ? ghost.maxPp : null;
  const delta = live !== null && max !== null ? live - max : null;
  const color = delta === null ? undefined : delta >= 0 ? ahead : behind;

  return (
    <div className="text-center leading-none tabular-nums">
      <div style={{ fontSize: fontSizeFor(instance, 0.6), fontWeight: 700, color }}>
        {delta === null ? (
          "—"
        ) : (
          <AnimatedNumber value={delta} format={(n) => `${signed(n, 1)}pp`} durationMs={animationMsFor(instance)} />
        )}
      </div>
      {options.showMax !== false && (
        <div style={{ fontSize: fontSizeFor(instance, 0.26), opacity: 0.7, fontWeight: 600 }}>
          {max === null ? t("widget.pbNone") : `${t("widget.ppMaxRecord")} ${Math.round(max)}pp`}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// PP graph, in several shapes
// ---------------------------------------------------------------------------------------------

const SHAPE_OPTIONS: BuiltinOption[] = [
  { key: "shape", type: "select", labelKey: "widget.opt.ppShape", default: "area", choices: PP_SHAPES.map((value) => ({ value })) },
  { key: "color", type: "color", labelKey: "widget.opt.pgColor", default: "#f472b6" },
  { key: "lineWidth", type: "number", labelKey: "widget.opt.pgLineWidth", default: 3, min: 1, max: 10 },
  { key: "showValue", type: "boolean", labelKey: "widget.opt.pgValue", default: true },
];

/** How many time slices the bars and dots are drawn over: about one every six pixels, within limits. */
const slicesFor = (w: number) => Math.max(8, Math.min(120, Math.round(w / 6)));

/**
 * The play's PP over the song, drawn in the chosen shape. The ring is the exception: it shows the
 * live PP as a share of the most the map can give (its 100 % PP), since it has no time axis.
 */
function PpGraph({ instance }: WidgetProps) {
  const t = useT();
  const options = optionValues({ options: SHAPE_OPTIONS }, instance.options);
  const shape = shapeOf(options.shape);
  const color = typeof options.color === "string" ? options.color : "#f472b6";
  const lineWidth = num(options.lineWidth, 3, 1, 10);
  const showValue = options.showValue !== false;
  const series = usePlaySeries();
  const first = useReaderStore((s) => s.game.difficulty?.firstObjectMs ?? 0);
  const last = useReaderStore((s) => s.game.difficulty?.lastObjectMs || s.game.beatmap?.lengthMs || 0);
  const live = useReaderStore((s) => s.game.gameplay?.pp?.live ?? null);
  const mapMax = useReaderStore((s) => s.game.difficulty?.pp100 ?? 0);

  const w = Math.max(instance.w, 1);
  const h = Math.max(instance.h, 1);
  const pad = lineWidth / 2 + 1;
  const gradientId = `pp-${instance.id}`;

  const graph = useMemo(() => {
    if (shape === "ring") return null;
    const points: Point[] = series.map((p) => ({ t: p.t, value: p.pp }));
    const end = last > first ? last : Math.max(first + 1, ...points.map((p) => p.t));
    const [y0, y1] = yRange(
      points.map((p) => p.value),
      "pp",
    );
    const domain: Domain = { x0: first, x1: end, y0, y1 };
    const innerH = h - 2 * pad;
    const stroke = { fill: "none", stroke: color, strokeWidth: lineWidth, strokeLinejoin: "round", strokeLinecap: "round" } as const;

    switch (shape) {
      case "line":
        return <path d={linePath(points, domain, w, innerH)} {...stroke} />;
      case "area":
        return (
          <>
            <path d={areaPath(points, domain, w, innerH)} fill={`url(#${gradientId})`} />
            <path d={linePath(points, domain, w, innerH)} {...stroke} />
          </>
        );
      case "step":
        return <path d={stepPath(points, domain, w, innerH)} {...stroke} />;
      case "bars":
        return (
          <>
            {barsOf(bucketMax(points, domain, slicesFor(w)), domain, w, innerH).map((b, i) => (
              <rect key={i} x={b.x} y={b.y} width={b.w} height={b.h} rx={Math.min(2, b.w / 2)} fill={color} />
            ))}
          </>
        );
      case "dots":
        return (
          <>
            {dotsOf(bucketMax(points, domain, slicesFor(w)), domain, w, innerH).map(([x, y], i) => (
              <circle key={i} cx={x} cy={y} r={Math.max(1.5, lineWidth * 0.8)} fill={color} />
            ))}
          </>
        );
    }
  }, [series, first, last, shape, color, lineWidth, w, h, pad, gradientId]);

  const radius = Math.max(Math.min(w, h) / 2 - lineWidth, 1);
  const fraction = live !== null && mapMax > 0 ? live / mapMax : 0;
  const readout = live === null ? null : `${Math.round(live)}pp`;

  return (
    <div className="relative size-full" role="img" aria-label={t(`widget.choice.shape.${shape}`)}>
      <svg viewBox={`0 0 ${w} ${h}`} className="absolute inset-0 size-full overflow-visible" style={{ filter: "drop-shadow(0 0 1px rgb(0 0 0 / 0.5))" }}>
        <defs>
          <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor={color} stopOpacity="0.5" />
            <stop offset="1" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        {shape === "ring" ? (
          <>
            <circle cx={w / 2} cy={h / 2} r={radius} fill="none" stroke="currentColor" strokeOpacity="0.15" strokeWidth={lineWidth} />
            <path d={ringPath(fraction, w / 2, h / 2, radius)} fill="none" stroke={color} strokeWidth={lineWidth} strokeLinecap="round" />
          </>
        ) : (
          <g transform={`translate(0 ${pad})`}>{graph}</g>
        )}
      </svg>
      {showValue && readout !== null && (
        <div
          className={shape === "ring" ? "absolute inset-0 flex items-center justify-center whitespace-nowrap tabular-nums" : "absolute top-0 right-0 leading-none whitespace-nowrap tabular-nums"}
          style={{ fontSize: fontSizeFor(instance, shape === "ring" ? 0.3 : 0.28), fontWeight: 700, color }}
        >
          {readout}
        </div>
      )}
    </div>
  );
}

export const PP_WIDGETS: WidgetDefinition[] = [
  { type: "ppDelta", labelKey: "widget.ppDelta", defaultSize: { w: 280, h: 84 }, Component: PpMaxDelta, options: MAX_DELTA_OPTIONS },
  { type: "ppGraph", labelKey: "widget.ppGraph", defaultSize: { w: 420, h: 140 }, Component: PpGraph, options: SHAPE_OPTIONS },
];
