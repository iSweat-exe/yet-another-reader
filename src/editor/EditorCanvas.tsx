import { type PointerEvent as ReactPointerEvent, useEffect, useMemo, useRef, useState } from "react";
import { ContextMenu, type MenuItem } from "../components/ContextMenu";
import { Icon } from "../components/Icon";
import { useT } from "../i18n";
import { LayoutScene } from "../overlay/OverlayCanvas";
import { type Rect, type WidgetInstance, expandGroups, resolveRect } from "../overlay/layout";
import { type Guide, type Handle, HANDLES, type Point, angleBetween, boundingBox, rectCenter, rotatedBounds, rotatedHandleCursor } from "./geometry";
import { type Drag, computeDrag } from "./dragMath";
import { backgroundStyle } from "./backgrounds";
import { registerDropTarget } from "./dropTarget";
import { useEditor, viewWidthOf } from "./useEditor";

const PADDING = 32;
/// Snap distance on screen, so it feels the same whatever the zoom.
const SNAP_PX = 7;
const HANDLE_SIZE = 9;
/** Travel (screen pixels) before a press on a widget becomes a move: a click that wobbles must not nudge or snap it. */
const START_PX = 4;
/** Grabbable size of a handle (invisible around the 9px square), so it need not be aimed at to the pixel. */
const HANDLE_HIT = 20;

/** Distance (screen pixels) between the top edge of a selection and its rotation handle. */
const ROTATE_OFFSET = 22;
const ROTATE_SIZE = 12;
/** Grabbable size of the rotation handle. */
const ROTATE_HIT = 24;
/** A curved arrow, so the pointer says "turn" over the rotation handle. */
const ROTATE_CURSOR = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke-linecap='round' stroke-linejoin='round'%3E%3Cg stroke='%23000' stroke-width='4'%3E%3Cpath d='M19 12a7 7 0 1 1-2.05-4.95'/%3E%3Cpath d='M18 3v5h-5'/%3E%3C/g%3E%3Cg stroke='%23fff' stroke-width='2'%3E%3Cpath d='M19 12a7 7 0 1 1-2.05-4.95'/%3E%3Cpath d='M18 3v5h-5'/%3E%3C/g%3E%3C/svg%3E") 12 12, grab`;

/** Below this on-screen size an edge handle would sit on top of its neighbours and swallow the widget body. */
const EDGE_HANDLE_MIN = 3 * HANDLE_HIT;

function handleStyle(handle: Handle, rotation: number): React.CSSProperties {
  const half = -HANDLE_SIZE / 2;
  const style: React.CSSProperties = { width: HANDLE_SIZE, height: HANDLE_SIZE, cursor: rotatedHandleCursor(handle, rotation) };
  if (handle.includes("n")) style.top = half;
  else if (handle.includes("s")) style.bottom = half;
  else style.top = `calc(50% - ${HANDLE_SIZE / 2}px)`;
  if (handle.includes("w")) style.left = half;
  else if (handle.includes("e")) style.right = half;
  else style.left = `calc(50% - ${HANDLE_SIZE / 2}px)`;
  return style;
}

/** Circle above the top edge of a selection, joined to it by a line: drag to turn, double-click to straighten. */
function RotateHandle({ label, cursor, onPointerDown, onDoubleClick }: { label: string; cursor: string; onPointerDown: (e: ReactPointerEvent) => void; onDoubleClick: () => void }) {
  return (
    <div
      title={label}
      onPointerDown={onPointerDown}
      onDoubleClick={onDoubleClick}
      className="pointer-events-auto absolute bottom-full left-1/2 flex -translate-x-1/2 flex-col items-center transition-opacity duration-100 ease-out starting:opacity-0 motion-reduce:transition-none"
      style={{ width: ROTATE_HIT, cursor }}
    >
      <span aria-hidden className="rounded-full border border-[var(--color-accent)] bg-white" style={{ width: ROTATE_SIZE, height: ROTATE_SIZE }} />
      <span aria-hidden className="w-px bg-[var(--color-accent)]" style={{ height: ROTATE_OFFSET }} />
    </div>
  );
}

export function EditorCanvas() {
  const t = useT();
  const [menu, setMenu] = useState<{ x: number; y: number; items: MenuItem[] } | null>(null);
  const doc = useEditor((s) => s.doc);
  const page = useEditor((s) => s.page);
  const aspect = useEditor((s) => s.aspect);
  const selection = useEditor((s) => s.selection);
  const snapOn = useEditor((s) => s.snap);
  const showGrid = useEditor((s) => s.showGrid);
  const gridSize = useEditor((s) => s.gridSize);
  const background = useEditor((s) => s.background);
  const { select, beginGesture, liveUpdate, endGesture, setRotation } = useEditor.getState();

  const container = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 800, h: 450 });
  const [guides, setGuides] = useState<Guide[]>([]);
  const [marquee, setMarquee] = useState<Rect | null>(null);
  /** Rotating a multi-selection: its frame turns as a whole (its box at the start, turned by the angle so far). */
  const [frame, setFrame] = useState<{ rect: Rect; angle: number } | null>(null);
  const [rotating, setRotating] = useState(false);
  const drag = useRef<Drag | null>(null);

  useEffect(() => {
    const el = container.current;
    if (!el) return;
    const observer = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    observer.observe(el);
    setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => observer.disconnect();
  }, []);

  const viewWidth = viewWidthOf(doc, aspect);
  const viewHeight = doc.referenceHeight;
  const scale = Math.max(0.05, Math.min((size.w - PADDING * 2) / viewWidth, (size.h - PADDING * 2) / viewHeight));

  // Only the widgets of the page being edited can be seen, selected and snapped to.
  const pageWidgets = useMemo(() => doc.widgets.filter((w) => w.pages.includes(page)), [doc.widgets, page]);
  const pageDoc = useMemo(() => ({ ...doc, widgets: pageWidgets }), [doc, pageWidgets]);
  const rects = useMemo(() => new Map(pageWidgets.map((w) => [w.id, resolveRect(w, viewWidth, viewHeight)])), [pageWidgets, viewWidth, viewHeight]);
  /** What each widget covers on screen once turned: snapping, guides and the multi-selection frame work on these boxes. */
  const bounds = useMemo(() => new Map(pageWidgets.map((w) => [w.id, rotatedBounds(rects.get(w.id) as Rect, w.rotation ?? 0)])), [pageWidgets, rects]);

  /** Pointer position in layout pixels, relative to the screen's top-left. */
  const toLayout = (e: { clientX: number; clientY: number }) => {
    const box = screenRef.current?.getBoundingClientRect();
    return { x: ((e.clientX - (box?.left ?? 0)) / scale) | 0, y: ((e.clientY - (box?.top ?? 0)) / scale) | 0 };
  };
  const screenRef = useRef<HTMLDivElement>(null);
  // Widgets dragged out of the palette land where they are released over the screen.
  useEffect(
    () =>
      registerDropTarget((clientX, clientY) => {
        const box = screenRef.current?.getBoundingClientRect();
        if (!box || clientX < box.left || clientX > box.right || clientY < box.top || clientY > box.bottom) return null;
        return { x: Math.round((clientX - box.left) / scale), y: Math.round((clientY - box.top) / scale) };
      }),
    [scale],
  );
  /** Same as `toLayout`, without truncating to whole pixels (angles need the precision). */
  const toLayoutExact = (e: { clientX: number; clientY: number }): Point => {
    const box = screenRef.current?.getBoundingClientRect();
    return { x: (e.clientX - (box?.left ?? 0)) / scale, y: (e.clientY - (box?.top ?? 0)) / scale };
  };

  const startDrag = (e: ReactPointerEvent, next: Omit<Drag, "startX" | "startY" | "base" | "clientX" | "clientY" | "started" | "pointerId" | "target">) => {
    const p = toLayout(e);
    const started = next.kind === "marquee";
    drag.current = { ...next, startX: p.x, startY: p.y, clientX: e.clientX, clientY: e.clientY, started, pointerId: e.pointerId, base: useEditor.getState().doc, target: e.currentTarget as HTMLElement };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    if (started) beginGesture();
  };

  const onWidgetDown = (e: ReactPointerEvent, widget: WidgetInstance) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    if (drag.current) return; // a second finger/pen must not hijack the gesture in progress
    const additive = e.shiftKey || e.ctrlKey || e.metaKey;
    const already = selection.includes(widget.id);
    // Dragging an unselected widget selects it; shift/ctrl toggles without dragging.
    if (additive) return select([widget.id], true);
    const ids = already ? selection : expandGroups(doc.widgets, [widget.id], page);
    if (!already) select(ids);
    if (widget.locked) return;
    startDrag(e, {
      kind: "move",
      ids: ids.filter((id) => !doc.widgets.find((w) => w.id === id)?.locked),
      collapseTo: already && selection.length > 1 ? expandGroups(doc.widgets, [widget.id], page) : undefined,
    });
  };

  const onHandleDown = (e: ReactPointerEvent, widget: WidgetInstance, handle: Handle) => {
    e.stopPropagation();
    if (e.button !== 0 || widget.locked || drag.current) return;
    startDrag(e, { kind: "resize", ids: [widget.id], handle });
  };

  /** The rotation handle: turns `ids` around `pivot`, the widget following the pointer's angle exactly (the grab offset is kept). */
  const onRotateDown = (e: ReactPointerEvent, ids: string[], pivot: Point) => {
    e.stopPropagation();
    if (e.button !== 0 || drag.current) return;
    const movable = ids.filter((id) => !useEditor.getState().doc.widgets.find((w) => w.id === id)?.locked);
    if (movable.length === 0) return;
    startDrag(e, { kind: "rotate", ids: movable, pivot, startAngle: angleBetween(pivot, toLayoutExact(e)) });
  };

  const onBackgroundDown = (e: ReactPointerEvent) => {
    if (e.button !== 0 || drag.current) return;
    const additive = e.shiftKey || e.ctrlKey || e.metaKey;
    if (!additive) select([]);
    startDrag(e, { kind: "marquee", ids: [], additive });
  };

  const onMove = (e: ReactPointerEvent) => {
    const d = drag.current;
    if (!d || e.pointerId !== d.pointerId) return;
    if (!d.started) {
      if (Math.hypot(e.clientX - d.clientX, e.clientY - d.clientY) < START_PX) return;
      d.started = true;
      beginGesture();
      if (d.kind === "rotate") setRotating(true);
    }
    const p = toLayout(e);
    const result = computeDrag(d, {
      pointer: p,
      pointerExact: toLayoutExact(e),
      shift: e.shiftKey,
      alt: e.altKey,
      snap: snapOn,
      grid: useEditor.getState().showGrid ? useEditor.getState().gridSize : 0,
      threshold: SNAP_PX / scale,
      page,
      viewWidth,
      viewHeight,
    });
    if (result.marquee) {
      setMarquee(result.marquee);
      const hit = result.hit ?? [];
      select(d.additive ? [...new Set([...useEditor.getState().selection.filter((id) => !hit.includes(id)), ...hit])] : hit);
    }
    if (result.frame) setFrame(result.frame);
    if (result.guides) setGuides(result.guides);
    if (result.doc) liveUpdate(result.doc);
  };

  /** Ends the gesture: pointer up, cancel, lost capture or window blur (all land here; calling it twice is harmless). */
  /** Right click: the editor's own menu, on the widget under the pointer (which it selects first) or on the empty screen. */
  const openMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    const ed = useEditor.getState();
    const id = (e.target as HTMLElement).closest<HTMLElement>("[data-widget]")?.dataset.widget;
    if (id && !ed.selection.includes(id)) ed.select(expandGroups(ed.doc.widgets, [id], ed.page));
    const now = useEditor.getState();
    const picked = now.doc.widgets.filter((w) => now.selection.includes(w.id));
    const ids = picked.map((w) => w.id);
    const noClipboard = now.clipboard.length === 0;

    const items: MenuItem[] =
      picked.length === 0
        ? [
            { id: "paste", label: t("editor.menu.paste"), shortcut: "Ctrl V", disabled: noClipboard, onSelect: now.paste },
            { id: "all", label: t("editor.menu.selectAll"), shortcut: "Ctrl A", onSelect: () => now.select(now.doc.widgets.filter((w) => !w.locked && w.pages.includes(now.page)).map((w) => w.id)) },
          ]
        : [
            { id: "copy", label: t("editor.menu.copy"), shortcut: "Ctrl C", onSelect: now.copySelected },
            { id: "duplicate", label: t("editor.menu.duplicate"), icon: "copy", shortcut: "Ctrl D", onSelect: now.duplicateSelected },
            { id: "paste", label: t("editor.menu.paste"), shortcut: "Ctrl V", disabled: noClipboard, onSelect: now.paste },
            { id: "front", label: t("editor.menu.front"), icon: "chevron-up", separated: true, onSelect: () => ids.forEach((w) => now.reorder(w, "front")) },
            { id: "back", label: t("editor.menu.back"), icon: "chevron-down", onSelect: () => ids.forEach((w) => now.reorder(w, "back")) },
            picked.every((w) => w.locked)
              ? { id: "lock", label: t("editor.menu.unlock"), icon: "unlock", onSelect: () => now.setLocked(ids, false) }
              : { id: "lock", label: t("editor.menu.lock"), icon: "lock", onSelect: () => now.setLocked(ids, true) },
            ...(picked.length > 1 ? [{ id: "group", label: t("editor.menu.group"), icon: "group" as const, shortcut: "Ctrl G", onSelect: now.groupSelected }] : []),
            ...(picked.some((w) => w.group) ? [{ id: "ungroup", label: t("editor.menu.ungroup"), icon: "ungroup" as const, shortcut: "Ctrl Maj G", onSelect: now.ungroupSelected }] : []),
            { id: "delete", label: t("editor.menu.delete"), icon: "trash", shortcut: "Suppr", danger: true, separated: true, onSelect: now.removeSelected },
          ];
    setMenu({ x: e.clientX, y: e.clientY, items });
  };

  const finish = (pointerId?: number) => {
    const d = drag.current;
    if (!d || (pointerId !== undefined && pointerId !== d.pointerId)) return;
    drag.current = null;
    setGuides([]);
    setMarquee(null);
    setFrame(null);
    setRotating(false);
    // A press that never travelled far enough changed nothing: there is no gesture to close.
    if (d.started) endGesture();
    else if (d.collapseTo) select(d.collapseTo);
  };

  /** Escape during a gesture: everything goes back to how it was, with no undo entry, and the key does not deselect. */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const d = drag.current;
      if (e.key !== "Escape" || !d) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      drag.current = null;
      if (d.started) useEditor.getState().cancelGesture();
      setGuides([]);
      setMarquee(null);
      setFrame(null);
      setRotating(false);
      if (d.target?.hasPointerCapture(d.pointerId)) d.target.releasePointerCapture(d.pointerId);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);

  // The pointer can be released outside the window or the window can lose focus mid-drag.
  useEffect(() => {
    const onBlur = () => finish();
    window.addEventListener("blur", onBlur);
    return () => window.removeEventListener("blur", onBlur);
  });

  const selectedRect = selection.length > 1 ? boundingBox(selection.map((id) => bounds.get(id)).filter((r): r is Rect => !!r)) : null;
  const multiFrame = frame ?? (selectedRect ? { rect: selectedRect, angle: 0 } : null);
  const movableIds = selection.filter((id) => !pageWidgets.find((w) => w.id === id)?.locked);
  const gridPx = gridSize * scale;

  return (
    <div ref={container} className="relative min-h-0 flex-1 overflow-hidden bg-canvas" onPointerMove={onMove} onPointerUp={(e) => finish(e.pointerId)} onPointerCancel={(e) => finish(e.pointerId)} onLostPointerCapture={(e) => finish(e.pointerId)} onContextMenu={openMenu}>
      <div
        ref={screenRef}
        className="absolute shadow-[0_0_0_1px_oklch(1_0_0/0.12),0_8px_40px_oklch(0_0_0/0.5)]"
        style={{
          width: viewWidth * scale,
          height: viewHeight * scale,
          left: (size.w - viewWidth * scale) / 2,
          top: (size.h - viewHeight * scale) / 2,
          ...backgroundStyle(background),
        }}
        data-testid="editor-screen"
      >
        {/* The real widgets, unscaled in layout pixels and scaled as a whole. Never interactive. */}
        <div className="pointer-events-none absolute top-0 left-0 origin-top-left" style={{ transform: `scale(${scale})` }}>
          <LayoutScene layout={pageDoc} viewWidth={viewWidth} ignoreVisibility />
        </div>

        {showGrid && (
          <div
            className="pointer-events-none absolute inset-0"
            style={{ backgroundImage: "linear-gradient(to right, rgb(255 255 255 / 0.07) 1px, transparent 1px), linear-gradient(to bottom, rgb(255 255 255 / 0.07) 1px, transparent 1px)", backgroundSize: `${gridPx}px ${gridPx}px` }}
          />
        )}

        {/* Interaction layer. */}
        <div className="absolute inset-0" onPointerDown={onBackgroundDown} data-testid="editor-surface">
          {pageWidgets.map((widget) => {
            const r = rects.get(widget.id) as Rect;
            const selected = selection.includes(widget.id);
            const turn = widget.rotation ?? 0;
            const alone = selected && selection.length === 1 && !widget.locked;
            return (
              <div
                key={widget.id}
                data-widget={widget.id}
                onPointerDown={(e) => onWidgetDown(e, widget)}
                className={`absolute ${widget.locked ? "pointer-events-none" : "cursor-move"} outline-2 transition-[outline-color] duration-100 ease-out motion-reduce:transition-none ${selected ? "outline-[var(--color-accent)]" : widget.locked ? "outline-white/0" : "outline-white/0 hover:outline-white/35"}`}
                // Turned like the widget it covers (around its centre), so the frame, the handles and hit-testing follow it.
                style={{ left: r.left * scale, top: r.top * scale, width: r.width * scale, height: r.height * scale, outlineStyle: "solid", transform: turn ? `rotate(${turn}deg)` : undefined }}
              >
                {alone &&
                  HANDLES.filter((h) => (h === "n" || h === "s" ? r.width * scale >= EDGE_HANDLE_MIN : h === "e" || h === "w" ? r.height * scale >= EDGE_HANDLE_MIN : true)).map((h) => {
                    // On a tiny widget the grab area shrinks so the corners never cover the whole body.
                    const hit = Math.max(HANDLE_SIZE, Math.min(HANDLE_HIT, Math.min(r.width, r.height) * scale / 3));
                    return (
                      <div key={h} onPointerDown={(e) => onHandleDown(e, widget, h)} className="absolute transition-opacity duration-100 ease-out starting:opacity-0 motion-reduce:transition-none" style={handleStyle(h, turn)}>
                        {/* The visible square stays 9px; the grabbable area around it is up to HANDLE_HIT wide. */}
                        <span aria-hidden className="absolute inset-0 rounded-[2px] border border-[var(--color-accent)] bg-white" />
                        <span aria-hidden className="absolute" style={{ inset: -(hit - HANDLE_SIZE) / 2 }} />
                      </div>
                    );
                  })}
                {alone && <RotateHandle label={t("editor.rotateHandle")} cursor={rotating ? "grabbing" : ROTATE_CURSOR} onPointerDown={(e) => onRotateDown(e, [widget.id], rectCenter(r))} onDoubleClick={() => setRotation([widget.id], 0)} />}
              </div>
            );
          })}

          {/* Names of the selected widgets, outside the turned frames so the text stays upright. */}
          {pageWidgets.map((widget) => {
            const b = bounds.get(widget.id) as Rect;
            if (!selection.includes(widget.id)) return null;
            return (
              <span
                key={widget.id}
                className="pointer-events-none absolute flex items-center gap-1 rounded-sm bg-[var(--color-accent)] px-1.5 text-[0.6875rem] leading-4 font-semibold whitespace-nowrap text-surface tabular-nums transition-opacity duration-100 ease-out starting:opacity-0 motion-reduce:transition-none"
                style={{ left: b.left * scale, top: b.top * scale < 24 ? (b.top + b.height) * scale + 2 : b.top * scale - 20 }}
              >
                {widget.name ?? widget.id}
                {widget.rotation ? <span className="font-normal opacity-80">{Math.round(widget.rotation * 10) / 10}°</span> : null}
                {widget.locked && <Icon name="lock" size={10} />}
              </span>
            );
          })}

          {multiFrame && (
            <div
              className="pointer-events-none absolute outline-1 outline-dashed outline-[var(--color-accent)]"
              style={{ left: multiFrame.rect.left * scale, top: multiFrame.rect.top * scale, width: multiFrame.rect.width * scale, height: multiFrame.rect.height * scale, transform: multiFrame.angle ? `rotate(${multiFrame.angle}deg)` : undefined }}
            >
              {movableIds.length > 0 && <RotateHandle label={t("editor.rotateHandle")} cursor={rotating ? "grabbing" : ROTATE_CURSOR} onPointerDown={(e) => onRotateDown(e, movableIds, rectCenter(multiFrame.rect))} onDoubleClick={() => setRotation(movableIds, 0)} />}
            </div>
          )}

          {guides.map((g, i) => (
            <div
              key={`${g.axis}-${g.at}-${i}`}
              className="pointer-events-none absolute bg-[oklch(0.85_0.17_190)]"
              style={g.axis === "x" ? { left: g.at * scale, top: 0, width: 1, height: "100%" } : { top: g.at * scale, left: 0, height: 1, width: "100%" }}
            />
          ))}

          {marquee && <div className="pointer-events-none absolute border border-[var(--color-accent)] bg-[var(--color-accent)]/10" style={{ left: marquee.left * scale, top: marquee.top * scale, width: marquee.width * scale, height: marquee.height * scale }} />}
        </div>
      </div>
      <span className="pointer-events-none absolute right-3 bottom-2 text-[0.6875rem] text-ink-dim tabular-nums">
        {viewWidth}×{viewHeight} · {Math.round(scale * 100)}% · {aspect}
      </span>
      {menu && <ContextMenu x={menu.x} y={menu.y} items={menu.items} label={t("editor.menu.title")} onClose={() => setMenu(null)} />}
    </div>
  );
}
