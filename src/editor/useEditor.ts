import { create } from "zustand";
import { deleteLayout as deleteStored, listLayouts, loadLayout, saveLayout } from "../lib/layoutApi";
import { saveSettings, useReaderStore } from "../lib/store";
import {
  type Layout,
  type PresetId,
  type WidgetInstance,
  expandGroups,
  migrateLayout,
  newGroupId,
  presetLayout,
  resolveRect,
  uniqueId,
  withAutoAnchor,
  withPosition,
  withoutLoneGroups,
} from "../overlay/layout";
import type { Page } from "../overlay/pages";
import { type AlignMode, type Axis, type Unit, alignedPosition, boundingBox, distributionShifts, spacingShifts, unitsOf } from "./geometry";

export type Aspect = "16:9" | "21:9" | "16:10" | "4:3" | "32:9";

export const ASPECTS: Record<Aspect, number> = { "16:9": 16 / 9, "21:9": 21 / 9, "16:10": 16 / 10, "4:3": 4 / 3, "32:9": 32 / 9 };

const HISTORY_LIMIT = 100;
const NAME_PATTERN = /^[\p{L}\p{N} _-]{1,40}$/u;

export const isValidLayoutName = (name: string) => NAME_PATTERN.test(name) && name === name.trim();

/** What to add from the palette. */
export interface NewWidget {
  type: string;
  widget?: string;
  name?: string;
  size: { w: number; h: number };
  options?: Record<string, unknown>;
}

interface EditorState {
  ready: boolean;
  layouts: string[];
  name: string;
  doc: Layout;
  savedJson: string;
  selection: string[];
  past: Layout[];
  future: Layout[];
  clipboard: WidgetInstance[];
  /** Layout at the start of the current drag/resize, to record one undo step per gesture. */
  gestureStart: Layout | null;
  autosave: boolean;
  snap: boolean;
  showGrid: boolean;
  aspect: Aspect;
  dataSource: "mock" | "live";
  /** The page being edited: the canvas and the layers show the widgets of this page. */
  page: Page;
  saving: boolean;
  error: string | null;

  init: (active: string) => Promise<void>;
  setError: (message: string | null) => void;

  /** Selects widgets; a group is always taken whole unless `exact` (picking one member in the layers). */
  select: (ids: string[], additive?: boolean, exact?: boolean) => void;
  commit: (next: Layout, key?: string) => void;
  beginGesture: () => void;
  liveUpdate: (next: Layout) => void;
  endGesture: () => void;
  undo: () => void;
  redo: () => void;

  addWidget: (spec: NewWidget) => void;
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

  setToggle: (key: "autosave" | "snap" | "showGrid", value: boolean) => void;
  setAspect: (aspect: Aspect) => void;
  setDataSource: (source: "mock" | "live") => void;
  setPage: (page: Page) => void;

  save: () => Promise<void>;
  openLayout: (name: string) => Promise<void>;
  createLayout: (name: string, preset: PresetId) => Promise<string | null>;
  duplicateLayout: (name: string) => Promise<string | null>;
  renameLayout: (name: string) => Promise<string | null>;
  removeLayout: (name: string) => Promise<void>;
  importLayout: (text: string, name: string) => Promise<string | null>;
  exportLayout: () => string;
  useAsActive: () => Promise<void>;
}

/** Gives the copies in `fresh` groups of their own, so duplicating a group does not merge it with the original. */
const regroup = (widgets: WidgetInstance[], fresh: ReadonlySet<string>): WidgetInstance[] => {
  const renamed = new Map<string, string>();
  const taken = [...widgets];
  return withoutLoneGroups(
    widgets.map((w) => {
      if (!fresh.has(w.id) || !w.group) return w;
      let group = renamed.get(w.group);
      if (!group) {
        group = newGroupId(taken);
        renamed.set(w.group, group);
        taken.push({ ...w, group });
      }
      return { ...w, group };
    }),
  );
};

const json = (layout: Layout) => JSON.stringify(layout);
const json2 = (widget: WidgetInstance) => JSON.stringify(widget);

/** Width of the previewed screen, in layout pixels. */
export const viewWidthOf = (doc: Layout, aspect: Aspect) => Math.round(doc.referenceHeight * ASPECTS[aspect]);

/**
 * Re-anchors the widgets `ids` to where they sit now, so the layout keeps its meaning on other
 * screen shapes without the user having to think about anchors. Widgets whose anchor was set by
 * hand are left alone.
 */
const withAutoAnchors = (doc: Layout, ids: ReadonlySet<string>, aspect: Aspect): Layout => {
  const viewWidth = viewWidthOf(doc, aspect);
  return { ...doc, widgets: doc.widgets.map((w) => (ids.has(w.id) ? withAutoAnchor(w, viewWidth, doc.referenceHeight) : w)) };
};

export const isDirty = (s: Pick<EditorState, "doc" | "savedJson">) => json(s.doc) !== s.savedJson;

/** Edits of the same field closer together than this form a single undo step. */
const COALESCE_MS = 800;

export const useEditor = create<EditorState>((set, get) => {
  let lastKey: string | null = null;
  let lastAt = 0;

  /** Replaces the document, recording the previous one in the undo history. */
  const commit = (next: Layout, key?: string) => {
    const { doc, past } = get();
    if (json(next) === json(doc)) return;
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

  /** Loads a layout into the editor (the caller has already dealt with unsaved changes). */
  const open = async (name: string) => {
    const doc = await loadLayout(name);
    const layouts = await listLayouts(useReaderStore.getState().settings?.activeLayout ?? "default");
    set({
      name,
      doc: { ...doc, name },
      savedJson: json({ ...doc, name }),
      layouts: layouts.includes(name) ? layouts : [...layouts, name].sort((a, b) => a.localeCompare(b)),
      selection: [],
      past: [],
      future: [],
      gestureStart: null,
    });
  };

  const persist = async (name: string, doc: Layout) => {
    await saveLayout(name, { ...doc, name });
  };

  const guard = async (action: () => Promise<void>): Promise<string | null> => {
    try {
      await action();
      return null;
    } catch (e) {
      const message = String(e);
      set({ error: message });
      return message;
    }
  };

  return {
    ready: false,
    layouts: [],
    name: "default",
    doc: presetLayout("classic", "default"),
    savedJson: "",
    selection: [],
    past: [],
    future: [],
    clipboard: [],
    gestureStart: null,
    autosave: true,
    snap: true,
    showGrid: false,
    aspect: "16:9",
    dataSource: "mock",
    page: "playing",
    saving: false,
    error: null,

    init: async (active) => {
      if (get().ready) return;
      await open(active);
      set({ ready: true });
    },
    setError: (error) => set({ error }),

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
      if (gestureStart && json(gestureStart) !== json(doc)) {
        // Only the widgets the gesture touched are re-anchored.
        const before = new Map(gestureStart.widgets.map((w) => [w.id, json2(w)]));
        const moved = new Set(doc.widgets.filter((w) => before.get(w.id) !== json2(w)).map((w) => w.id));
        set({ doc: withAutoAnchors(doc, moved, aspect), past: [...past.slice(-(HISTORY_LIMIT - 1)), gestureStart], future: [] });
      }
      set({ gestureStart: null });
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

    addWidget: (spec) => {
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
      commit(withAutoAnchors({ ...doc, widgets: [...doc.widgets, widget] }, new Set([id]), get().aspect));
      set({ selection: [id] });
    },
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

    setToggle: (key, value) => set({ [key]: value }),
    setAspect: (aspect) => set({ aspect }),
    setDataSource: (dataSource) => set({ dataSource }),
    setPage: (page) => {
      // Widgets of the previous page are no longer on screen, so they cannot stay selected.
      const { doc, selection } = get();
      const onPage = new Set(doc.widgets.filter((w) => w.pages.includes(page)).map((w) => w.id));
      set({ page, selection: selection.filter((id) => onPage.has(id)) });
    },

    save: async () => {
      const { name, doc, saving } = get();
      if (saving || !isDirty(get())) return;
      set({ saving: true });
      try {
        await persist(name, doc);
        set({ savedJson: json({ ...doc, name }) });
      } catch (e) {
        set({ error: String(e) });
      } finally {
        set({ saving: false });
      }
    },
    openLayout: async (name) => {
      await get().save();
      await guard(() => open(name));
    },
    createLayout: (name, preset) =>
      guard(async () => {
        if (!isValidLayoutName(name)) throw new Error("invalidName");
        if (get().layouts.includes(name)) throw new Error("nameTaken");
        await get().save();
        await persist(name, presetLayout(preset, name));
        await open(name);
      }),
    duplicateLayout: (name) =>
      guard(async () => {
        if (!isValidLayoutName(name)) throw new Error("invalidName");
        if (get().layouts.includes(name)) throw new Error("nameTaken");
        const { doc } = get();
        await persist(name, { ...doc, name });
        await open(name);
      }),
    renameLayout: (name) =>
      guard(async () => {
        const { name: old, doc, layouts } = get();
        if (!isValidLayoutName(name)) throw new Error("invalidName");
        if (name !== old && layouts.includes(name)) throw new Error("nameTaken");
        if (name === old) return;
        await persist(name, { ...doc, name });
        const settings = useReaderStore.getState().settings;
        if (settings?.activeLayout === old) await saveSettings({ ...settings, activeLayout: name });
        await deleteStored(old);
        await open(name);
      }),
    removeLayout: async (name) => {
      await guard(async () => {
        await deleteStored(name);
        const settings = useReaderStore.getState().settings;
        const fallback = name === get().name ? (settings?.activeLayout !== name ? (settings?.activeLayout ?? "default") : "default") : get().name;
        await open(fallback);
      });
    },
    importLayout: (text, name) =>
      guard(async () => {
        if (!isValidLayoutName(name)) throw new Error("invalidName");
        let parsed: unknown;
        try {
          parsed = JSON.parse(text);
        } catch {
          throw new Error("invalidLayout");
        }
        const imported = migrateLayout(parsed, name);
        if (!imported) throw new Error("invalidLayout");
        await get().save();
        await persist(name, { ...imported, name });
        await open(name);
      }),
    exportLayout: () => JSON.stringify({ ...get().doc, name: get().name }, null, 2),
    useAsActive: async () => {
      await get().save();
      const settings = useReaderStore.getState().settings;
      if (settings) await guard(async () => void (await saveSettings({ ...settings, activeLayout: get().name })));
    },
  };
});
