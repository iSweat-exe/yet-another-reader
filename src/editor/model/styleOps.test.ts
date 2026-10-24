import { beforeEach, describe, expect, it } from "vitest";
import type { Layout, WidgetInstance } from "../../overlay/model/layout";
import { useEditor } from "../useEditor";

const widget = (id: string, extra: Partial<WidgetInstance> = {}): WidgetInstance => ({ id, type: "score", anchor: "top-left", x: 0, y: 0, w: 100, h: 50, pages: ["playing"], ...extra });
const layout = (widgets: WidgetInstance[]): Layout => ({ version: 2, name: "test", referenceHeight: 1080, widgets });
const load = (widgets: WidgetInstance[], selection: string[]) => useEditor.setState({ doc: layout(widgets), selection, past: [], future: [], page: "playing", styleClipboard: null });
const byId = (id: string) => useEditor.getState().doc.widgets.find((w) => w.id === id) as WidgetInstance;

describe("copy and paste style", () => {
  beforeEach(() => load([widget("a", { style: { color: "#ff0000", scale: 1.5, font: "mono" } }), widget("b"), widget("c", { locked: true })], ["a"]));

  it("gives the copied style to the selected widgets", () => {
    useEditor.getState().copyStyle();
    useEditor.setState({ selection: ["b"] });
    useEditor.getState().pasteStyle();
    expect(byId("b").style).toEqual({ color: "#ff0000", scale: 1.5, font: "mono" });
  });

  it("copies the style of the first selected widget", () => {
    useEditor.setState({ selection: ["b", "a"] });
    useEditor.getState().copyStyle();
    expect(useEditor.getState().styleClipboard).toEqual({});
  });

  it("leaves locked widgets alone", () => {
    useEditor.getState().copyStyle();
    useEditor.setState({ selection: ["b", "c"] });
    useEditor.getState().pasteStyle();
    expect(byId("b").style?.color).toBe("#ff0000");
    expect(byId("c").style).toBeUndefined();
  });

  it("does nothing without a copied style", () => {
    useEditor.setState({ selection: ["b"] });
    useEditor.getState().pasteStyle();
    expect(byId("b").style).toBeUndefined();
  });

  it("does not share the copied object between widgets", () => {
    useEditor.getState().copyStyle();
    useEditor.setState({ selection: ["b", "c"].slice(0, 1) });
    useEditor.getState().pasteStyle();
    expect(byId("b").style).not.toBe(byId("a").style);
  });
});

describe("match size", () => {
  beforeEach(() => load([widget("a", { w: 300, h: 80 }), widget("b", { w: 100, h: 50 }), widget("c", { w: 120, h: 60, locked: true })], ["a", "b", "c"]));

  it("copies the width of the first selected widget", () => {
    useEditor.getState().matchSize("w");
    expect(byId("b")).toMatchObject({ w: 300, h: 50 });
  });

  it("copies the height", () => {
    useEditor.getState().matchSize("h");
    expect(byId("b")).toMatchObject({ w: 100, h: 80 });
  });

  it("copies both, except for locked widgets", () => {
    useEditor.getState().matchSize("both");
    expect(byId("b")).toMatchObject({ w: 300, h: 80 });
    expect(byId("c")).toMatchObject({ w: 120, h: 60 });
  });

  it("needs at least two selected widgets", () => {
    useEditor.setState({ selection: ["b"] });
    useEditor.getState().matchSize("both");
    expect(byId("b")).toMatchObject({ w: 100, h: 50 });
  });
});
