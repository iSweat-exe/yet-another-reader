/**
 * Where a widget dragged out of the palette can be dropped. The canvas registers a function that turns a screen
 * point into layout pixels (or `null` when the point is not over the previewed screen); the palette asks it while
 * dragging, so the two never need to know about each other's layout.
 */
export type DropResolver = (clientX: number, clientY: number) => { x: number; y: number } | null;

let resolver: DropResolver | null = null;

/** Registers the canvas's resolver; returns a function that removes it. */
export function registerDropTarget(next: DropResolver): () => void {
  resolver = next;
  return () => {
    if (resolver === next) resolver = null;
  };
}

/** The layout position under a screen point, or `null` when nothing there accepts a widget. */
export function dropPosition(clientX: number, clientY: number): { x: number; y: number } | null {
  return resolver ? resolver(clientX, clientY) : null;
}
