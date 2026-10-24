import { deleteLayout as deleteStored, listLayouts, loadLayout, saveLayout } from "../lib/layoutApi";
import { saveSettings, useReaderStore } from "../lib/store";
import { type Layout, type PresetId, migrateLayout, presetLayout } from "../overlay/layout";
import { isValidLayoutName } from "./layoutOps";

/** The layouts kept on disk: which one is open, what was last saved, and the actions that load and store them. */
export interface LibraryState {
  ready: boolean;
  layouts: string[];
  name: string;
  /**
   * The document as last loaded or saved. Documents are immutable, so "unsaved changes" is a reference
   * comparison (see {@link isDirty}); undoing back to this very object makes the layout clean again.
   */
  saved: Layout | null;
  saving: boolean;
  error: string | null;

  init: (active: string) => Promise<void>;
  setError: (message: string | null) => void;
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

/** What the library needs of the rest of the editor store. */
interface Store extends LibraryState {
  doc: Layout;
  selection: string[];
  past: Layout[];
  future: Layout[];
  gestureStart: Layout | null;
}

/** Whether the document has changes that are not saved yet. A reference check: no serialising per edit. */
export const isDirty = (s: Pick<Store, "doc" | "saved">) => s.doc !== s.saved;

export function createLibrary(set: (partial: Partial<Store>) => void, get: () => Store): LibraryState {
  /** Loads a layout into the editor (the caller has already dealt with unsaved changes). */
  const open = async (name: string) => {
    const doc = await loadLayout(name);
    const layouts = await listLayouts(useReaderStore.getState().settings?.activeLayout ?? "default");
    const named = { ...doc, name };
    set({
      name,
      doc: named,
      saved: named,
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
    saved: null,
    saving: false,
    error: null,

    init: async (active) => {
      if (get().ready) return;
      await open(active);
      set({ ready: true });
    },
    setError: (error) => set({ error }),

    save: async () => {
      const { name, doc, saving, ready } = get();
      // Before the stored layout is loaded the document is only the placeholder: saving it would overwrite the real one.
      if (!ready || saving || !isDirty(get())) return;
      set({ saving: true });
      try {
        await persist(name, doc);
        set({ saved: doc });
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
}
