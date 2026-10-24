import { invoke } from "@tauri-apps/api/core";
import { useEffect, useState } from "react";
import { Icon } from "../components/icons/Icon";
import { useT } from "../i18n";
import { isTauri, startGameMock } from "../lib/state/mock";
import { useInputWindow } from "../lib/state/useInputWindow";
import { useReaderStore } from "../lib/state/store";
import type { GameState } from "../lib/state/types";
import { EditorCanvas } from "./canvas/EditorCanvas";
import { Inspector } from "./panels/Inspector";
import { PageTabs } from "./panels/PageTabs";
import { Layers, Palette } from "./panels/Palette";
import { Splitter, useStoredSize } from "./panels/Splitter";
import { CommandPalette } from "./panels/CommandPalette";
import { Toolbar } from "./panels/Toolbar";
import { useErrorText } from "./panels/dialogs";
import { isDirty, useEditor } from "./useEditor";

const AUTOSAVE_DELAY_MS = 500;

/** Simulated gameplay while editing (restores the real state when the editor closes). */
function useEditorData() {
  const source = useEditor((s) => s.dataSource);
  // Live data: the keys are read from the game while the editor shows them.
  useInputWindow("main", source === "live");
  useEffect(() => {
    if (source !== "mock") return;
    const stop = startGameMock();
    return () => {
      stop();
      if (isTauri) void invoke<GameState>("get_game_state").then((game) => useReaderStore.setState({ game }));
    };
  }, [source]);
}

function Kbd({ children }: { children: string }) {
  return <kbd className="rounded bg-wash/8 px-1.5 py-px font-sans text-[0.6875rem] text-ink shadow-[0_1px_0_oklch(from_var(--wash)_l_c_h/0.12)]">{children}</kbd>;
}

/** Keyboard shortcuts of the canvas, as key caps followed by what they do. */
function ShortcutsBar() {
  const t = useT();
  const shortcuts: { keys: string[]; label: string }[] = [
    { keys: [t("editor.key.del")], label: t("editor.shortcut.delete") },
    { keys: ["Ctrl Z", "Ctrl Y"], label: t("editor.shortcut.history") },
    { keys: ["Ctrl C", "Ctrl V", "Ctrl D"], label: t("editor.shortcut.clipboard") },
    { keys: ["Ctrl G", "Ctrl Maj G"], label: t("editor.shortcut.group") },
    { keys: ["← ↑ → ↓"], label: t("editor.shortcut.move") },
    { keys: [t("editor.key.shift")], label: t("editor.shortcut.moveFast") },
    { keys: ["Alt"], label: t("editor.shortcut.noSnap") },
    { keys: ["Ctrl S"], label: t("editor.shortcut.save") },
  ];
  // Folded by default: the list is a reference, not something to read at every glance. The choice is remembered.
  const [open, setOpen] = useState(() => {
    try {
      return localStorage.getItem("yar.editor.shortcuts") === "open";
    } catch {
      return false;
    }
  });
  const toggle = () => {
    setOpen(!open);
    try {
      localStorage.setItem("yar.editor.shortcuts", open ? "closed" : "open");
    } catch {
      /* not remembered */
    }
  };
  return (
    <div className="border-t border-wash/5 bg-surface-raised px-3 text-xs text-ink-dim">
      <button type="button" aria-expanded={open} onClick={toggle} className="-ml-2 flex min-h-8 items-center gap-1.5 rounded-md px-2 outline-none transition-[color,background-color] duration-150 hover:bg-wash/6 hover:text-ink focus-visible:shadow-[0_0_0_2px_var(--color-accent)]">
        <Icon name="chevron-up" size={14} className={`transition-transform duration-200 ease-[cubic-bezier(0.2,0,0,1)] motion-reduce:transition-none ${open ? "rotate-180" : ""}`} />
        {t("editor.shortcuts")}
      </button>
      {/* Folds like the palette categories, so the canvas above does not jump by the list's height. */}
      <div inert={!open} className={`grid transition-[grid-template-rows,opacity] duration-200 ease-[cubic-bezier(0.2,0,0,1)] motion-reduce:transition-none ${open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}>
        <ul className="flex min-h-0 flex-wrap items-center gap-x-4 gap-y-1 overflow-hidden">
          {shortcuts.map((s) => (
            <li key={s.label} className="flex items-center gap-1.5">
              <span className="flex gap-1">
                {s.keys.map((k) => (
                  <Kbd key={k}>{k}</Kbd>
                ))}
              </span>
              {s.label}
            </li>
          ))}
          <li aria-hidden className="h-1 basis-full" />
        </ul>
      </div>
    </div>
  );
}

function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable);
}

/** Keyboard shortcuts of the editor. */
function useShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const ed = useEditor.getState();
      // Ctrl+K opens (or closes) the command palette from anywhere in the editor, even from a field.
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k" && !e.shiftKey && !document.querySelector("[role=dialog]:not([data-command-palette])")) {
        e.preventDefault();
        ed.setCommandOpen(!ed.commandOpen);
        return;
      }
      if (isTyping(e.target) || document.querySelector("[role=dialog]")) return;
      const mod = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();
      const step = e.shiftKey ? 10 : 1;

      const handled = (() => {
        if (mod && key === "z") return e.shiftKey ? ed.redo() : ed.undo(), true;
        if (mod && key === "y") return ed.redo(), true;
        // Ctrl+Alt+C / V copy and paste the style (Ctrl+C / V copy the widgets): the Alt ones come first.
        if (mod && e.altKey && key === "c") return ed.copyStyle(), true;
        if (mod && e.altKey && key === "v") return ed.pasteStyle(), true;
        if (mod && key === "c") return ed.copySelected(), true;
        if (mod && key === "v") return ed.paste(), true;
        if (mod && key === "d") return ed.duplicateSelected(), true;
        if (mod && key === "g") return e.shiftKey ? ed.ungroupSelected() : ed.groupSelected(), true;
        if (mod && key === "s") return void ed.save(), true;
        if (mod && key === "a") return ed.select(ed.doc.widgets.filter((w) => !w.locked).map((w) => w.id)), true;
        if (key === "delete" || key === "backspace") return ed.removeSelected(), true;
        if (key === "escape") return ed.select([]), true;
        if (key === "arrowleft") return ed.nudge(-step, 0), true;
        if (key === "arrowright") return ed.nudge(step, 0), true;
        if (key === "arrowup") return ed.nudge(0, -step), true;
        if (key === "arrowdown") return ed.nudge(0, step), true;
        return false;
      })();
      if (handled) e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}

/** Saves a moment after the last change, so the overlay follows edits live. */
function useAutosave() {
  const doc = useEditor((s) => s.doc);
  const autosave = useEditor((s) => s.autosave);
  const gesture = useEditor((s) => s.gestureStart !== null);
  useEffect(() => {
    if (!autosave || gesture || !isDirty(useEditor.getState())) return;
    const timer = setTimeout(() => void useEditor.getState().save(), AUTOSAVE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [doc, autosave, gesture]);

  // Flush pending changes when leaving the editor.
  useEffect(() => () => void useEditor.getState().save(), []);
}

export default function EditorTab() {
  const t = useT();
  const errorText = useErrorText();
  const active = useReaderStore((s) => s.settings?.activeLayout);
  const ready = useEditor((s) => s.ready);
  const error = useEditor((s) => s.error);

  useEffect(() => {
    if (active) void useEditor.getState().init(active);
  }, [active]);

  useEditorData();
  useShortcuts();
  useAutosave();

  const [left, setLeft, resetLeft] = useStoredSize("yar.editor.left", 232, 180, 420);
  const [right, setRight, resetRight] = useStoredSize("yar.editor.right", 300, 240, 520);
  const [layers, setLayers, resetLayers] = useStoredSize("yar.editor.layers", 200, 120, 640);

  if (!ready) return null;
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <Toolbar />
      <CommandPalette />
      <div className="flex min-h-0 flex-1">
        <aside style={{ width: left }} className="min-h-0 shrink-0 overflow-y-auto bg-surface-raised">
          <Palette />
        </aside>
        <Splitter axis="col" label={t("editor.resizeLeft")} value={left} min={180} max={420} onChange={setLeft} onReset={resetLeft} />
        <main className="flex min-h-0 min-w-0 flex-1 flex-col">
          <PageTabs />
          <EditorCanvas />
          <ShortcutsBar />
        </main>
        <Splitter axis="col" grows="after" label={t("editor.resizeRight")} value={right} min={240} max={520} onChange={setRight} onReset={resetRight} />
        {/* Properties on top, layers below: the arrangement of the usual image editors. */}
        <aside style={{ width: right }} className="flex min-h-0 shrink-0 flex-col bg-surface-raised">
          <div className="min-h-0 flex-1 overflow-y-auto">
            <Inspector />
          </div>
          <Splitter axis="row" grows="after" label={t("editor.resizeLayers")} value={layers} min={120} max={640} onChange={setLayers} onReset={resetLayers} />
          <div style={{ height: layers }} className="shrink-0 overflow-y-auto">
            <Layers />
          </div>
        </aside>
      </div>
      {error && (
        <div role="alert" className="toast absolute right-4 bottom-12 z-40 flex max-w-sm items-start gap-3 rounded-lg bg-red-700 px-3 py-2 text-sm text-white shadow-lg">
          <span className="min-w-0 flex-1">{errorText(error)}</span>
          <button type="button" aria-label={t("common.close")} onClick={() => useEditor.getState().setError(null)} className="flex size-8 shrink-0 items-center justify-center rounded-md outline-none transition-[background-color,scale] duration-150 hover:bg-wash/15 focus-visible:shadow-[0_0_0_2px_white] active:scale-[0.96]">
            <Icon name="close" />
          </button>
        </div>
      )}
    </div>
  );
}
