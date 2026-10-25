import { useEffect, useMemo, useRef } from "react";
import { Icon } from "../../components/icons/Icon";
import { useReaderStore } from "../../lib/state/store";
import { barRadius, barRects, curvePoints, MAX_POINTS, MIN_POINTS, monotoneSegments, playedFraction, resample } from "../graphs/graphGeometry";
import { prefersReducedMotion } from "../shared";
import { animationMsFor, fontSizeFor, type BuiltinOption, type WidgetDefinition, type WidgetProps } from "../types";
import { optionValues } from "../web";

const STYLES = ["bars", "curve", "line", "area", "points"] as const;
type GraphStyle = (typeof STYLES)[number];

interface Look {
  style: GraphStyle;
  color: string;
  heightPct: number;
  round: number;
  count: number;
  smooth: number;
  lineWidth: number;
  fill: boolean;
  fillOpacity: number;
}

const OPTIONS: BuiltinOption[] = [
  { key: "style", type: "select", labelKey: "widget.opt.graphStyle", default: "bars", choices: STYLES.map((value) => ({ value })) },
  { key: "count", type: "number", labelKey: "widget.opt.graphCount", default: 120, min: MIN_POINTS, max: MAX_POINTS },
  { key: "color", type: "color", labelKey: "widget.opt.graphColor", default: "#f472b6" },
  { key: "height", type: "number", labelKey: "widget.opt.graphHeight", default: 100, min: 20, max: 100 },
  { key: "round", type: "number", labelKey: "widget.opt.barRound", default: 50, min: 0, max: 100 },
  { key: "smooth", type: "number", labelKey: "widget.opt.graphSmooth", default: 60, min: 0, max: 100 },
  { key: "lineWidth", type: "number", labelKey: "widget.opt.graphLineWidth", default: 2, min: 1, max: 8 },
  { key: "fill", type: "boolean", labelKey: "widget.opt.graphFill", default: true },
  { key: "fillOpacity", type: "number", labelKey: "widget.opt.graphFillOpacity", default: 45, min: 5, max: 100 },
  { key: "reverse", type: "boolean", labelKey: "widget.opt.graphReverse", default: false },
  { key: "showValue", type: "boolean", labelKey: "widget.opt.showOverall", default: false },
];

const num = (v: unknown, fallback: number, min: number, max: number) => (typeof v === "number" && Number.isFinite(v) ? Math.min(Math.max(v, min), max) : fallback);

function readLook(options: Record<string, unknown>): Look {
  return {
    style: STYLES.includes(options.style as GraphStyle) ? (options.style as GraphStyle) : "bars",
    color: typeof options.color === "string" ? options.color : "#f472b6",
    heightPct: num(options.height, 100, 20, 100),
    round: num(options.round, 50, 0, 100),
    count: Math.round(num(options.count, 120, MIN_POINTS, MAX_POINTS)),
    smooth: num(options.smooth, 60, 0, 100),
    lineWidth: num(options.lineWidth, 2, 1, 8),
    fill: options.fill !== false,
    fillOpacity: num(options.fillOpacity, 45, 5, 100),
  };
}

/** The bars drawn when no graph is available (computing, file missing): a flat, faint skyline. */
const PLACEHOLDER: readonly number[] = Array.from({ length: 60 }, () => 0);

function paint(canvas: HTMLCanvasElement, values: readonly number[], look: Look) {
  const dpr = window.devicePixelRatio || 1;
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  if (width <= 0 || height <= 0) return;
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = look.color;
  ctx.strokeStyle = look.color;
  // The graph keeps its height share at the bottom of the box.
  const area = height * (look.heightPct / 100);
  ctx.translate(0, height - area);

  if (look.style === "bars") {
    ctx.beginPath();
    for (const r of barRects(values, width, area)) {
      const radius = barRadius(r, look.round);
      if (radius > 0 && typeof ctx.roundRect === "function") ctx.roundRect(r.x, r.y, r.w, r.h, radius);
      else ctx.rect(r.x, r.y, r.w, r.h);
    }
    ctx.fill();
    return;
  }

  const pts = curvePoints(values, width, area, look.lineWidth / 2 + 0.5);
  if (pts.length === 0) return;
  if (look.style === "points") {
    ctx.beginPath();
    const radius = Math.max(look.lineWidth * 0.75, 1);
    for (const p of pts) {
      ctx.moveTo(p.x + radius, p.y);
      ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
    }
    ctx.fill();
    return;
  }
  const segments = monotoneSegments(pts, look.smooth / 100);
  const trace = () => {
    ctx.moveTo(pts[0].x, pts[0].y);
    for (const s of segments) ctx.bezierCurveTo(s.c1.x, s.c1.y, s.c2.x, s.c2.y, s.to.x, s.to.y);
  };
  // `area` always fills; `curve` fills when asked; `line` never does.
  if (look.style === "area" || (look.style === "curve" && look.fill)) {
    const last = pts[pts.length - 1];
    ctx.beginPath();
    trace();
    ctx.lineTo(last.x, area);
    ctx.lineTo(pts[0].x, area);
    ctx.closePath();
    const gradient = ctx.createLinearGradient(0, 0, 0, area);
    gradient.addColorStop(0, look.color);
    gradient.addColorStop(1, `${look.color}00`);
    ctx.globalAlpha = look.fillOpacity / 100;
    ctx.fillStyle = /^#[0-9a-f]{6}$/i.test(look.color) ? gradient : look.color;
    ctx.fill();
    ctx.globalAlpha = 1;
  }
  if (look.style !== "area") {
    ctx.beginPath();
    trace();
    ctx.lineWidth = look.lineWidth;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.stroke();
  }
}

/**
 * The beatmap's strain over its length: a bar per slice, low where the map is calm and high where
 * it is hard, relative to the map's own hardest section. Two canvases hold the same bars (faint
 * for what is to come, full for what has played); the song position only moves a clip and the
 * cursor through refs, so following the song never re-renders React.
 */
function DifficultyGraph({ instance }: WidgetProps) {
  const options = optionValues({ options: OPTIONS }, instance.options);
  const look = readLook(options);
  const { color } = look;
  const lookKey = JSON.stringify(look);
  const showValue = options.showValue === true;
  // Flipped upside down (bars hang from the top edge) to sit along the top of the screen.
  const flip = options.reverse === true ? "scaleY(-1)" : undefined;

  const graph = useReaderStore((s) => s.game.difficultyGraph);
  const overall = useReaderStore((s) => s.game.difficultyGraph?.overall ?? s.game.difficulty?.stars ?? null);
  const source = graph?.buckets ?? PLACEHOLDER;
  // Resampled in the front only: the data always has the same buckets, whatever the option.
  const values = useMemo(() => (source === PLACEHOLDER ? source : resample(source, look.count)), [source, look.count]);
  const duration = graph?.durationMs ?? 0;

  const root = useRef<HTMLDivElement>(null);
  const dim = useRef<HTMLCanvasElement>(null);
  const lit = useRef<HTMLCanvasElement>(null);
  const played = useRef<HTMLDivElement>(null);
  const cursor = useRef<HTMLDivElement>(null);

  // Redraw only when the bars or the look change, or the box is resized.
  useEffect(() => {
    const draw = () => {
      const current: Look = JSON.parse(lookKey);
      if (dim.current) paint(dim.current, values, current);
      if (lit.current) paint(lit.current, values, current);
    };
    draw();
    const box = root.current;
    if (!box || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(draw);
    observer.observe(box);
    return () => observer.disconnect();
  }, [values, lookKey]);

  // Follow the song clock straight from the store, outside React's render cycle.
  useEffect(() => {
    const move = (currentMs: number | null | undefined) => {
      const fraction = graph ? playedFraction(currentMs, duration) : 0;
      if (played.current) played.current.style.clipPath = `inset(0 ${(1 - fraction) * 100}% 0 0)`;
      if (cursor.current) {
        cursor.current.style.transform = `translateX(${fraction * (root.current?.clientWidth ?? 0)}px)`;
        cursor.current.style.opacity = graph ? "1" : "0";
      }
    };
    move(useReaderStore.getState().game.time?.currentMs);
    return useReaderStore.subscribe((s, prev) => {
      const now = s.game.time?.currentMs;
      if (now !== prev.game.time?.currentMs) move(now);
    });
  }, [graph, duration]);

  const glide = animationMsFor(instance) > 0 && !prefersReducedMotion();
  // The song moves at a constant rate: a linear glide just fills the gap between two updates.
  const clipTransition = glide ? "clip-path 120ms linear" : "none";
  const cursorTransition = glide ? "transform 120ms linear, opacity 200ms ease-out" : "none";

  return (
    <div ref={root} className="relative size-full" style={{ color }}>
      <div className="absolute inset-0" style={{ transform: flip }}>
        <canvas ref={dim} className="absolute inset-0 size-full" style={{ opacity: graph ? 0.3 : 0.15 }} />
        <div ref={played} className="absolute inset-0" style={{ clipPath: "inset(0 100% 0 0)", transition: clipTransition }}>
          <canvas ref={lit} className="size-full" />
        </div>
      </div>
      <div ref={cursor} className="absolute inset-y-0 left-0 w-px" style={{ background: "currentColor", opacity: 0, transition: cursorTransition, willChange: "transform" }} />
      {showValue && overall !== null && (
        <div className="absolute left-0 top-0 flex items-center gap-1 font-semibold tabular-nums leading-none text-white" style={{ fontSize: fontSizeFor(instance, 0.22), textShadow: "0 1px 2px rgb(0 0 0 / 0.6)" }}>
          {overall.toFixed(2)}
          <Icon name="star" className="size-[0.9em]" />
        </div>
      )}
    </div>
  );
}

export const DIFFICULTY_GRAPH_WIDGETS: WidgetDefinition[] = [
  { type: "difficultyGraph", labelKey: "widget.difficultyGraph", defaultSize: { w: 720, h: 90 }, Component: DifficultyGraph, options: OPTIONS },
];
