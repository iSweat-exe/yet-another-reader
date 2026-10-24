/**
 * The window is an application, not a web page: the shortcuts of the browser that hosts it (find, print,
 * reload, view source, zoom...) only get in the way. This blocks them in the page itself, so it also works in
 * `npm run dev` and in a plain browser. (The release build additionally switches them off natively, see
 * `disable_browser_shortcuts` in `src-tauri/src/lib.rs`.)
 *
 * Developer tools (F12, Ctrl+Shift+I) are not touched, and neither are the editing shortcuts (copy, paste, undo,
 * select all) nor the ones the editor handles itself (Ctrl+S, Ctrl+G, Ctrl+D...): the editor listens after this
 * and still receives the event, only the browser's own action is cancelled.
 */
const CTRL_KEYS: ReadonlySet<string> = new Set(["f", "g", "p", "u", "r", "s", "o", "j", "h", "d", "l", "n", "e", "+", "=", "-", "_", "0"]);
const PLAIN_KEYS: ReadonlySet<string> = new Set(["F3", "F5", "F7"]);

/** True for a key press that would trigger an action of the browser hosting the page. */
export function isBrowserShortcut(e: Pick<KeyboardEvent, "key" | "ctrlKey" | "metaKey" | "altKey" | "shiftKey">): boolean {
  if (PLAIN_KEYS.has(e.key)) return true;
  if (!(e.ctrlKey || e.metaKey) || e.altKey) return false;
  // Ctrl+Shift+I / J / C open the developer tools: left alone.
  if (e.shiftKey && ["i", "j", "c"].includes(e.key.toLowerCase())) return false;
  return CTRL_KEYS.has(e.key.toLowerCase());
}

/** A field where the text can be edited: its right-click menu (paste, copy...) is useful there, and only there. */
export function isEditableTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);
}

/** Blocks the browser's shortcuts, its context menu (except in text fields) and its Ctrl+wheel zoom for the lifetime of the page. */
export function blockBrowserShortcuts(): void {
  window.addEventListener(
    "keydown",
    (e) => {
      if (isBrowserShortcut(e)) e.preventDefault();
    },
    { capture: true },
  );
  window.addEventListener(
    "contextmenu",
    (e) => {
      if (!isEditableTarget(e.target)) e.preventDefault();
    },
    { capture: true },
  );
  window.addEventListener(
    "wheel",
    (e) => {
      if (e.ctrlKey) e.preventDefault();
    },
    { capture: true, passive: false },
  );
}
