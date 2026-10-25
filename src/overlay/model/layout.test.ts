import { describe, expect, it } from "vitest";
import {
  type Layout,
  alignFromAnchor,
  anchorForPosition,
  withAutoAnchor,
  type WidgetInstance,
  classicLayout,
  migrateLayout,
  nearestAnchor,
  normalizeRotation,
  resolveRect,
  uniqueId,
  withAnchor,
  withPosition,
  withRect,
} from "./layout";

const widget = (over: Partial<WidgetInstance> = {}): WidgetInstance => ({
  id: "w",
  type: "score",
  anchor: "top-left",
  x: 10,
  y: 20,
  w: 100,
  h: 40,
  pages: ["playing"],
  ...over,
});

describe("resolveRect", () => {
  it("places a top-left widget at its offsets", () => {
    expect(resolveRect(widget(), 1920, 1080)).toEqual({ left: 10, top: 20, width: 100, height: 40 });
  });

  it("measures offsets inward from the right and bottom edges", () => {
    const r = resolveRect(widget({ anchor: "bottom-right", x: 30, y: 40 }), 1920, 1080);
    expect(r.left).toBe(1920 - 100 - 30);
    expect(r.top).toBe(1080 - 40 - 40);
  });

  it("centres on centred axes and treats offsets as signed", () => {
    const r = resolveRect(widget({ anchor: "center", x: 5, y: -10 }), 2560, 1080);
    expect(r.left).toBe((2560 - 100) / 2 + 5);
    expect(r.top).toBe((1080 - 40) / 2 - 10);
  });

  it("keeps a right-anchored widget on the edge when the screen gets wider", () => {
    const wide = resolveRect(widget({ anchor: "top-right", x: 30 }), 2560, 1080);
    const narrow = resolveRect(widget({ anchor: "top-right", x: 30 }), 1920, 1080);
    expect(wide.left + wide.width).toBe(2560 - 30);
    expect(narrow.left + narrow.width).toBe(1920 - 30);
  });
});

describe("withPosition / withAnchor", () => {
  it("round-trips a position for every anchor", () => {
    for (const anchor of ["top-left", "top", "top-right", "left", "center", "right", "bottom-left", "bottom", "bottom-right"] as const) {
      const placed = withPosition(widget({ anchor }), 321, 123, 1920, 1080);
      const rect = resolveRect(placed, 1920, 1080);
      expect([rect.left, rect.top]).toEqual([321, 123]);
    }
  });

  it("re-anchors without moving the widget on screen", () => {
    const before = resolveRect(widget({ x: 400, y: 300 }), 1920, 1080);
    const moved = withAnchor(widget({ x: 400, y: 300 }), "bottom-right", 1920, 1080);
    expect(moved.anchor).toBe("bottom-right");
    expect(resolveRect(moved, 1920, 1080)).toEqual(before);
  });

  it("applies a new rectangle (size and position)", () => {
    const next = withRect(widget({ anchor: "top-right" }), { left: 1500, top: 50, width: 200, height: 80 }, 1920, 1080);
    expect(resolveRect(next, 1920, 1080)).toEqual({ left: 1500, top: 50, width: 200, height: 80 });
  });
});

describe("nearestAnchor", () => {
  it("picks the region holding the rectangle's centre", () => {
    expect(nearestAnchor({ left: 0, top: 0, width: 100, height: 100 }, 1920, 1080)).toBe("top-left");
    expect(nearestAnchor({ left: 1800, top: 1000, width: 100, height: 60 }, 1920, 1080)).toBe("bottom-right");
    expect(nearestAnchor({ left: 900, top: 500, width: 100, height: 60 }, 1920, 1080)).toBe("center");
    expect(nearestAnchor({ left: 900, top: 0, width: 100, height: 60 }, 1920, 1080)).toBe("top");
    expect(nearestAnchor({ left: 0, top: 500, width: 100, height: 60 }, 1920, 1080)).toBe("left");
  });
});

describe("migrateLayout", () => {
  it("converts version 1 absolute positions to top-left anchors", () => {
    const migrated = migrateLayout({ version: 1, name: "old", widgets: [{ id: "a", type: "score", x: 5, y: 6, w: 7, h: 8 }] });
    expect(migrated?.version).toBe(2);
    expect(migrated?.widgets[0]).toMatchObject({ anchor: "top-left", x: 5, y: 6, w: 7, h: 8 });
  });

  it("rejects documents that are not layouts", () => {
    expect(migrateLayout(null)).toBeNull();
    expect(migrateLayout({ version: 3, widgets: [] })).toBeNull();
    expect(migrateLayout({ version: 2 })).toBeNull();
  });

  it("drops invalid widgets and de-duplicates ids", () => {
    const layout = migrateLayout({
      version: 2,
      widgets: [{ id: "a", type: "score" }, { id: "a", type: "combo" }, { nope: true }],
    }) as Layout;
    expect(layout.widgets.map((w) => w.id)).toEqual(["a", "a-2"]);
  });

  it("keeps the classic preset valid", () => {
    expect(migrateLayout(classicLayout())?.widgets.length).toBe(classicLayout().widgets.length);
  });
});

describe("uniqueId", () => {
  it("adds a numeric suffix when the id is taken", () => {
    const layout = classicLayout();
    expect(uniqueId(layout, "score")).toBe("score-2");
    expect(uniqueId(layout, "fresh")).toBe("fresh");
  });
});

describe("auto anchor", () => {
  it("anchors a widget near the right edge to the right, without moving it", () => {
    const placed = withPosition(widget({ w: 200, h: 50 }), 1650, 40, 1920, 1080);
    const auto = withAutoAnchor(placed, 1920, 1080);
    expect(auto.anchor).toBe("top-right");
    expect(resolveRect(auto, 1920, 1080)).toEqual(resolveRect(placed, 1920, 1080));
  });

  it("picks the corner, edge or centre the widget sits in", () => {
    expect(anchorForPosition(widget({ x: 20, y: 1000 }), 1920, 1080)).toBe("bottom-left");
    expect(anchorForPosition(widget({ x: 900, y: 500 }), 1920, 1080)).toBe("center");
    expect(anchorForPosition(widget({ x: 900, y: 10 }), 1920, 1080)).toBe("top");
  });

  it("leaves a hand-picked anchor alone", () => {
    const locked = widget({ anchor: "bottom-left", anchorLocked: true, x: 1800, y: 5 });
    expect(withAutoAnchor(locked, 1920, 1080)).toBe(locked);
  });

  it("returns the same object when the anchor is already right", () => {
    const w = widget({ anchor: "top-left", x: 10, y: 10 });
    expect(withAutoAnchor(w, 1920, 1080)).toBe(w);
  });

  it("keeps the widget on its edge when the screen gets wider", () => {
    const auto = withAutoAnchor(withPosition(widget({ w: 200 }), 1650, 40, 1920, 1080), 1920, 1080);
    const wide = resolveRect(auto, 2560, 1080);
    expect(wide.left + wide.width).toBe(2560 - 70);
  });
});

describe("alignFromAnchor", () => {
  it("makes text hug the edge the widget is attached to", () => {
    expect(alignFromAnchor("top-left")).toBe("left");
    expect(alignFromAnchor("bottom-right")).toBe("right");
    expect(alignFromAnchor("top")).toBe("center");
    expect(alignFromAnchor("left")).toBe("left");
    expect(alignFromAnchor("center")).toBe("center");
  });
});

describe("rotation", () => {
  const doc = (extra: Record<string, unknown>) => ({ version: 2, name: "t", widgets: [{ id: "a", type: "score", anchor: "top-left", x: 0, y: 0, w: 10, h: 10, pages: ["playing"], ...extra }] });

  it("is absent on layouts written before rotation existed", () => {
    expect(migrateLayout(doc({}))?.widgets[0].rotation).toBeUndefined();
    expect("rotation" in (migrateLayout(doc({}))?.widgets[0] ?? {})).toBe(false);
  });

  it("is kept, wrapped to (-180, 180]", () => {
    expect(migrateLayout(doc({ rotation: 30 }))?.widgets[0].rotation).toBe(30);
    expect(migrateLayout(doc({ rotation: 270 }))?.widgets[0].rotation).toBe(-90);
    expect(migrateLayout(doc({ rotation: -190 }))?.widgets[0].rotation).toBe(170);
    expect(migrateLayout(doc({ rotation: 180 }))?.widgets[0].rotation).toBe(180);
    expect(migrateLayout(doc({ rotation: 12.3456 }))?.widgets[0].rotation).toBe(12.35);
  });

  it("drops zero, NaN, infinities and non-numbers", () => {
    for (const rotation of [0, 360, -0, Number.NaN, Infinity, -Infinity, "45", null, {}, []]) {
      expect(migrateLayout(doc({ rotation }))?.widgets[0].rotation).toBeUndefined();
    }
  });

  it("does not move the rectangle of the widget", () => {
    const turned = migrateLayout(doc({ rotation: 45, x: 20, y: 30, w: 100, h: 40 }))?.widgets[0];
    expect(resolveRect(turned as WidgetInstance, 1920, 1080)).toEqual({ left: 20, top: 30, width: 100, height: 40 });
  });

  it("survives a JSON round trip", () => {
    const first = migrateLayout(doc({ rotation: -33.5 })) as Layout;
    expect(migrateLayout(JSON.parse(JSON.stringify(first)))).toEqual(first);
  });

  it("normalizeRotation is NaN safe", () => {
    expect(normalizeRotation(Number.NaN)).toBe(0);
    expect(normalizeRotation(undefined)).toBe(0);
    expect(normalizeRotation(540)).toBe(180);
  });
});
