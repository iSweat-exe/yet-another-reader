import { type PointerEvent as ReactPointerEvent, useEffect, useMemo, useRef, useState } from "react";
import { ContextMenu, type MenuItem } from "../components/ContextMenu";
import { Icon } from "../components/Icon";
import { useT } from "../i18n";
import { LayoutScene } from "../overlay/OverlayCanvas";
import { type Layout, type Rect, type WidgetInstance, expandGroups, resolveRect, withRect } from "../overlay/layout";
import { type Guide, type Handle, HANDLES, boundingBox, intersects, resizeBox, snapMove, snapResize } from "./geometry";
import { useEditor, viewWidthOf } from "./useEditor";

const PADDING = 32;
/// Snap distance on screen, so it feels the same whatever the zoom.
const SNAP_PX = 7;
const MIN_SIZE = 8;
const HANDLE_SIZE = 9;
/** Travel (screen pixels) before a press on a widget becomes a move: a click that wobbles must not nudge or snap it. */
const START_PX = 4;
/** Grabbable size of a handle (invisible around the 9px square), so it need not be aimed at to the pixel. */
const HANDLE_HIT = 20;

interface Drag {
  kind: "move" | "resize" | "marquee";
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
  /** A plain click (no travel) on a widget of a multi-selection narrows the selection to it, like on release in any editor. */
  collapseTo?: string[];
}

/** Below this on-screen size an edge handle would sit on top of its neighbours and swallow the widget body. */
const EDGE_HANDLE_MIN = 3 * HANDLE_HIT;

const handleCursor: Record<Handle, string> = { n: "ns-resize", s: "ns-resize", e: "ew-resize", w: "ew-resize", ne: "nesw-resize", sw: "nesw-resize", nw: "nwse-resize", se: "nwse-resize" };

function handleStyle(handle: Handle): React.CSSProperties {
  const half = -HANDLE_SIZE / 2;
  const style: React.CSSProperties = { width: HANDLE_SIZE, height: HANDLE_SIZE, cursor: handleCursor[handle] };
  if (handle.includes("n")) style.top = half;
  else if (handle.includes("s")) style.bottom = half;
  else style.top = `calc(50% - ${HANDLE_SIZE / 2}px)`;
  if (handle.includes("w")) style.left = half;
  else if (handle.includes("e")) style.right = half;
  else style.left = `calc(50% - ${HANDLE_SIZE / 2}px)`;
  return style;
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
  const { select, beginGesture, liveUpdate, endGesture } = useEditor.getState();

  const container = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 800, h: 450 });
  const [guides, setGuides] = useState<Guide[]>([]);
  const [marquee, setMarquee] = useState<Rect | null>(null);
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

  /** Pointer position in layout pixels, relative to the screen's top-left. */
  const toLayout = (e: { clientX: number; clientY: number }) => {
    const box = screenRef.current?.getBoundingClientRect();
    return { x: ((e.clientX - (box?.left ?? 0)) / scale) | 0, y: ((e.clientY - (box?.top ?? 0)) / scale) | 0 };
  };
  const screenRef = useRef<HTMLDivElement>(null);

  const startDrag = (e: ReactPointerEvent, next: Omit<Drag, "startX" | "startY" | "base" | "clientX" | "clientY" | "started" | "pointerId">) => {
    const p = toLayout(e);
    const started = next.kind === "marquee";
    drag.current = { ...next, startX: p.x, startY: p.y, clientX: e.clientX, clientY: e.clientY, started, pointerId: e.pointerId, base: useEditor.getState().doc };
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
    }
    const p = toLayout(e);
    const dx = p.x - d.startX;
    const dy = p.y - d.startY;
    const threshold = SNAP_PX / scale;
    const baseWidgets = d.base.widgets.filter((w) => w.pages.includes(page));
    const baseRects = new Map(baseWidgets.map((w) => [w.id, resolveRect(w, viewWidth, viewHeight)]));

    if (d.kind === "marquee") {
      const box: Rect = { left: Math.min(d.startX, p.x), top: Math.min(d.startY, p.y), width: Math.abs(dx), height: Math.abs(dy) };
      setMarquee(box);
      const hit = baseWidgets.filter((w) => intersects(box, baseRects.get(w.id) as Rect)).map((w) => w.id);
      select(d.additive ? [...new Set([...useEditor.getState().selection.filter((id) => !hit.includes(id)), ...hit])] : hit);
      return;
    }

    const moving = new Set(d.ids);
    const others = baseWidgets.filter((w) => !moving.has(w.id)).map((w) => baseRects.get(w.id) as Rect);

    if (d.kind === "move") {
      const group = boundingBox(d.ids.map((id) => baseRects.get(id) as Rect));
      let ox = dx;
      let oy = dy;
      if (snapOn && !e.altKey) {
        const snap = snapMove({ ...group, left: group.left + dx, top: group.top + dy }, others, viewWidth, viewHeight, threshold, useEditor.getState().showGrid ? 10 : 0);
        ox += snap.dx;
        oy += snap.dy;
        setGuides(snap.guides);
      } else setGuides([]);
      liveUpdate({
        ...d.base,
        widgets: d.base.widgets.map((w) => {
          if (!moving.has(w.id)) return w;
          const r = baseRects.get(w.id) as Rect;
          return withRect(w, { ...r, left: Math.round(r.left + ox), top: Math.round(r.top + oy) }, viewWidth, viewHeight);
        }),
      });
      return;
    }

    // Resize a single widget.
    const id = d.ids[0];
    const start = baseRects.get(id) as Rect;
    let next = resizeBox(start, d.handle as Handle, dx, dy, { min: MIN_SIZE, keepAspect: e.shiftKey });
    if (snapOn && !e.altKey && !e.shiftKey) {
      const snapped = snapResize(next, d.handle as Handle, others, viewWidth, viewHeight, threshold, MIN_SIZE);
      next = snapped.box;
      setGuides(snapped.guides);
    } else setGuides([]);
    liveUpdate({ ...d.base, widgets: d.base.widgets.map((w) => (w.id === id ? withRect(w, next, viewWidth, viewHeight) : w)) });
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
            { id: "all", label: t("editor.menu.selectAll"), shortcut: "Ctrl A", onSelect: () => now.select(now.doc.widgets.filter((w) => w.pages.includes(now.page)).map((w) => w.id)) },
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
    // A press that never travelled far enough changed nothing: there is no gesture to close.
    if (d.started) endGesture();
    else if (d.collapseTo) select(d.collapseTo);
  };

  // The pointer can be released outside the window or the window can lose focus mid-drag.
  useEffect(() => {
    const onBlur = () => finish();
    window.addEventListener("blur", onBlur);
    return () => window.removeEventListener("blur", onBlur);
  });

  const selectedRect = selection.length > 1 ? boundingBox(selection.map((id) => rects.get(id)).filter((r): r is Rect => !!r)) : null;
  const gridSize = 10 * scale;

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
          background: "linear-gradient(135deg, #1e1b4b, #831843 60%, #0f172a)",
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
            style={{ backgroundImage: "linear-gradient(to right, rgb(255 255 255 / 0.07) 1px, transparent 1px), linear-gradient(to bottom, rgb(255 255 255 / 0.07) 1px, transparent 1px)", backgroundSize: `${gridSize}px ${gridSize}px` }}
          />
        )}

        {/* Interaction layer. */}
        <div className="absolute inset-0" onPointerDown={onBackgroundDown} data-testid="editor-surface">
          {pageWidgets.map((widget) => {
            const r = rects.get(widget.id) as Rect;
            const selected = selection.includes(widget.id);
            return (
              <div
                key={widget.id}
                data-widget={widget.id}
                onPointerDown={(e) => onWidgetDown(e, widget)}
                className={`absolute ${widget.locked ? "cursor-default" : "cursor-move"} outline-2 transition-[outline-color] duration-100 ease-out motion-reduce:transition-none ${selected ? "outline-[var(--color-accent)]" : "outline-white/0 hover:outline-white/35"}`}
                style={{ left: r.left * scale, top: r.top * scale, width: r.width * scale, height: r.height * scale, outlineStyle: "solid" }}
              >
                {selected && selection.length === 1 && !widget.locked &&
                  HANDLES.filter((h) => (h === "n" || h === "s" ? r.width * scale >= EDGE_HANDLE_MIN : h === "e" || h === "w" ? r.height * scale >= EDGE_HANDLE_MIN : true)).map((h) => {
                    // On a tiny widget the grab area shrinks so the corners never cover the whole body.
                    const hit = Math.max(HANDLE_SIZE, Math.min(HANDLE_HIT, Math.min(r.width, r.height) * scale / 3));
                    return (
                      <div key={h} onPointerDown={(e) => onHandleDown(e, widget, h)} className="absolute transition-opacity duration-100 ease-out starting:opacity-0 motion-reduce:transition-none" style={handleStyle(h)}>
                        {/* The visible square stays 9px; the grabbable area around it is up to HANDLE_HIT wide. */}
                        <span aria-hidden className="absolute inset-0 rounded-[2px] border border-[var(--color-accent)] bg-white" />
                        <span aria-hidden className="absolute" style={{ inset: -(hit - HANDLE_SIZE) / 2 }} />
                      </div>
                    );
                  })}
                {selected && (
                  <span className={`pointer-events-none absolute left-0 ${r.top * scale < 24 ? "top-full mt-0.5" : "-top-5"} transition-opacity duration-100 ease-out starting:opacity-0 motion-reduce:transition-none flex items-center gap-1 rounded-sm bg-[var(--color-accent)] px-1.5 text-[0.6875rem] leading-4 font-semibold whitespace-nowrap text-surface`}>
                    {widget.name ?? widget.id}
                    {widget.locked && <Icon name="lock" size={10} />}
                  </span>
                )}
              </div>
            );
          })}

          {selectedRect && <div className="pointer-events-none absolute outline-1 outline-dashed outline-[var(--color-accent)]" style={{ left: selectedRect.left * scale, top: selectedRect.top * scale, width: selectedRect.width * scale, height: selectedRect.height * scale }} />}

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
