import { beforeEach, describe, expect, it } from "vitest";
import { type Layout, type WidgetInstance, migrateLayout, resolveRect } from "../overlay/layout";
import { useEditor, viewWidthOf } from "./useEditor";

const widget = (id: string, x: number, group?: string): WidgetInstance => ({ id, type: "score", anchor: "top-left", x, y: 0, w: 100, h: 50, pages: ["playing"], group });

const layout = (widgets: WidgetInstance[]): Layout => ({ version: 2, name: "test", referenceHeight: 1080, widgets });

const load = (widgets: WidgetInstance[], selection: string[] = []) => useEditor.setState({ doc: layout(widgets), selection, past: [], future: [], page: "playing" });
const widgets = () => useEditor.getState().doc.widgets;
const left = (id: string) => {
  const { doc, aspect } = useEditor.getState();
  const w = doc.widgets.find((x) => x.id === id) as WidgetInstance;
  return resolveRect(w, viewWidthOf(doc, aspect), doc.referenceHeight).left;
};

describe("groups", () => {
  beforeEach(() => load([widget("a", 0), widget("b", 200), widget("c", 400), widget("d", 600)]));

  it("groups the selection, stacking the members as one block", () => {
    load([widget("a", 0), widget("b", 200), widget("c", 400), widget("d", 600)], ["a", "c"]);
    useEditor.getState().groupSelected();
    expect(widgets().map((w) => w.id)).toEqual(["b", "a", "c", "d"]);
    expect(widgets().filter((w) => w.group === "group-1").map((w) => w.id)).toEqual(["a", "c"]);
  });

  it("needs two widgets to make a group", () => {
    load(widgets(), ["a"]);
    useEditor.getState().groupSelected();
    expect(widgets().some((w) => w.group)).toBe(false);
  });

  it("selects the whole group when one member is picked, unless exact", () => {
    load([widget("a", 0, "g"), widget("b", 200, "g"), widget("c", 400)]);
    useEditor.getState().select(["a"]);
    expect(useEditor.getState().selection.sort()).toEqual(["a", "b"]);
    useEditor.getState().select(["a"], false, true);
    expect(useEditor.getState().selection).toEqual(["a"]);
  });

  it("ungroups", () => {
    load([widget("a", 0, "g"), widget("b", 200, "g")], ["a", "b"]);
    useEditor.getState().ungroupSelected();
    expect(widgets().some((w) => w.group)).toBe(false);
  });

  it("releases a group reduced to one widget", () => {
    load([widget("a", 0, "g"), widget("b", 200, "g"), widget("c", 400, "g")], ["a"]);
    useEditor.getState().select(["a"], false, true);
    useEditor.getState().removeSelected();
    expect(widgets().map((w) => w.group)).toEqual(["g", "g"]);
    useEditor.getState().select(["b"], false, true);
    useEditor.getState().removeSelected();
    expect(widgets().map((w) => w.group)).toEqual([undefined]);
  });

  it("gives a duplicated group a group of its own", () => {
    load([widget("a", 0, "group-1"), widget("b", 200, "group-1")], ["a", "b"]);
    useEditor.getState().duplicateSelected();
    const groups = new Set(widgets().map((w) => w.group));
    expect(groups).toEqual(new Set(["group-1", "group-2"]));
    expect(widgets().filter((w) => w.group === "group-2")).toHaveLength(2);
  });

  it("forgets groups of a single widget when a layout is loaded", () => {
    const loaded = migrateLayout(layout([widget("a", 0, "g"), widget("b", 200, "h"), widget("c", 400, "h")]));
    expect(loaded?.widgets.map((w) => w.group)).toEqual([undefined, "h", "h"]);
  });

  it("moves a group by one block when reordering inside it", () => {
    load([widget("a", 0, "g"), widget("b", 200, "g"), widget("c", 400)]);
    useEditor.getState().reorder("b", "front");
    useEditor.getState().reorder("a", "back");
    expect(widgets().map((w) => w.id)).toEqual(["a", "b", "c"]);
    useEditor.getState().reorderGroup("g", "forward");
    expect(widgets().map((w) => w.id)).toEqual(["c", "a", "b"]);
  });
});

describe("spacing", () => {
  it("sets the gap between objects, a group counting as one", () => {
    load([widget("a", 0), widget("b", 300, "g"), widget("c", 420, "g"), widget("d", 900)], ["a", "b", "c", "d"]);
    useEditor.getState().spaceSelected("x", 20);
    // Group g spans 300..520 and moves as a whole: g (220 wide) starts at 120 and d at 360.
    expect([left("a"), left("b"), left("c"), left("d")]).toEqual([0, 120, 240, 360]);
  });

  it("distributes evenly between the outermost objects", () => {
    load([widget("a", 0), widget("b", 130), widget("c", 400)], ["a", "b", "c"]);
    useEditor.getState().distributeSelected("x");
    expect([left("a"), left("b"), left("c")]).toEqual([0, 200, 400]);
  });

  it("leaves locked objects where they are", () => {
    load([widget("a", 0), { ...widget("b", 130), locked: true }, widget("c", 400)], ["a", "b", "c"]);
    useEditor.getState().spaceSelected("x", 10);
    expect([left("a"), left("b"), left("c")]).toEqual([0, 130, 110]);
  });

  it("records one undo step for typed gap edits in a row", () => {
    load([widget("a", 0), widget("b", 300)], ["a", "b"]);
    const ed = useEditor.getState();
    ed.spaceSelected("x", 5);
    ed.spaceSelected("x", 50);
    useEditor.getState().undo();
    expect(left("b")).toBe(300);
  });
});
