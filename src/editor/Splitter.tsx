import { type KeyboardEvent, type PointerEvent, useCallback, useEffect, useState } from "react";

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

/**
 * Past an edge the divider does not stop dead: it keeps following the pointer, with more and more
 * resistance (the same curve as a scroll view's rubber band), and springs back on release.
 * `dimension` is how far it could stretch before it stops giving at all.
 */
export function rubberBand(overshoot: number, dimension = 120, constant = 0.55): number {
  const sign = Math.sign(overshoot);
  const x = Math.abs(overshoot);
  return (sign * (x * dimension * constant)) / (dimension + constant * x);
}

/** A panel size that survives restarts. Storage can be unavailable (private mode), so it never throws. */
export function useStoredSize(key: string, initial: number, min: number, max: number): [number, (size: number) => void, () => void] {
  const [size, setSize] = useState(() => {
    try {
      const stored = Number(localStorage.getItem(key));
      return Number.isFinite(stored) && stored > 0 ? clamp(stored, min, max) : initial;
    } catch {
      return initial;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(key, String(size));
    } catch {
      /* not persisted: the size still works for this session */
    }
  }, [key, size]);
  const set = useCallback((next: number) => setSize(clamp(next, min, max)), [min, max]);
  const reset = useCallback(() => setSize(initial), [initial]);
  return [size, set, reset];
}

interface SplitterProps {
  /** `col` is a vertical bar that resizes a width; `row` is a horizontal bar that resizes a height. */
  axis: "col" | "row";
  value: number;
  min: number;
  max: number;
  onChange: (size: number) => void;
  onReset: () => void;
  label: string;
  /** The panel sits after the bar (right / bottom), so dragging towards its start makes it bigger. */
  grows?: "after" | "before";
}

const STEP = 16;

/** Draggable divider between two panels. Also works with the arrow keys; double-click restores the default. */
export function Splitter({ axis, value, min, max, onChange, onReset, label, grows = "before" }: SplitterProps) {
  const [dragging, setDragging] = useState(false);
  // How far the bar is pulled past an edge, in px of the panel's growth direction (0 inside the limits).
  const [stretch, setStretch] = useState(0);
  const sign = grows === "before" ? 1 : -1;
  const horizontal = axis === "col";

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const target = e.currentTarget;
    target.setPointerCapture(e.pointerId);
    const start = horizontal ? e.clientX : e.clientY;
    const startValue = value;
    setDragging(true);
    const move = (ev: globalThis.PointerEvent) => {
      const raw = startValue + sign * ((horizontal ? ev.clientX : ev.clientY) - start);
      onChange(raw);
      setStretch(rubberBand(raw - clamp(raw, min, max)));
    };
    const end = () => {
      setDragging(false);
      setStretch(0);
      target.removeEventListener("pointermove", move);
      target.removeEventListener("pointerup", end);
      target.removeEventListener("pointercancel", end);
    };
    target.addEventListener("pointermove", move);
    target.addEventListener("pointerup", end);
    target.addEventListener("pointercancel", end);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const grow = horizontal ? (grows === "before" ? "ArrowRight" : "ArrowLeft") : grows === "before" ? "ArrowDown" : "ArrowUp";
    const shrink = horizontal ? (grows === "before" ? "ArrowLeft" : "ArrowRight") : grows === "before" ? "ArrowUp" : "ArrowDown";
    const step = STEP * (e.shiftKey ? 4 : 1);
    if (e.key === grow) onChange(value + step);
    else if (e.key === shrink) onChange(value - step);
    else if (e.key === "Home") onChange(min);
    else if (e.key === "End") onChange(max);
    else return;
    e.preventDefault();
  };

  // The line leans into the pull; released, it eases back to where the panel really ends.
  const offset = sign * stretch;
  const lean = horizontal ? `translateX(${offset}px)` : `translateY(${offset}px)`;

  return (
    <div
      role="separator"
      tabIndex={0}
      aria-label={label}
      aria-orientation={horizontal ? "vertical" : "horizontal"}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={Math.round(value)}
      title={label}
      onPointerDown={onPointerDown}
      onDoubleClick={onReset}
      onKeyDown={onKeyDown}
      className={`group relative shrink-0 touch-none outline-none ${horizontal ? "w-px cursor-col-resize bg-wash/8" : "h-px cursor-row-resize bg-wash/8"}`}
    >
      {/* Wider invisible hit area; the visible line stays one pixel. */}
      <span aria-hidden className={`absolute ${horizontal ? "-inset-x-1.5 inset-y-0" : "-inset-y-1.5 inset-x-0"}`} />
      <span
        aria-hidden
        style={{ transform: lean }}
        className={`pointer-events-none absolute transition-[opacity,transform] ease-out motion-reduce:transition-none group-focus-visible:opacity-100 group-hover:opacity-100 ${dragging ? "opacity-100 duration-0" : "opacity-0 duration-200"} bg-accent ${horizontal ? "-inset-x-px inset-y-0" : "-inset-y-px inset-x-0"}`}
      />
    </div>
  );
}
