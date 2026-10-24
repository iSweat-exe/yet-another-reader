import { type CSSProperties, type PointerEvent as ReactPointerEvent, useCallback, useEffect, useRef, useState } from "react";
import type { Placement } from "../model/layerOrder";

/** Travel (px) before a press on a row becomes a drag: a click that wobbles must still select. */
const START_PX = 4;
/** Distance from the edge of the scrolling list where it starts to scroll under the pointer, and how fast. */
const EDGE_PX = 28;
const EDGE_SPEED = 10;

interface Active {
  key: string;
  startY: number;
  pointerId: number;
  list: HTMLElement;
  moved: boolean;
}

export interface RowDropTarget {
  key: string;
  placement: Placement;
}

/** The live state of a drag, for drawing. */
export interface RowDragState {
  key: string;
  /** How far the dragged row has followed the pointer, in px. */
  dy: number;
  target: RowDropTarget | null;
  /** Where the insertion line goes, in px from the top of the list's offset parent. */
  lineTop: number | null;
}

/** The scrolling ancestor of `el`, if any. */
function scrollParent(el: HTMLElement): HTMLElement | null {
  for (let p = el.parentElement; p; p = p.parentElement) {
    const overflow = getComputedStyle(p).overflowY;
    if ((overflow === "auto" || overflow === "scroll") && p.scrollHeight > p.clientHeight) return p;
  }
  return null;
}

/**
 * Reorders the rows of a list by dragging them, with the pointer (not the browser's drag and drop, which
 * cannot follow the pointer 1:1 nor be cancelled cleanly). The row follows the pointer exactly, a line shows where it
 * will land, Escape puts everything back, and the click that ends a drag does not select anything.
 *
 * Rows are `[data-row="<key>"]` elements, direct children of the list `[data-rows]` they belong to; a drag starts from
 * an element marked `data-grip` inside a row. A row can only land in its own list (a widget stays in its group).
 */
export function useRowDrag(onDrop: (key: string, target: RowDropTarget) => void) {
  const [state, setState] = useState<RowDragState | null>(null);
  const active = useRef<Active | null>(null);
  const suppressClick = useRef(false);
  const latest = useRef(onDrop);
  latest.current = onDrop;

  const rowsOf = (list: HTMLElement) => [...list.children].filter((c): c is HTMLElement => c instanceof HTMLElement && c.dataset.row !== undefined);

  const compute = useCallback((a: Active, clientY: number) => {
    const rows = rowsOf(a.list);
    const others = rows.filter((r) => r.dataset.row !== a.key);
    // The row lands above the first other row whose middle is below the pointer, else under the last one.
    let target: RowDropTarget | null = null;
    let line: HTMLElement | null = null;
    let below = false;
    for (const r of others) {
      const box = r.getBoundingClientRect();
      if (clientY < box.top + box.height / 2) {
        target = { key: r.dataset.row as string, placement: "above" };
        line = r;
        break;
      }
    }
    if (!target && others.length > 0) {
      const last = others[others.length - 1];
      target = { key: last.dataset.row as string, placement: "below" };
      line = last;
      below = true;
    }
    // Dropping where the row already is changes nothing: no line, no target.
    const index = rows.findIndex((r) => r.dataset.row === a.key);
    const targetIndex = target ? rows.findIndex((r) => r.dataset.row === target?.key) : -1;
    if (target && (target.placement === "above" ? targetIndex === index + 1 : targetIndex === index - 1)) target = null;
    let lineTop: number | null = null;
    if (target && line) {
      const box = line.getBoundingClientRect();
      const origin = (a.list.offsetParent ?? a.list).getBoundingClientRect();
      lineTop = (below ? box.bottom : box.top) - origin.top;
    }
    return { target, lineTop };
  }, []);

  const finish = useCallback((commit: boolean, clientY?: number) => {
    const a = active.current;
    active.current = null;
    if (!a) return;
    if (a.moved) {
      suppressClick.current = true;
      // The click that follows the release must not select; if there is none the flag is dropped on the next tick.
      setTimeout(() => (suppressClick.current = false), 0);
      if (commit && clientY !== undefined) {
        const { target } = compute(a, clientY);
        if (target) latest.current(a.key, target);
      }
    }
    setState(null);
  }, [compute]);

  useEffect(() => {
    if (!state) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopImmediatePropagation();
      finish(false);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [state, finish]);

  /** Props for a row element (`data-row` is set by the caller). */
  const rowProps = (key: string) => ({
    onPointerDown: (e: ReactPointerEvent<HTMLElement>) => {
      if (e.button !== 0 || active.current) return;
      if (!(e.target as HTMLElement).closest("[data-grip]")) return;
      const list = e.currentTarget.parentElement;
      if (!list) return;
      active.current = { key, startY: e.clientY, pointerId: e.pointerId, list, moved: false };
    },
    onPointerMove: (e: ReactPointerEvent<HTMLElement>) => {
      const a = active.current;
      if (!a || e.pointerId !== a.pointerId) return;
      if (!a.moved) {
        if (Math.abs(e.clientY - a.startY) < START_PX) return;
        a.moved = true;
        e.currentTarget.setPointerCapture(e.pointerId);
      }
      // A long list scrolls while the pointer rests near its edge.
      const scroller = scrollParent(a.list);
      if (scroller) {
        const box = scroller.getBoundingClientRect();
        if (e.clientY < box.top + EDGE_PX) scroller.scrollTop -= EDGE_SPEED;
        else if (e.clientY > box.bottom - EDGE_PX) scroller.scrollTop += EDGE_SPEED;
      }
      const { target, lineTop } = compute(a, e.clientY);
      setState({ key: a.key, dy: e.clientY - a.startY, target, lineTop });
    },
    onPointerUp: (e: ReactPointerEvent<HTMLElement>) => {
      if (active.current && e.pointerId === active.current.pointerId) finish(true, e.clientY);
    },
    onPointerCancel: () => finish(false),
    onLostPointerCapture: () => finish(false),
    // Capture phase: the click of a button inside the row must not fire after a drag.
    onClickCapture: (e: React.MouseEvent) => {
      if (suppressClick.current) {
        e.stopPropagation();
        e.preventDefault();
      }
    },
  });

  /** Inline style of a row while it is dragged: it follows the pointer and floats above its neighbours. */
  const rowStyle = (key: string): CSSProperties | undefined =>
    state?.key === key
      ? { transform: `translateY(${state.dy}px) scale(1.01)`, zIndex: 20, position: "relative", boxShadow: "0 6px 20px oklch(0 0 0 / 0.45)", cursor: "grabbing" }
      : undefined;

  return { state, rowProps, rowStyle };
}
