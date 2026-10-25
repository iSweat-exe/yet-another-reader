import { useEffect, useRef, useState } from "react";
import { type InputDevice, type TrailBar, inputId, keyChoices, keyLabel, pressRate, trailSpans, updateTrail } from "../../lib/state/inputs";
import { useReaderStore } from "../../lib/state/store";
import { subscribeTicker } from "../../overlay/ticker";
import { optionValues } from "../web";
import { fontSizeFor, type BuiltinOption, type WidgetDefinition, type WidgetProps } from "../types";

const KEY_OPTIONS: BuiltinOption[] = [
  {
    key: "device",
    type: "select",
    labelKey: "widget.opt.device",
    default: "keyboard",
    choices: [{ value: "keyboard" }, { value: "mouse" }],
    // The key of one device means nothing on the other: start from that device's first button.
    alsoSet: (device) => ({ key: device === "mouse" ? "Left" : "Z" }),
  },
  {
    key: "key",
    type: "select",
    labelKey: "widget.opt.key",
    default: "Z",
    // Labelled by `keyLabel`, not by translations: the list depends on the device.
    choicesFor: (values) => keyChoices(values.device === "mouse" ? "mouse" : "keyboard", values.key),
  },
  { key: "label", type: "string", labelKey: "widget.opt.label", default: "" },
  { key: "showCount", type: "boolean", labelKey: "widget.opt.showCount", default: false },
  { key: "pressedColor", type: "color", labelKey: "widget.opt.pressedColor", default: "#f472b6" },
  { key: "trail", type: "boolean", labelKey: "widget.opt.trail", default: false },
  {
    key: "trailDirection",
    type: "select",
    labelKey: "widget.opt.trailDirection",
    default: "up",
    choices: [{ value: "up" }, { value: "down" }, { value: "left" }, { value: "right" }],
  },
  { key: "trailDuration", type: "number", labelKey: "widget.opt.trailDuration", default: 1000, min: 200, max: 5000 },
];

/** `#rrggbb` as an `rgb(r g b / alpha)` colour, so a gradient can fade to the same hue (not to black). */
function withAlpha(hex: string, alpha: number): string {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  return m ? `rgb(${parseInt(m[1], 16)} ${parseInt(m[2], 16)} ${parseInt(m[3], 16)} / ${alpha})` : hex;
}

type TrailDirection = "up" | "down" | "left" | "right";

/** Flex direction that puts the cap (last child) on the side the trail starts from. */
const TRAIL_FLEX: Record<TrailDirection, "column" | "column-reverse" | "row" | "row-reverse"> = {
  up: "column",
  down: "column-reverse",
  left: "row",
  right: "row-reverse",
};

/**
 * The history of a key: each press is a bar that leaves the cap and slides away, fading with the
 * distance, until it is gone. Drawn on a canvas that only repaints while there is something to move.
 */
function KeyTrail({ pressed, direction, durationMs, color, width, length }: { pressed: boolean; direction: TrailDirection; durationMs: number; color: string; width: number; length: number }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const bars = useRef<TrailBar[]>([]);
  const stopTicker = useRef<(() => void) | null>(null);
  const vertical = direction === "up" || direction === "down";
  const scale = 2;

  const paint = useRef<() => void>(() => {});
  paint.current = () => {
    const ctx = canvas.current?.getContext("2d");
    if (!ctx || !canvas.current) return;
    const now = performance.now();
    bars.current = updateTrail(bars.current, pressed, now, durationMs);
    const w = canvas.current.width;
    const h = canvas.current.height;
    ctx.clearRect(0, 0, w, h);
    const total = (vertical ? h : w) / scale;
    // The cap sits at the bottom (up), top (down), right (left) or left (right) edge.
    const grad = vertical ? ctx.createLinearGradient(0, direction === "up" ? h : 0, 0, direction === "up" ? 0 : h) : ctx.createLinearGradient(direction === "left" ? w : 0, 0, direction === "left" ? 0 : w, 0);
    grad.addColorStop(0, withAlpha(color, 0.9));
    grad.addColorStop(1, withAlpha(color, 0));
    ctx.fillStyle = grad;
    const inset = (vertical ? w : h) * 0.1;
    for (const { near, far } of trailSpans(bars.current, now, durationMs, total)) {
      const a = near * scale;
      const b = Math.max(far * scale, a + 2);
      const [x, y, bw, bh] =
        direction === "up" ? [inset, h - b, w - 2 * inset, b - a] : direction === "down" ? [inset, a, w - 2 * inset, b - a] : direction === "left" ? [w - b, inset, b - a, h - 2 * inset] : [a, inset, b - a, h - 2 * inset];
      ctx.beginPath();
      ctx.roundRect(x, y, bw, bh, Math.min(bw, bh) * 0.3);
      ctx.fill();
    }
    // Keep animating while a bar is held or still on screen; the next press restarts the loop.
    // The shared ticker is capped at the overlay's fps, unlike a bare requestAnimationFrame.
    if (bars.current.length === 0) {
      stopTicker.current?.();
      stopTicker.current = null;
    }
  };

  useEffect(() => {
    bars.current = updateTrail(bars.current, pressed, performance.now(), durationMs);
    paint.current();
    if (bars.current.length > 0 && !stopTicker.current) stopTicker.current = subscribeTicker(() => paint.current());
  }, [pressed, durationMs]);
  useEffect(
    () => () => {
      stopTicker.current?.();
      stopTicker.current = null;
    },
    [],
  );

  return <canvas ref={canvas} width={Math.round(width * scale)} height={Math.round(length * scale)} style={{ width, height: length, flex: "none" }} />;
}

/**
 * One key or mouse button as a key cap that lights up while it is held. The state comes from the
 * game's own input state, so it follows the player in real time (see `docs/WEBSOCKET.md`, `/inputs/ws`).
 */
function InputKey({ instance }: WidgetProps) {
  const options = optionValues({ options: KEY_OPTIONS }, instance.options);
  const device: InputDevice = options.device === "mouse" ? "mouse" : "keyboard";
  const key = typeof options.key === "string" && options.key.trim() ? options.key.trim() : "Z";
  const pressed = useReaderStore((s) => (device === "mouse" ? s.input.mouse : s.input.keys).includes(key));
  const count = useReaderStore((s) => s.inputStats.counts[inputId(device, key)] ?? 0);
  const caption = typeof options.label === "string" && options.label ? options.label : keyLabel(device, key);
  const showCount = options.showCount === true;
  const color = instance.style?.color ?? "#ffffff";
  const fill = typeof options.pressedColor === "string" ? options.pressedColor : "#f472b6";
  const direction = (["up", "down", "left", "right"] as const).find((d) => d === options.trailDirection) ?? "up";
  const vertical = direction === "up" || direction === "down";
  // The cap keeps its size at the base of the box; the rest of the box is where the trail slides.
  const capLength = Math.min(instance.w, instance.h);
  const trailLength = (vertical ? instance.h : instance.w) - capLength;
  const trailOn = options.trail === true && trailLength > 0;
  // Text and outline follow the cap, not the whole (stretched) box.
  const capBox = trailOn ? { ...instance, h: capLength } : instance;
  const durationMs = typeof options.trailDuration === "number" ? Math.min(5000, Math.max(200, options.trailDuration)) : 1000;

  const cap = (
    <div
      className="flex flex-col items-center justify-center leading-none font-bold"
      style={{
        // No transition: the cap must change on the very frame the key does.
        background: pressed ? fill : "rgb(0 0 0 / 0.35)",
        color: pressed ? "#111111" : color,
        boxShadow: `inset 0 0 0 ${Math.max(2, capBox.h * 0.04)}px ${pressed ? fill : color}`,
        borderRadius: Math.min(instance.w, instance.h) * 0.18,
        fontSize: fontSizeFor(capBox, showCount ? 0.34 : 0.42),
        ...(trailOn ? (vertical ? { width: "100%", height: capLength, flex: "none" } : { height: "100%", width: capLength, flex: "none" }) : { width: "100%", height: "100%" }),
      }}
    >
      <span className="max-w-full truncate px-1">{caption}</span>
      {showCount && (
        <span className="tabular-nums" style={{ fontSize: "0.62em", marginTop: "0.25em", opacity: 0.8 }}>
          {count}
        </span>
      )}
    </div>
  );

  if (!trailOn) return cap;
  return (
    <div className="flex size-full" style={{ flexDirection: TRAIL_FLEX[direction] }}>
      <KeyTrail pressed={pressed} direction={direction} durationMs={durationMs} color={fill} width={vertical ? instance.w : trailLength} length={vertical ? trailLength : instance.h} />
      {cap}
    </div>
  );
}

/** Key presses per second over the last second, from every key and mouse button. */
function Kps({ instance }: WidgetProps) {
  const stats = useReaderStore((s) => s.inputStats);
  const latest = useRef(stats);
  latest.current = stats;
  // The rate falls back to zero when nothing is pressed, so it is re-evaluated on a clock; only
  // a change of the displayed integer renders (an idle widget costs nothing).
  const [rate, setRate] = useState(() => Math.round(pressRate(stats, performance.now())));
  useEffect(() => {
    const id = setInterval(() => setRate(Math.round(pressRate(latest.current, performance.now()))), 100);
    return () => clearInterval(id);
  }, []);
  return (
    <div className="leading-none whitespace-nowrap tabular-nums" style={{ fontSize: fontSizeFor(instance, 0.7), fontWeight: 700 }}>
      {rate}
      <span style={{ fontSize: "0.55em", opacity: 0.75 }}> KPS</span>
    </div>
  );
}

export const INPUT_WIDGETS: WidgetDefinition[] = [
  { type: "inputKey", labelKey: "widget.inputKey", defaultSize: { w: 96, h: 96 }, Component: InputKey, options: KEY_OPTIONS },
  { type: "kps", labelKey: "widget.kps", defaultSize: { w: 160, h: 44 }, Component: Kps },
];
