import { useEffect } from "react";
import { type HoverSampleSet, hoverSample, type SfxName, selectSample, sfx } from "./sfx";
import { useReaderStore } from "../state/store";

/**
 * Gives the whole application window the sounds osu!lazer gives the same kind of control, with a few
 * listeners on the document, so no component has to know about them. Mounted once by `App`, never by the
 * overlay.
 *
 * The rules are lazer's (`HoverSounds`, `HoverClickSounds`, `HoverSampleSet`, see `docs/CONTRIBUTING.md` for
 * the full table and the sources):
 *
 * - A control plays `<set>-hover` when the pointer reaches it, and `<set>-select` when it is clicked, where the
 *   set comes from the kind of control (`classify`). A set without a sample of its own uses the default one.
 * - Hover is debounced globally (20 ms), skipped while a mouse button is held (scrolling, dragging) and for a
 *   disabled control. Clicking a disabled control plays `<set>-select-disabled`.
 * - Hover and click get a small random pitch (±2 % and ±1 %).
 * - Controls that make their own sound do not also play a click: switches (check-on / check-off), tabs
 *   (tabselect-select), the dropdown header (the list opening says it), sliders (notch-tick, only when the
 *   value changes, 30 ms apart, pitched with the value).
 * - What appears or goes away plays the container's sound: dialogs, menus, dropdown lists, toasts.
 *
 * A control or a container can choose with `data-sfx`: `none`, `default`, `button`, `sidebar`, `ok`, `cancel`,
 * `danger`, `back`, `swap`.
 */

const CONTROLS = 'button, a[href], summary, [role="tab"], [role="menuitem"], [role="option"], [role="combobox"], [role="switch"], [role="checkbox"], [role="radio"]';

/** What a control plays: its hover sample, and its click sample (`null` when the control makes its own sound). */
interface Sounds {
  hover: SfxName;
  select: (enabled: boolean) => SfxName | null;
}

const fromSet = (set: HoverSampleSet): Sounds => ({ hover: hoverSample(set), select: (enabled) => selectSample(set, enabled) });

const DEFAULT = fromSet("default");
const BUTTON = fromSet("button");
const SIDEBAR = fromSet("button-sidebar");
const OK = fromSet("dialog-ok");
const CANCEL = fromSet("dialog-cancel");
/** The dangerous dialog button: `Button` hover, `dialog-dangerous-select` on confirmation. */
const DANGER: Sounds = { hover: hoverSample("button"), select: (enabled) => (enabled ? "dialog-dangerous-select" : selectSample("button", false)) };
/** Reordering: `item-swap` when the order changes. */
const SWAP: Sounds = { hover: hoverSample("button"), select: (enabled) => (enabled ? "item-swap" : selectSample("button", false)) };
const BACK: Sounds = { hover: hoverSample("button"), select: (enabled) => (enabled ? "screen-back" : selectSample("button", false)) };

const BY_CHOICE: Record<string, Sounds | "none"> = { none: "none", default: DEFAULT, button: BUTTON, sidebar: SIDEBAR, ok: OK, cancel: CANCEL, danger: DANGER, back: BACK, swap: SWAP };

/** The sounds of a control, or `null` for a control that is silent. */
function classify(el: HTMLElement): Sounds | null {
  const dialog = el.closest('[role="dialog"], [role="alertdialog"]');
  // An explicit choice counts when it is the control's own, or its container's inside the same dialog.
  const host = el.closest<HTMLElement>("[data-sfx]");
  const explicit = host && (!dialog || dialog.contains(host)) ? BY_CHOICE[host.dataset.sfx ?? ""] : undefined;
  if (explicit === "none") return null;
  if (explicit) return explicit;

  const role = el.getAttribute("role");
  if (role === "switch" || role === "checkbox") {
    // OsuCheckbox: `HoverSounds` (default hover) and check-on / check-off when the user changes it. Read at
    // capture time, before React re-renders, so `aria-checked` is still the old value.
    const was = el.getAttribute("aria-checked") === "true";
    return { hover: DEFAULT.hover, select: (enabled) => (enabled ? (was ? "check-off" : "check-on") : selectSample("default", false)) };
  }
  // OsuTabControl: `HoverSounds(TabSelect)` (no tabselect-hover: default hover) and tabselect-select on activation.
  if (role === "tab") return { hover: hoverSample("tabselect"), select: (enabled) => (!enabled ? selectSample("tabselect", false) : el.getAttribute("aria-selected") === "true" ? null : "tabselect-select") };
  // OsuDropdownHeader: `HoverSounds` only; the menu opening plays dropdown-open.
  if (role === "combobox") return { hover: DEFAULT.hover, select: (enabled) => (enabled ? null : selectSample("default", false)) };
  // Dropdown items and menu items: `HoverClickSounds` (default set).
  if (role === "option" || role === "menuitem") return DEFAULT;
  if (dialog) {
    // PopupDialogOkButton / PopupDialogCancelButton / PopupDialogDangerousButton.
    if (el.className.includes("bg-accent")) return OK;
    if (/red-|danger/.test(el.className)) return DANGER;
    return CANCEL;
  }
  // A button without text (an icon) is a `ToolbarButton`-like `OsuClickableContainer`: default set. A button with a
  // label is an `OsuButton`: `Button` set.
  if (el.tagName === "BUTTON" && !el.textContent?.trim()) return DEFAULT;
  if (el.tagName === "A") return DEFAULT;
  return BUTTON;
}

const isDisabled = (el: Element) => el.matches(':disabled, [aria-disabled="true"]');

/** Sound of a container that appears (`in`) or goes away (`out`). */
interface Appear {
  in?: (el: Element) => SfxName;
  out?: (el: Element) => SfxName;
}

const APPEAR: Record<string, Appear> = {
  // DialogOverlay: PopInSampleName / PopOutSampleName.
  dialog: { in: () => "dialog-pop-in", out: () => "dialog-pop-out" },
  alertdialog: { in: () => "dialog-pop-in", out: () => "dialog-pop-out" },
  // OsuContextMenu opens with the menu "click" sample, OsuMenu closes with menu-close.
  menu: { in: () => "menu-open-select", out: () => "menu-close" },
  // OsuDropdownMenu: dropdown-open / dropdown-close.
  listbox: { in: () => "dropdown-open", out: () => "dropdown-close" },
  // A toast is a notification (SimpleErrorNotification: notification-error in, overlay-pop-out out); an inline error
  // has no lazer sample of its own, generic-error stands for it.
  alert: { in: (el) => (el.classList.contains("toast") ? "notification-error" : "generic-error"), out: (el) => (el.classList.contains("toast") ? "overlay-pop-out" : "generic-error") },
};
const APPEAR_SELECTOR = Object.keys(APPEAR)
  .map((role) => `[role="${role}"]`)
  .join(",");

function announce(nodes: NodeList, direction: "in" | "out"): void {
  for (const node of nodes) {
    if (!(node instanceof Element)) continue;
    const found = node.matches(APPEAR_SELECTOR) ? [node] : node.firstElementChild ? [...node.querySelectorAll(APPEAR_SELECTOR)] : [];
    for (const el of found) {
      const role = el.getAttribute("role") ?? "";
      // An inline error that goes away is silent.
      if (direction === "out" && role === "alert" && !el.classList.contains("toast")) continue;
      const sound = APPEAR[role]?.[direction]?.(el);
      if (sound) sfx.play(sound);
    }
  }
}

/** The notifications of the store: an update waiting (notification-default), downloaded (notification-done) or failed (notification-error). */
function watchStore(): () => void {
  return useReaderStore.subscribe((state, previous) => {
    const was = previous.update.phase;
    const now = state.update.phase;
    if (now === was) return;
    if (now === "available") sfx.play("notification-default");
    else if (now === "installing" && was === "downloading") sfx.play("notification-done");
    else if (now === "error" && was !== "idle") sfx.play("notification-error");
  });
}

/** `OsuGameBase.SAMPLE_DEBOUNCE_TIME`. */
const HOVER_DEBOUNCE_MS = 20;
/** `OsuSliderBar`: no tick less than 30 ms after the last one. */
const TICK_GAP_MS = 30;

/** Installs every listener; returns the function that removes them. Does nothing in the overlay window. */
export function installUiSounds(): () => void {
  if (location.hash === "#overlay") return () => undefined;
  const unlock = () => sfx.unlock();
  let lastHover: Element | null = null;
  let lastHoverAt = -Infinity;
  let lastTickAt = -Infinity;
  let lastTickValue = "";

  const onPointerOver = (e: PointerEvent) => {
    // Like HoverSampleDebounceComponent: not with a button held (scrolling, dragging).
    if (e.pointerType !== "mouse" || e.buttons !== 0 || !(e.target instanceof Element)) return;
    const control = e.target.closest<HTMLElement>(CONTROLS);
    if (control === lastHover) return;
    lastHover = control;
    if (!control || isDisabled(control)) return; // a disabled control has no hover sound
    const sounds = classify(control);
    const now = performance.now();
    if (!sounds || now - lastHoverAt < HOVER_DEBOUNCE_MS) return;
    lastHoverAt = now;
    sfx.play(sounds.hover, { pitch: 0.02 });
  };
  const playSelect = (control: HTMLElement, enabled: boolean) => {
    const sound = classify(control)?.select(enabled);
    if (sound) sfx.play(sound, { pitch: 0.01 });
  };
  const onClick = (e: MouseEvent) => {
    if (!e.isTrusted || e.button !== 0 || !(e.target instanceof Element)) return; // left button only, like HoverClickSounds
    const control = e.target.closest<HTMLElement>(CONTROLS);
    if (control && !control.matches(":disabled")) playSelect(control, !isDisabled(control));
  };
  // A natively disabled control gets no click: its press is read from the pointer instead.
  const onPointerDown = (e: PointerEvent) => {
    if (!e.isTrusted || e.button !== 0) return;
    const control = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>(CONTROLS);
    if (control?.matches(":disabled")) playSelect(control, false);
  };
  const onChange = (e: Event) => {
    const input = e.target;
    if (input instanceof HTMLInputElement && input.type === "checkbox" && !input.closest('[data-sfx="none"]')) sfx.play(input.checked ? "check-on" : "check-off");
  };
  // OsuSliderBar: a tick when the value changes (30 ms apart), pitched up with the value and down at the ends.
  const onInput = (e: Event) => {
    const input = e.target;
    if (!(input instanceof HTMLInputElement) || input.type !== "range" || input.closest('[data-sfx="none"]')) return;
    const now = performance.now();
    if (now - lastTickAt <= TICK_GAP_MS || input.value === lastTickValue) return;
    lastTickAt = now;
    lastTickValue = input.value;
    const span = Number(input.max) - Number(input.min);
    const normalized = span > 0 ? (Number(input.value) - Number(input.min)) / span : 0;
    let rate = 0.99 + Math.random() * 0.02 + normalized * 0.2;
    if (normalized === 0 || normalized === 1) rate -= 0.5;
    sfx.play("notch-tick", { rate });
  };

  const observer = new MutationObserver((records) => {
    for (const record of records) {
      if (record.type === "attributes") {
        // A status line that turns into an alert (the settings bar on a failed save).
        if (record.target instanceof Element && record.target.getAttribute("role") === "alert" && record.oldValue !== "alert") sfx.play("generic-error");
        continue;
      }
      announce(record.addedNodes, "in");
      announce(record.removedNodes, "out");
    }
  });
  observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["role"], attributeOldValue: true });

  window.addEventListener("pointerdown", unlock, { capture: true, once: true });
  window.addEventListener("keydown", unlock, { capture: true, once: true });
  document.addEventListener("pointerover", onPointerOver, true);
  document.addEventListener("pointerdown", onPointerDown, true);
  document.addEventListener("click", onClick, true);
  document.addEventListener("change", onChange, true);
  document.addEventListener("input", onInput, true);
  const unwatch = watchStore();

  return () => {
    observer.disconnect();
    window.removeEventListener("pointerdown", unlock, true);
    window.removeEventListener("keydown", unlock, true);
    document.removeEventListener("pointerover", onPointerOver, true);
    document.removeEventListener("pointerdown", onPointerDown, true);
    document.removeEventListener("click", onClick, true);
    document.removeEventListener("change", onChange, true);
    document.removeEventListener("input", onInput, true);
    unwatch();
  };
}

/** Mount once, in the application window. */
export function useUiSounds(): void {
  useEffect(() => installUiSounds(), []);
}
