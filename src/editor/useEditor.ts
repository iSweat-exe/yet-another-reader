import { create } from "zustand";
import {
  type Layout,
  type WidgetInstance,
  expandGroups,
  newGroupId,
  normalizeRotation,
  presetLayout,
  resolveRect,
  uniqueId,
  withPosition,
  withoutLoneGroups,
} from "../overlay/layout";
import type { Page } from "../overlay/pages";
import { createLibrary, type LibraryState } from "./layoutLibrary";
import { moveUnit as moveUnitIn, type Placement } from "./layerOrder";
import { type BackgroundId, DEFAULT_BACKGROUND, isBackgroundId } from "./backgrounds";
import { type Aspect, regroup, viewWidthOf, withAutoAnchors } from "./layoutOps";
import { type AlignMode, type Axis, type Unit, alignedPosition, boundingBox, distributionShifts, spacingShifts, unitsOf } from "./geometry";

// Kept importable from here: the rest of the editor reads these through the store module.
export { ASPECTS, type Aspect, isValidLayoutName, viewWidthOf } from "./layoutOps";
export { isDirty } from "./layoutLibrary";

const HISTORY_LIMIT = 100;

const BACKGROUND_KEY = "yar.editor.background";

function storedBackground(): BackgroundId {
  try {
    const saved = localStorage.getItem(BACKGROUND_KEY);
    return isBackgroundId(saved) ? saved : DEFAULT_BACKGROUND;
  } catch {
    return DEFAULT_BACKGROUND;
  }
}

const GRID_KEY = "yar.editor.gridSize";
export const GRID_SIZE = { min: 2, max: 200, default: 10 } as const;

/** A grid size brought into its range, in whole pixels. */
export const clampGridSize = (size: number) => (Number.isFinite(size) ? Math.min(GRID_SIZE.max, Math.max(GRID_SIZE.min, Math.round(size))) : GRID_SIZE.default);

/** The grid size the user chose last time (the app default when none, or when storage is unavailable). */
function storedGridSize(): number {
  try {
    const saved = localStorage.getItem(GRID_KEY);
    return saved === null ? GRID_SIZE.default : clampGridSize(Number(saved));
  } catch {
    return GRID_SIZE.default;
  }
}
/** What to add from the palette. */
export interface NewWidget {
  type: string;
  widget?: string;
  name?: string;
  size: { w: number; h: number };
  options?: Record<string, unknown>;
}

interface EditorState extends LibraryState {
  doc: Layout;
  selection: string[];
  past: Layout[];
  future: Layout[];
  clipboard: WidgetInstance[];
  /** Layout at the start of the current drag/resize, to record one undo step per gesture. */
  gestureStart: Layout | null;
  autosave: boolean;
  snap: boolean;
  showGrid: boolean;
  /** Distance between two grid lines, in layout pixels (what a move snaps to while the grid is shown). */
  gridSize: number;
  /** The command palette (Ctrl+K) is open. */
  commandOpen: boolean;
  /** What is drawn behind the overlay in the preview (remembered between sessions). */
  background: BackgroundId;
  aspect: Aspect;
  dataSource: "mock" | "live";
  /** The page being edited: the canvas and the layers show the widgets of this page. */
  page: Page;
  /** Selects widgets; a group is always taken whole unless `exact` (picking one member in the layers). */
  select: (ids: string[], additive?: boolean, exact?: boolean) => void;
  commit: (next: Layout, key?: string) => void;
  beginGesture: () => void;
  liveUpdate: (next: Layout) => void;
  endGesture: () => void;
  /** Abandons the gesture in progress (Escape): the layout goes back to how it was, with no undo entry. */
  cancelGesture: () => void;
  undo: () => void;
  redo: () => void;

  /** Adds a widget; `at` (layout pixels) is where its centre lands, otherwise the middle of the screen. */
  addWidget: (spec: NewWidget, at?: { x: number; y: number }) => void;
  /** Moves a unit of the layers list (a widget or a whole group) next to another one, in front of it or behind it. */
  moveUnit: (ids: readonly string[], target: readonly string[], placement: Placement) => void;
  updateWidget: (id: string, patch: Partial<WidgetInstance>) => void;
  removeSelected: () => void;
  duplicateSelected: () => void;
  copySelected: () => void;
  paste: () => void;
  nudge: (dx: number, dy: number) => void;
  reorder: (id: string, to: "front" | "back" | "forward" | "backward") => void;
  alignSelected: (mode: AlignMode) => void;
  /** Sets the gap between the selected objects (a group counts as one) along an axis. */
  spaceSelected: (axis: Axis, gap: number) => void;
  /** Spreads the selected objects so the gaps are equal, the two outermost staying put. */
  distributeSelected: (axis: Axis) => void;
  groupSelected: () => void;
  ungroupSelected: () => void;
  reorderGroup: (group: string, to: "forward" | "backward") => void;
  setLocked: (ids: string[], locked: boolean) => void;
  /** Sets the rotation (degrees) of the widgets `ids`, each around its own centre; 0 removes it. One undo step. */
  setRotation: (ids: string[], rotation: number) => void;

  setToggle: (key: "autosave" | "snap" | "showGrid", value: boolean) => void;
  setGridSize: (size: number) => void;
  setCommandOpen: (open: boolean) => void;
  setBackground: (background: BackgroundId) => void;
  setAspect: (aspect: Aspect) => void;
  setDataSource: (source: "mock" | "live") => void;
  setPage: (page: Page) => void;
}

/** Structural equality by value, for the few places that need it (a no-op edit, the widgets a gesture touched). */
const layoutKey = (layout: Layout) => JSON.stringify(layout);
const widgetKey = (widget: WidgetInstance) => JSON.stringify(widget);


/** Edits of the same field closer together than this form a single undo step. */
const COALESCE_MS = 800;

export const useEditor = create<EditorState>((set, get) => {
  let lastKey: string | null = null;
  let lastAt = 0;

  /** Replaces the document, recording the previous one in the undo history. */
  const commit = (next: Layout, key?: string) => {
    const { doc, past } = get();
    if (layoutKey(next) === layoutKey(doc)) return;
    const now = Date.now();
    const merge = key !== undefined && key === lastKey && now - lastAt < COALESCE_MS && past.length > 0;
    lastKey = key ?? null;
    lastAt = now;
    if (merge) return set({ doc: next, future: [] });
    set({ doc: next, past: [...past.slice(-(HISTORY_LIMIT - 1)), doc], future: [] });
  };

  const patchWidgets = (fn: (widgets: WidgetInstance[]) => WidgetInstance[], key?: string) => {
    const { doc } = get();
    commit({ ...doc, widgets: fn(doc.widgets) }, key);
  };

  /** The selected objects that can be moved: a group counts as one and is left out if any member is locked. */
  const movableUnits = ({ doc, selection, aspect }: Pick<EditorState, "doc" | "selection" | "aspect">): Unit[] => {
    const locked = new Set(doc.widgets.filter((w) => w.locked).map((w) => w.id));
    return unitsOf(
      doc.widgets.filter((w) => selection.includes(w.id)),
      viewWidthOf(doc, aspect),
      doc.referenceHeight,
    ).filter((u) => !u.ids.some((id) => locked.has(id)));
  };

  /** Moves each object by its own offset (`deltas` is in the order of `units`); all members of a group move together. */
  const moveUnits = (units: Unit[], deltas: { dx: number; dy: number }[], key?: string) => {
    const { doc, aspect } = get();
    const viewWidth = viewWidthOf(doc, aspect);
    const byId = new Map<string, { dx: number; dy: number }>();
    units.forEach((u, i) => u.ids.forEach((id) => byId.set(id, deltas[i])));
    const moved = {
      ...doc,
      widgets: doc.widgets.map((w) => {
        const d = byId.get(w.id);
        if (!d) return w;
        const rect = resolveRect(w, viewWidth, doc.referenceHeight);
        return withPosition(w, rect.left + d.dx, rect.top + d.dy, viewWidth, doc.referenceHeight);
      }),
    };
    commit(withAutoAnchors(moved, new Set(byId.keys()), aspect), key);
  };

  return {
    doc: presetLayout("classic", "default"),
    selection: [],
    past: [],
    future: [],
    clipboard: [],
    gestureStart: null,
    autosave: true,
    snap: true,
    showGrid: false,
    gridSize: storedGridSize(),
    commandOpen: false,
    background: storedBackground(),
    aspect: "16:9",
    dataSource: "mock",
    page: "playing",

    select: (ids, additive = false, exact = false) => {
      const { selection: current, doc, page } = get();
      if (!exact) ids = expandGroups(doc.widgets, ids, page);
      if (!additive) return set({ selection: ids });
      const toggled = ids.every((id) => current.includes(id)) ? current.filter((id) => !ids.includes(id)) : [...new Set([...current, ...ids])];
      set({ selection: toggled });
    },

    commit,
    beginGesture: () => set({ gestureStart: get().doc }),
    liveUpdate: (next) => set({ doc: next }),
    endGesture: () => {
      const { gestureStart, doc, past, aspect } = get();
      if (gestureStart && layoutKey(gestureStart) !== layoutKey(doc)) {
        // Only the widgets the gesture touched are re-anchored.
        const before = new Map(gestureStart.widgets.map((w) => [w.id, widgetKey(w)]));
        const moved = new Set(doc.widgets.filter((w) => before.get(w.id) !== widgetKey(w)).map((w) => w.id));
        set({ doc: withAutoAnchors(doc, moved, aspect), past: [...past.slice(-(HISTORY_LIMIT - 1)), gestureStart], future: [] });
      }
      set({ gestureStart: null });
    },
    cancelGesture: () => {
      const { gestureStart } = get();
      set(gestureStart ? { doc: gestureStart, gestureStart: null } : { gestureStart: null });
    },
    undo: () => {
      const { past, future, doc, selection } = get();
      const previous = past[past.length - 1];
      if (!previous) return;
      const ids = new Set(previous.widgets.map((w) => w.id));
      set({ doc: previous, past: past.slice(0, -1), future: [doc, ...future], selection: selection.filter((id) => ids.has(id)) });
    },
    redo: () => {
      const { past, future, doc, selection } = get();
      const [next, ...rest] = future;
      if (!next) return;
      const ids = new Set(next.widgets.map((w) => w.id));
      set({ doc: next, past: [...past, doc], future: rest, selection: selection.filter((id) => ids.has(id)) });
    },

    addWidget: (spec, at) => {
      const { doc } = get();
      const id = uniqueId(doc, spec.widget ?? spec.type);
      const widget: WidgetInstance = {
        id,
        type: spec.type,
        anchor: "center",
        x: 0,
        y: 0,
        w: spec.size.w,
        h: spec.size.h,
        pages: [get().page],
        style: spec.type === "web" ? undefined : { color: "#ffffff" },
      };
      if (spec.widget) widget.widget = spec.widget;
      if (spec.name) widget.name = spec.name;
      if (spec.options) widget.options = spec.options;
      const { aspect } = get();
      const viewWidth = viewWidthOf(doc, aspect);
      const placed = at ? withPosition(widget, at.x - widget.w / 2, at.y - widget.h / 2, viewWidth, doc.referenceHeight) : widget;
      commit(withAutoAnchors({ ...doc, widgets: [...doc.widgets, placed] }, new Set([id]), aspect));
      set({ selection: [id] });
    },
    moveUnit: (ids, target, placement) => patchWidgets((ws) => moveUnitIn(ws, ids, target, placement)),
    updateWidget: (id, patch) => patchWidgets((ws) => ws.map((w) => (w.id === id ? { ...w, ...patch } : w)), `${id}:${Object.keys(patch).join(",")}`),
    removeSelected: () => {
      const { selection } = get();
      if (selection.length === 0) return;
      patchWidgets((ws) => withoutLoneGroups(ws.filter((w) => !selection.includes(w.id) || w.locked)));
      set({ selection: [] });
    },
    duplicateSelected: () => {
      const { doc, selection } = get();
      const copies: WidgetInstance[] = [];
      let working = doc;
      for (const w of doc.widgets.filter((x) => selection.includes(x.id))) {
        const id = uniqueId(working, w.id.replace(/-\d+$/, ""));
        const copy = { ...w, id, x: w.x + 20, y: w.y + 20, locked: undefined };
        copies.push(copy);
        working = { ...working, widgets: [...working.widgets, copy] };
      }
      if (copies.length === 0) return;
      const ids = copies.map((c) => c.id);
      commit(withAutoAnchors({ ...working, widgets: regroup(working.widgets, new Set(ids)) }, new Set(ids), get().aspect));
      set({ selection: ids });
    },
    copySelected: () => {
      const { doc, selection } = get();
      set({ clipboard: doc.widgets.filter((w) => selection.includes(w.id)).map((w) => structuredClone(w)) });
    },
    paste: () => {
      const { doc, clipboard } = get();
      let working = doc;
      const ids: string[] = [];
      for (const w of clipboard) {
        const id = uniqueId(working, w.id.replace(/-\d+$/, ""));
        ids.push(id);
        working = { ...working, widgets: [...working.widgets, { ...structuredClone(w), id, x: w.x + 20, y: w.y + 20, locked: undefined }] };
      }
      if (ids.length === 0) return;
      commit(withAutoAnchors({ ...working, widgets: regroup(working.widgets, new Set(ids)) }, new Set(ids), get().aspect));
      set({ selection: ids });
    },
    nudge: (dx, dy) => {
      const { doc, selection, aspect } = get();
      const viewWidth = viewWidthOf(doc, aspect);
      const moved = new Set(selection);
      commit(
        withAutoAnchors(
          {
            ...doc,
            widgets: doc.widgets.map((w) => {
              if (!moved.has(w.id) || w.locked) return w;
              const rect = resolveRect(w, viewWidth, doc.referenceHeight);
              return withPosition(w, rect.left + dx, rect.top + dy, viewWidth, doc.referenceHeight);
            }),
          },
          moved,
          aspect,
        ),
        "nudge",
      );
    },
    reorder: (id, to) =>
      patchWidgets((ws) => {
        const from = ws.findIndex((w) => w.id === id);
        if (from < 0) return ws;
        // A grouped widget moves inside its group only: the group stays one block.
        const group = ws[from].group;
        const members = group ? ws.map((w, i) => (w.group === group ? i : -1)).filter((i) => i >= 0) : [];
        const lo = group ? Math.min(...members) : 0;
        const hi = group ? Math.max(...members) : ws.length - 1;
        const target = to === "front" ? hi : to === "back" ? lo : Math.min(hi, Math.max(lo, from + (to === "forward" ? 1 : -1)));
        if (target === from) return ws;
        const next = [...ws];
        const [item] = next.splice(from, 1);
        next.splice(target, 0, item);
        return next;
      }),
    alignSelected: (mode) => {
      const { doc, aspect } = get();
      const units = movableUnits(get());
      if (units.length === 0) return;
      // One object aligns to the screen; several align to their common bounding box.
      const target = units.length === 1 ? { left: 0, top: 0, width: viewWidthOf(doc, aspect), height: doc.referenceHeight } : boundingBox(units.map((u) => u.rect));
      moveUnits(
        units,
        units.map((u) => {
          const { left, top } = alignedPosition(u.rect, target, mode);
          return { dx: left - u.rect.left, dy: top - u.rect.top };
        }),
      );
    },
    spaceSelected: (axis, gap) => {
      const units = movableUnits(get());
      if (units.length < 2) return;
      const shifts = spacingShifts(
        units.map((u) => u.rect),
        axis,
        gap,
      );
      moveUnits(units, shifts.map((s) => (axis === "x" ? { dx: s, dy: 0 } : { dx: 0, dy: s })), `space-${axis}`);
    },
    distributeSelected: (axis) => {
      const units = movableUnits(get());
      if (units.length < 3) return;
      const shifts = distributionShifts(
        units.map((u) => u.rect),
        axis,
      );
      moveUnits(units, shifts.map((s) => (axis === "x" ? { dx: s, dy: 0 } : { dx: 0, dy: s })));
    },
    groupSelected: () => {
      const { doc, selection } = get();
      const chosen = new Set(doc.widgets.filter((w) => selection.includes(w.id)).map((w) => w.id));
      if (chosen.size < 2) return;
      const group = newGroupId(doc.widgets);
      const marked = doc.widgets.map((w) => (chosen.has(w.id) ? { ...w, group } : w));
      // The members become one block of the stack, at the place of the topmost of them.
      const members = marked.filter((w) => w.group === group);
      const top = marked.map((w) => w.group).lastIndexOf(group);
      const stacked = marked.flatMap((w, i) => (w.group !== group ? [w] : i === top ? members : []));
      commit({ ...doc, widgets: withoutLoneGroups(stacked) });
    },
    ungroupSelected: () => {
      const { doc, selection } = get();
      const groups = new Set(doc.widgets.filter((w) => selection.includes(w.id) && w.group).map((w) => w.group));
      if (groups.size === 0) return;
      commit({
        ...doc,
        widgets: doc.widgets.map((w) => {
          if (!w.group || !groups.has(w.group)) return w;
          const { group: _released, ...rest } = w;
          return rest;
        }),
      });
    },
    reorderGroup: (group, to) =>
      patchWidgets((ws) => {
        const first = ws.findIndex((w) => w.group === group);
        if (first < 0) return ws;
        const members = ws.filter((w) => w.group === group);
        const rest = ws.filter((w) => w.group !== group);
        const at = ws.slice(0, first).filter((w) => w.group !== group).length + (to === "forward" ? 1 : -1);
        if (at < 0 || at > rest.length) return ws;
        return [...rest.slice(0, at), ...members, ...rest.slice(at)];
      }),
    setLocked: (ids, locked) => patchWidgets((ws) => ws.map((w) => (ids.includes(w.id) ? { ...w, locked: locked || undefined } : w))),

    setRotation: (ids, rotation) => {
      const next = normalizeRotation(rotation);
      patchWidgets((ws) =>
        ws.map((w) => {
          if (!ids.includes(w.id) || w.locked) return w;
          const { rotation: _old, ...rest } = w;
          return next === 0 ? rest : { ...rest, rotation: next };
        }),
      );
    },

    setToggle: (key, value) => set({ [key]: value }),
    setBackground: (background) => {
      set({ background });
      try {
        localStorage.setItem(BACKGROUND_KEY, background);
      } catch {
        /* not remembered */
      }
    },
    setCommandOpen: (commandOpen) => set({ commandOpen }),
    setGridSize: (size) => {
      const gridSize = clampGridSize(size);
      set({ gridSize });
      try {
        localStorage.setItem(GRID_KEY, String(gridSize));
      } catch {
        /* not remembered */
      }
    },
    setAspect: (aspect) => set({ aspect }),
    setDataSource: (dataSource) => set({ dataSource }),
    setPage: (page) => {
      // Widgets of the previous page are no longer on screen, so they cannot stay selected.
      const { doc, selection } = get();
      const onPage = new Set(doc.widgets.filter((w) => w.pages.includes(page)).map((w) => w.id));
      set({ page, selection: selection.filter((id) => onPage.has(id)) });
    },

    ...createLibrary(set, get),
  };
});
