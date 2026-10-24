/**
 * Overlay layout document (version 2), persisted by the Rust side as JSON.
 *
 * Positions are *anchored*: a widget is attached to one of nine points of the screen (a corner,
 * an edge's middle or the centre) so a layout keeps its meaning on any aspect ratio. Sizes and
 * offsets are in "layout pixels": the layout is designed for a screen `referenceHeight` pixels
 * tall (1080) and scaled to the real window by height.
 */

import { type Page, PAGES, PLAY_PAGES, isPage } from "./pages";

export type Anchor = "top-left" | "top" | "top-right" | "left" | "center" | "right" | "bottom-left" | "bottom" | "bottom-right";

export const ANCHORS: readonly Anchor[] = ["top-left", "top", "top-right", "left", "center", "right", "bottom-left", "bottom", "bottom-right"];

export interface WidgetStyle {
  /** CSS colour of the text / bars. */
  color?: string;
  /** Multiplier applied to the widget's base font size. */
  scale?: number;
  opacity?: number;
  /** Text alignment. Left out = automatic: it follows the widget's anchor (see {@link alignFromAnchor}). */
  align?: "left" | "center" | "right";
  /** Count numbers up/down to their new value (default `true`). */
  animate?: boolean;
  /** Length of that animation in milliseconds (default `250`). */
  animationMs?: number;
  /** Typeface: `default`, a built-in one (`system`, `serif`, `mono`, `rounded`, `condensed`, `handwriting`) or `custom:<id>` of an imported font. */
  font?: string;
  /** Weight of all the text of the widget, 100 to 900 (left out: each widget keeps its own). */
  weight?: number;
  /** Letter spacing in hundredths of an em, -10 to 50 (default 0). */
  tracking?: number;
  /** Shadow behind the text: `auto` (the default legibility shadow), `none`, `soft`, `strong` or `glow`. */
  shadow?: "auto" | "none" | "soft" | "strong" | "glow";
  /** Colour of that shadow (the glow takes the text colour when it is left out). */
  shadowColor?: string;
  /** Width of the text outline in pixels, 0 to 8 (default 0), and its colour (default black). */
  outline?: number;
  outlineColor?: string;
}

export interface WidgetInstance {
  id: string;
  /** Built-in widget type, or `web` for a community widget. */
  type: string;
  /** For `web` widgets: the folder name of the widget. */
  widget?: string;
  /** For `web` widgets: values of the manifest's options. */
  options?: Record<string, unknown>;
  /** Optional label shown in the editor. */
  name?: string;
  anchor: Anchor;
  /**
   * `true` when the anchor was chosen by hand and must not follow the widget's position.
   * Otherwise (the default) the editor picks the anchor from where the widget sits.
   */
  anchorLocked?: boolean;
  /**
   * Distance from the anchor. Along an axis anchored to an edge it is the margin from that edge
   * (inward); along a centred axis it is an offset from the centre (positive = right/down).
   */
  x: number;
  y: number;
  w: number;
  h: number;
  /**
   * Rotation in degrees, clockwise, around the centre of the widget's rectangle (default 0, left out when 0).
   * Only the drawing is turned: x/y/w/h, the anchor and the snapping rectangle stay those of the unrotated box.
   * Normalised to (-180, 180] by {@link normalizeRotation}.
   */
  rotation?: number;
  /** Pages of the game this widget is drawn on (see `pages.ts`). */
  pages: Page[];
  style?: WidgetStyle;
  /** Editor only: the widget cannot be moved. */
  locked?: boolean;
  /** Editor only: id of the group the widget belongs to. A group is selected and moved as one object. */
  group?: string;
}

export interface Layout {
  version: 2;
  name: string;
  /** Height the layout is designed for; the window is scaled to match it. */
  referenceHeight: number;
  widgets: WidgetInstance[];
}

export const REFERENCE_HEIGHT = 1080;

export interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** Horizontal and vertical anchor positions as fractions of the screen (0, 0.5 or 1). */
export function anchorFractions(anchor: Anchor): [number, number] {
  const horizontal = anchor.endsWith("left") || anchor === "left" ? 0 : anchor.endsWith("right") || anchor === "right" ? 1 : 0.5;
  const vertical = anchor.startsWith("top") ? 0 : anchor.startsWith("bottom") ? 1 : 0.5;
  return [horizontal, vertical];
}

/** Position of one axis: `fraction` 0 = from the start edge, 1 = from the end edge, 0.5 = centred. */
function axisStart(fraction: number, offset: number, size: number, viewSize: number): number {
  if (fraction === 0) return offset;
  if (fraction === 1) return viewSize - size - offset;
  return (viewSize - size) / 2 + offset;
}

/** Inverse of {@link axisStart}: the offset that places a box at `start`. */
function axisOffset(fraction: number, start: number, size: number, viewSize: number): number {
  if (fraction === 0) return start;
  if (fraction === 1) return viewSize - size - start;
  return start - (viewSize - size) / 2;
}

/** A rotation in degrees wrapped to (-180, 180], rounded to 0.01; anything that is not a finite number is 0. */
export function normalizeRotation(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  let a = value % 360;
  if (a > 180) a -= 360;
  else if (a <= -180) a += 360;
  return Math.round(a * 100) / 100 || 0;
}

/** Where a widget is, in layout pixels, on a screen `viewWidth` x `viewHeight` layout pixels big. */
export function resolveRect(widget: WidgetInstance, viewWidth: number, viewHeight: number): Rect {
  const [fx, fy] = anchorFractions(widget.anchor);
  return {
    left: axisStart(fx, widget.x, widget.w, viewWidth),
    top: axisStart(fy, widget.y, widget.h, viewHeight),
    width: widget.w,
    height: widget.h,
  };
}

/** The widget moved so that its top-left corner is at (`left`, `top`), keeping its anchor. */
export function withPosition(widget: WidgetInstance, left: number, top: number, viewWidth: number, viewHeight: number): WidgetInstance {
  const [fx, fy] = anchorFractions(widget.anchor);
  return {
    ...widget,
    x: Math.round(axisOffset(fx, left, widget.w, viewWidth)),
    y: Math.round(axisOffset(fy, top, widget.h, viewHeight)),
  };
}

/** The widget with a new rectangle (position and size), keeping its anchor. */
export function withRect(widget: WidgetInstance, rect: Rect, viewWidth: number, viewHeight: number): WidgetInstance {
  return withPosition({ ...widget, w: Math.round(rect.width), h: Math.round(rect.height) }, rect.left, rect.top, viewWidth, viewHeight);
}

/** Re-anchors a widget without moving it on screen. */
export function withAnchor(widget: WidgetInstance, anchor: Anchor, viewWidth: number, viewHeight: number): WidgetInstance {
  const rect = resolveRect(widget, viewWidth, viewHeight);
  return withPosition({ ...widget, anchor }, rect.left, rect.top, viewWidth, viewHeight);
}

/** The anchor whose region of the screen contains the centre of `rect` (used when adding/dragging). */
export function nearestAnchor(rect: Rect, viewWidth: number, viewHeight: number): Anchor {
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  const col = cx < viewWidth / 3 ? "left" : cx > (viewWidth * 2) / 3 ? "right" : "center";
  const row = cy < viewHeight / 3 ? "top" : cy > (viewHeight * 2) / 3 ? "bottom" : "middle";
  if (row === "middle") return col === "center" ? "center" : col;
  if (col === "center") return row;
  return `${row}-${col}` as Anchor;
}

/** The anchor whose region of the screen contains the centre of the widget as it is now. */
export function anchorForPosition(widget: WidgetInstance, viewWidth: number, viewHeight: number): Anchor {
  return nearestAnchor(resolveRect(widget, viewWidth, viewHeight), viewWidth, viewHeight);
}

/**
 * Re-anchors a widget to where it sits (without moving it on screen), unless its anchor was
 * chosen by hand. A widget near the right edge ends up right-anchored, so it stays on that edge
 * on wider screens.
 */
export function withAutoAnchor(widget: WidgetInstance, viewWidth: number, viewHeight: number): WidgetInstance {
  if (widget.anchorLocked) return widget;
  const anchor = anchorForPosition(widget, viewWidth, viewHeight);
  return anchor === widget.anchor ? widget : withAnchor(widget, anchor, viewWidth, viewHeight);
}

/** Text alignment that suits an anchor: text hugs the edge the widget is attached to. */
export function alignFromAnchor(anchor: Anchor): "left" | "center" | "right" {
  const [horizontal] = anchorFractions(anchor);
  return horizontal === 0 ? "left" : horizontal === 1 ? "right" : "center";
}

// --- Validation / migration -----------------------------------------------------------------

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const num = (v: unknown, fallback: number) => (typeof v === "number" && Number.isFinite(v) ? v : fallback);

/** `pages`, or what the older `visibleWhen` meant: "always" = every page, anything else = a play. */
function migratePages(raw: Record<string, unknown>): Page[] {
  if (Array.isArray(raw.pages)) return PAGES.filter((p) => (raw.pages as unknown[]).includes(p) && isPage(p));
  return raw.visibleWhen === "always" ? [...PAGES] : [...PLAY_PAGES];
}

function migrateWidget(raw: unknown, index: number): WidgetInstance | null {
  if (!isObject(raw) || typeof raw.type !== "string") return null;
  const anchor = ANCHORS.includes(raw.anchor as Anchor) ? (raw.anchor as Anchor) : "top-left";
  const widget: WidgetInstance = {
    id: typeof raw.id === "string" && raw.id ? raw.id : `${raw.type}-${index}`,
    type: raw.type,
    anchor,
    x: num(raw.x, 0),
    y: num(raw.y, 0),
    w: Math.max(1, num(raw.w, 200)),
    h: Math.max(1, num(raw.h, 60)),
    pages: migratePages(raw),
  };
  if (typeof raw.widget === "string") widget.widget = raw.widget;
  if (isObject(raw.options)) widget.options = raw.options;
  if (typeof raw.name === "string") widget.name = raw.name;
  if (raw.anchorLocked === true) widget.anchorLocked = true;
  const rotation = normalizeRotation(raw.rotation);
  if (rotation !== 0) widget.rotation = rotation;
  if (isObject(raw.style)) widget.style = raw.style as WidgetStyle;
  if (raw.locked === true) widget.locked = true;
  if (typeof raw.group === "string" && raw.group) widget.group = raw.group;
  return widget;
}

/**
 * Turns any stored layout into the current format. Version 1 layouts (absolute positions on a
 * 1920x1080 screen) become top-left anchored widgets. Unknown/invalid documents give `null`.
 */
export function migrateLayout(raw: unknown, fallbackName = "default"): Layout | null {
  if (!isObject(raw) || !Array.isArray(raw.widgets) || (raw.version !== 1 && raw.version !== 2)) return null;
  const widgets = raw.widgets.map(migrateWidget).filter((w): w is WidgetInstance => w !== null);
  // Widget ids must be unique: later duplicates get a suffix.
  const seen = new Set<string>();
  for (const w of widgets) {
    let id = w.id;
    for (let n = 2; seen.has(id); n++) id = `${w.id}-${n}`;
    w.id = id;
    seen.add(id);
  }
  return {
    version: 2,
    name: typeof raw.name === "string" && raw.name ? raw.name : fallbackName,
    referenceHeight: raw.version === 2 ? num(raw.referenceHeight, REFERENCE_HEIGHT) : REFERENCE_HEIGHT,
    widgets: withoutLoneGroups(widgets),
  };
}

/** Ids of the widgets that share a group with any of `ids` (restricted to `page` when given), `ids` included. */
export function expandGroups(widgets: readonly WidgetInstance[], ids: readonly string[], page?: Page): string[] {
  const groups = new Set(widgets.filter((w) => ids.includes(w.id) && w.group).map((w) => w.group));
  const members = widgets.filter((w) => w.group && groups.has(w.group) && (!page || w.pages.includes(page))).map((w) => w.id);
  return [...new Set([...ids, ...members])];
}

/** The widgets with every group of a single widget released: that is not a group. */
export function withoutLoneGroups(widgets: WidgetInstance[]): WidgetInstance[] {
  const size = new Map<string, number>();
  for (const w of widgets) if (w.group) size.set(w.group, (size.get(w.group) ?? 0) + 1);
  return widgets.map((w) => {
    if (!w.group || (size.get(w.group) ?? 0) >= 2) return w;
    const { group: _released, ...rest } = w;
    return rest;
  });
}

/** `group-N` with the smallest N no widget uses yet. */
export function newGroupId(widgets: readonly WidgetInstance[]): string {
  const used = new Set(widgets.map((w) => w.group));
  for (let n = 1; ; n++) if (!used.has(`group-${n}`)) return `group-${n}`;
}

export function isLayout(value: unknown): value is Layout {
  return migrateLayout(value) !== null;
}

// --- Presets --------------------------------------------------------------------------------

const white = { color: "#ffffff" } satisfies WidgetStyle;
const pink = "#f472b6";

type Placed = Omit<WidgetInstance, "id" | "anchor"> & { id: string; anchor: Anchor };

function layoutOf(name: string, widgets: Placed[]): Layout {
  return { version: 2, name, referenceHeight: REFERENCE_HEIGHT, widgets };
}

/** The classic layout: stats around the screen's edges, everything shown during a play. */
export function classicLayout(name = "default"): Layout {
  return layoutOf(name, [
    { id: "health", pages: [...PLAY_PAGES], type: "health", anchor: "top-left", x: 30, y: 28, w: 620, h: 14, style: { color: "#34d399" } },
    { id: "map", pages: [...PLAY_PAGES], type: "beatmapInfo", anchor: "top-left", x: 30, y: 56, w: 760, h: 80, style: white },
    { id: "mods", pages: [...PLAY_PAGES], type: "mods", anchor: "top-left", x: 30, y: 144, w: 400, h: 40, style: white },
    { id: "score", pages: [...PLAY_PAGES], type: "score", anchor: "top-right", x: 30, y: 24, w: 500, h: 84, style: white },
    { id: "accuracy", pages: [...PLAY_PAGES], type: "accuracy", anchor: "top-right", x: 30, y: 112, w: 300, h: 48, style: white },
    { id: "pp", pages: [...PLAY_PAGES], type: "pp", anchor: "top-right", x: 30, y: 160, w: 300, h: 56, style: { color: pink } },
    { id: "ppFc", pages: [...PLAY_PAGES], type: "ppFc", anchor: "top-right", x: 30, y: 220, w: 300, h: 30, style: { ...white, opacity: 0.8 } },
    { id: "ppSs", pages: [...PLAY_PAGES], type: "ppSs", anchor: "top-right", x: 30, y: 254, w: 300, h: 30, style: { ...white, opacity: 0.8 } },
    { id: "ur", pages: [...PLAY_PAGES], type: "ur", anchor: "top-right", x: 30, y: 290, w: 200, h: 36, style: white },
    { id: "combo", pages: [...PLAY_PAGES], type: "combo", anchor: "bottom-left", x: 30, y: 40, w: 360, h: 110, style: white },
    { id: "hits", pages: [...PLAY_PAGES], type: "hitCounts", anchor: "bottom-right", x: 30, y: 40, w: 400, h: 80, style: white },
    { id: "errors", pages: [...PLAY_PAGES], type: "hitErrors", anchor: "bottom", x: 0, y: 34, w: 500, h: 36, style: white },
    { id: "progress", pages: [...PLAY_PAGES], type: "progress", anchor: "bottom", x: 0, y: 14, w: 1860, h: 6, style: { color: pink } },
  ]);
}

/** A discreet layout: score, combo, accuracy and health only. */
export function minimalLayout(name = "minimal"): Layout {
  return layoutOf(name, [
    { id: "health", pages: [...PLAY_PAGES], type: "health", anchor: "top", x: 0, y: 20, w: 700, h: 8, style: { color: "#34d399", opacity: 0.9 } },
    { id: "score", pages: [...PLAY_PAGES], type: "score", anchor: "top-right", x: 30, y: 20, w: 360, h: 56, style: white },
    { id: "accuracy", pages: [...PLAY_PAGES], type: "accuracy", anchor: "top-right", x: 30, y: 82, w: 220, h: 34, style: { ...white, opacity: 0.85 } },
    { id: "combo", pages: [...PLAY_PAGES], type: "combo", anchor: "bottom-left", x: 30, y: 30, w: 260, h: 80, style: white },
  ]);
}

/** The difficulty graph hangs from the top edge (reversed), with the timer, the PP and the map's title under it. */
export function topGraphLayout(name = "top graph"): Layout {
  return layoutOf(name, [
    { id: "graph", pages: [...PLAY_PAGES], type: "difficultyGraph", options: { reverse: true, style: "area", height: 70 }, anchor: "top", x: 0, y: 0, w: 1920, h: 90, style: { color: pink, opacity: 0.9 } },
    { id: "timer", pages: [...PLAY_PAGES], type: "timer", anchor: "top-left", x: 30, y: 100, w: 200, h: 36, style: white },
    { id: "pp", pages: [...PLAY_PAGES], type: "pp", anchor: "top-right", x: 30, y: 100, w: 240, h: 46, style: { color: pink } },
    { id: "map", pages: [...PLAY_PAGES], type: "beatmapInfo", anchor: "bottom-left", x: 30, y: 30, w: 760, h: 80, style: white },
    { id: "mods", pages: [...PLAY_PAGES], type: "mods", anchor: "bottom-left", x: 30, y: 118, w: 400, h: 40, style: white },
    { id: "score", pages: [...PLAY_PAGES], type: "score", anchor: "bottom-right", x: 30, y: 70, w: 460, h: 72, style: white },
    { id: "accuracy", pages: [...PLAY_PAGES], type: "accuracy", anchor: "bottom-right", x: 30, y: 30, w: 260, h: 40, style: white },
    { id: "combo", pages: [...PLAY_PAGES], type: "combo", anchor: "bottom", x: 0, y: 120, w: 300, h: 100, style: white },
    { id: "health", pages: [...PLAY_PAGES], type: "health", anchor: "bottom", x: 0, y: 12, w: 900, h: 10, style: { color: "#34d399" } },
  ]);
}

/** Streamer layout: the keys at the bottom with their trails, KPS, and the PP split into its four figures. */
export function inputsLayout(name = "inputs"): Layout {
  const keys = ["Z", "X"].map((key, i): Placed => ({
    id: `key-${key.toLowerCase()}`,
    pages: [...PLAY_PAGES],
    type: "inputKey",
    options: { key, trail: true, trailDirection: "up", showCount: true },
    anchor: "bottom-right",
    x: 30 + (1 - i) * 112,
    y: 30,
    w: 96,
    h: 300,
    style: white,
  }));
  return layoutOf(name, [
    ...keys,
    { id: "kps", pages: [...PLAY_PAGES], type: "kps", anchor: "bottom-right", x: 30, y: 340, w: 208, h: 44, style: white },
    { id: "score", pages: [...PLAY_PAGES], type: "score", anchor: "top-right", x: 30, y: 24, w: 460, h: 76, style: white },
    { id: "accuracy", pages: [...PLAY_PAGES], type: "accuracy", anchor: "top-right", x: 30, y: 104, w: 260, h: 44, style: white },
    { id: "pp", pages: [...PLAY_PAGES], type: "pp", anchor: "top-right", x: 30, y: 152, w: 260, h: 50, style: { color: pink } },
    { id: "ppFc", pages: [...PLAY_PAGES], type: "ppFc", anchor: "top-right", x: 30, y: 206, w: 260, h: 30, style: { ...white, opacity: 0.8 } },
    { id: "ppSs", pages: [...PLAY_PAGES], type: "ppSs", anchor: "top-right", x: 30, y: 240, w: 260, h: 30, style: { ...white, opacity: 0.8 } },
    { id: "ppMax", pages: [...PLAY_PAGES], type: "ppMax", anchor: "top-right", x: 30, y: 274, w: 260, h: 30, style: { ...white, opacity: 0.8 } },
    { id: "combo", pages: [...PLAY_PAGES], type: "combo", anchor: "bottom-left", x: 30, y: 40, w: 320, h: 100, style: white },
    { id: "health", pages: [...PLAY_PAGES], type: "health", anchor: "top-left", x: 30, y: 28, w: 620, h: 12, style: { color: "#34d399" } },
  ]);
}

/** A thin layout for readability: the progress line and the numbers that matter, nothing else. */
export function focusLayout(name = "focus"): Layout {
  return layoutOf(name, [
    { id: "progress", pages: [...PLAY_PAGES], type: "progress", anchor: "top", x: 0, y: 0, w: 1920, h: 4, style: { color: pink } },
    { id: "score", pages: [...PLAY_PAGES], type: "score", anchor: "top-left", x: 30, y: 20, w: 360, h: 56, style: white },
    { id: "pp", pages: [...PLAY_PAGES], type: "pp", anchor: "top-right", x: 30, y: 20, w: 220, h: 44, style: { color: pink } },
    { id: "accuracy", pages: [...PLAY_PAGES], type: "accuracy", anchor: "top-right", x: 30, y: 70, w: 220, h: 34, style: { ...white, opacity: 0.85 } },
    { id: "combo", pages: [...PLAY_PAGES], type: "combo", anchor: "bottom-left", x: 30, y: 30, w: 260, h: 80, style: white },
    { id: "errors", pages: [...PLAY_PAGES], type: "hitErrors", anchor: "bottom", x: 0, y: 24, w: 500, h: 30, style: white },
  ]);
}

export const EMPTY_LAYOUT = (name: string): Layout => layoutOf(name, []);

export type PresetId = "classic" | "minimal" | "topGraph" | "inputs" | "focus" | "empty";

/** Every preset the editor offers, in picker order. */
export const PRESETS: readonly PresetId[] = ["classic", "minimal", "topGraph", "inputs", "focus", "empty"];

export function presetLayout(preset: PresetId, name: string): Layout {
  switch (preset) {
    case "classic":
      return classicLayout(name);
    case "minimal":
      return minimalLayout(name);
    case "topGraph":
      return topGraphLayout(name);
    case "inputs":
      return inputsLayout(name);
    case "focus":
      return focusLayout(name);
    default:
      return EMPTY_LAYOUT(name);
  }
}

/** A widget id not used yet in `layout`, based on `base`. */
export function uniqueId(layout: Layout, base: string): string {
  const used = new Set(layout.widgets.map((w) => w.id));
  if (!used.has(base)) return base;
  for (let n = 2; ; n++) {
    const id = `${base}-${n}`;
    if (!used.has(id)) return id;
  }
}
