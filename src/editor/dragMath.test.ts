import { describe, expect, it } from "vitest";
import { type Layout, type WidgetInstance, resolveRect } from "../overlay/layout";
import { type Drag, type DragInput, computeDrag } from "./dragMath";
import { isDirty } from "./layoutLibrary";

const widget = (id: string, x: number, extra: Partial<WidgetInstance> = {}): WidgetInstance => ({ id, type: "score", anchor: "top-left", x, y: 10, w: 100, h: 50, pages: ["playing"], ...extra });
const layout = (widgets: WidgetInstance[]): Layout => ({ version: 2, name: "t", referenceHeight: 1080, widgets });
const input = (x: number, y: number, extra: Partial<DragInput> = {}): DragInput => ({ pointer: { x, y }, pointerExact: { x, y }, shift: false, alt: false, snap: false, grid: 0, threshold: 5, page: "playing", viewWidth: 1920, viewHeight: 1080, ...extra });
const drag = (kind: Drag["kind"], base: Layout, ids: string[], extra: Partial<Drag> = {}): Drag => ({ kind, startX: 0, startY: 0, base, ids, clientX: 0, clientY: 0, started: true, pointerId: 1, ...extra });

describe("computeDrag", () => {
  it("moves the dragged widget by the pointer's travel and leaves the others", () => {
    const base = layout([widget("a", 100), widget("b", 400)]);
    const { doc } = computeDrag(drag("move", base, ["a"]), input(30, 20));
    const [a, b] = doc?.widgets ?? [];
    expect(resolveRect(a, 1920, 1080).left).toBe(130);
    expect(resolveRect(a, 1920, 1080).top).toBe(30);
    expect(b).toBe(base.widgets[1]);
  });

  it("recomputes from the layout at the start, so a step does not depend on the previous one", () => {
    const base = layout([widget("a", 100)]);
    const d = drag("move", base, ["a"]);
    computeDrag(d, input(500, 500));
    const again = computeDrag(d, input(30, 20));
    expect(resolveRect(again.doc?.widgets[0] as WidgetInstance, 1920, 1080).left).toBe(130);
  });

  it("never picks a locked widget with the marquee", () => {
    const base = layout([widget("free", 100), widget("held", 100, { locked: true })]);
    const { hit, marquee } = computeDrag(drag("marquee", base, []), input(500, 500));
    expect(marquee).toEqual({ left: 0, top: 0, width: 500, height: 500 });
    expect(hit).toEqual(["free"]);
  });

  it("only considers the widgets of the page being edited", () => {
    const base = layout([widget("here", 100), widget("there", 100, { pages: ["results"] })]);
    expect(computeDrag(drag("marquee", base, []), input(500, 500)).hit).toEqual(["here"]);
  });

  it("does not move guides or frame during a plain move", () => {
    const base = layout([widget("a", 100)]);
    const r = computeDrag(drag("move", base, ["a"]), input(5, 5));
    expect(r.frame).toBeUndefined();
    expect(r.guides).toEqual([]);
  });
});

describe("isDirty", () => {
  it("compares the document by reference, so undoing back to the saved one is clean", () => {
    const doc = layout([]);
    expect(isDirty({ doc, saved: doc })).toBe(false);
    expect(isDirty({ doc: { ...doc }, saved: doc })).toBe(true);
    expect(isDirty({ doc, saved: null })).toBe(true);
  });
});
