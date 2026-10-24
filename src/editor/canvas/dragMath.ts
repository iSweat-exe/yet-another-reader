import type { Page } from "../../overlay/model/pages";
import { type Layout, type Rect, resolveRect, withPosition, withRect } from "../../overlay/model/layout";
import { type GapMark, type Guide, type Handle, type Point, angleBetween, boundingBox, rectCenter, resizeRotatedBox, rotateAround, rotatedBounds, rotatedIntersects, snapAngle, snapMove, snapResize } from "./geometry";

/** Smallest a widget can be resized to, in layout pixels. */
export const MIN_SIZE = 8;

/** A pointer gesture on the canvas, from the press to the release. */
export interface Drag {
  kind: "move" | "resize" | "marquee" | "rotate";
  startX: number;
  startY: number;
  /** Layout at the start of the gesture (positions are always recomputed from it). */
  base: Layout;
  ids: string[];
  handle?: Handle;
  additive?: boolean;
  /** Pointer position on screen at the start; a move or resize only begins once it has travelled `START_PX`. */
  clientX: number;
  clientY: number;
  started: boolean;
  pointerId: number;
  /** Rotation: the point turned around (layout pixels) and the pointer's angle around it at the start. */
  pivot?: Point;
  startAngle?: number;
  /** Element holding the pointer capture. */
  target?: HTMLElement;
  /** A plain click (no travel) on a widget of a multi-selection narrows the selection to it, like on release in any editor. */
  collapseTo?: string[];
}

/** What the pointer is doing right now, in the units `computeDrag` needs. */
export interface DragInput {
  /** Pointer in layout pixels (whole), and without truncation (angles need the precision). */
  pointer: Point;
  pointerExact: Point;
  shift: boolean;
  alt: boolean;
  /** Snapping is on (the Alt key still turns it off for the gesture). */
  snap: boolean;
  /** Grid spacing in layout pixels while the grid is shown (moves also snap to its lines), `0` when it is not. */
  grid: number;
  /** Snap distance in layout pixels. */
  threshold: number;
  page: Page;
  viewWidth: number;
  viewHeight: number;
}

/** What a step of a gesture changes. A missing field means "leave it as it is". */
export interface DragResult {
  /** The document as the gesture has it so far. */
  doc?: Layout;
  guides?: Guide[];
  /** Spacing markers while a move snaps to an equal gap. */
  gaps?: GapMark[];
  /** Marquee: its box and the widgets it covers. */
  marquee?: Rect;
  hit?: string[];
  /** Rotation of several widgets: the frame drawn around them, turned by `angle`. */
  frame?: { rect: Rect; angle: number };
}

/**
 * The effect of moving the pointer to `input` during the gesture `d`. Pure: positions are always recomputed
 * from the layout at the start of the gesture, so a step never depends on the previous one.
 */
export function computeDrag(d: Drag, input: DragInput): DragResult {
  const { pointer: p, viewWidth, viewHeight } = input;
  const dx = p.x - d.startX;
  const dy = p.y - d.startY;
  const baseWidgets = d.base.widgets.filter((w) => w.pages.includes(input.page));
  const baseRects = new Map(baseWidgets.map((w) => [w.id, resolveRect(w, viewWidth, viewHeight)]));
  const baseBounds = new Map(baseWidgets.map((w) => [w.id, rotatedBounds(baseRects.get(w.id) as Rect, w.rotation ?? 0)]));

  if (d.kind === "marquee") {
    const box: Rect = { left: Math.min(d.startX, p.x), top: Math.min(d.startY, p.y), width: Math.abs(dx), height: Math.abs(dy) };
    // A locked widget is never picked by a click or a marquee: it is selected from the layers list only.
    const hit = baseWidgets.filter((w) => !w.locked && rotatedIntersects(baseRects.get(w.id) as Rect, w.rotation ?? 0, box)).map((w) => w.id);
    return { marquee: box, hit };
  }

  if (d.kind === "rotate") {
    const pivot = d.pivot as Point;
    const rotated = new Set(d.ids);
    const single = d.ids.length === 1;
    let delta = angleBetween(pivot, input.pointerExact) - (d.startAngle as number);
    if (input.shift) {
      // Shift: a single widget lands on multiples of 15 degrees; a selection turns by multiples of 15.
      const from = single ? (d.base.widgets.find((w) => w.id === d.ids[0])?.rotation ?? 0) : 0;
      delta = snapAngle(from + delta) - from;
    }
    return {
      frame: single ? undefined : { rect: boundingBox(d.ids.map((id) => baseBounds.get(id) as Rect)), angle: delta },
      doc: {
        ...d.base,
        widgets: d.base.widgets.map((w) => {
          if (!rotated.has(w.id)) return w;
          const r = baseRects.get(w.id) as Rect;
          // A single widget turns on the spot; the members of a selection also orbit its centre.
          const turned = rotateAround(rectCenter(r), w.rotation ?? 0, pivot, delta);
          const moved = single ? w : withPosition(w, turned.centre.x - r.width / 2, turned.centre.y - r.height / 2, viewWidth, viewHeight);
          const { rotation: _old, ...rest } = moved;
          return turned.rotation === 0 ? rest : { ...rest, rotation: turned.rotation };
        }),
      },
    };
  }

  const moving = new Set(d.ids);
  const others = baseWidgets.filter((w) => !moving.has(w.id)).map((w) => baseBounds.get(w.id) as Rect);
  const snapping = input.snap && !input.alt;

  if (d.kind === "move") {
    // Snapping uses the boxes as drawn (a turned widget covers its bounding box); the move itself shifts the unrotated rectangles.
    const group = boundingBox(d.ids.map((id) => baseBounds.get(id) as Rect));
    let ox = dx;
    let oy = dy;
    let guides: Guide[] = [];
    let gaps: GapMark[] = [];
    if (snapping) {
      const snap = snapMove({ ...group, left: group.left + dx, top: group.top + dy }, others, viewWidth, viewHeight, input.threshold, input.grid);
      ox += snap.dx;
      oy += snap.dy;
      guides = snap.guides;
      gaps = snap.gaps;
    }
    return {
      guides,
      gaps,
      doc: {
        ...d.base,
        widgets: d.base.widgets.map((w) => {
          if (!moving.has(w.id)) return w;
          const r = baseRects.get(w.id) as Rect;
          return withRect(w, { ...r, left: Math.round(r.left + ox), top: Math.round(r.top + oy) }, viewWidth, viewHeight);
        }),
      },
    };
  }

  // Resize a single widget.
  const id = d.ids[0];
  const start = baseRects.get(id) as Rect;
  const turn = d.base.widgets.find((w) => w.id === id)?.rotation ?? 0;
  // The movement is read in the widget's own axes; the edge opposite the handle stays where it is on screen.
  let next = resizeRotatedBox(start, turn, d.handle as Handle, dx, dy, { min: MIN_SIZE, keepAspect: input.shift });
  let guides: Guide[] = [];
  // Guides only know horizontal and vertical edges: a turned widget resizes without snapping.
  if (snapping && !input.shift && turn === 0) {
    const snapped = snapResize(next, d.handle as Handle, others, viewWidth, viewHeight, input.threshold, MIN_SIZE);
    next = snapped.box;
    guides = snapped.guides;
  }
  return { guides, doc: { ...d.base, widgets: d.base.widgets.map((w) => (w.id === id ? withRect(w, next, viewWidth, viewHeight) : w)) } };
}
