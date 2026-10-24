import { type CSSProperties, type KeyboardEvent, useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "./Icon";
import { firstEnabled, lastEnabled, moveIndex, typeaheadIndex } from "./selectLogic";

export interface SelectOption<T extends string> {
  value: T;
  label: string;
  disabled?: boolean;
}

interface SelectProps<T extends string> {
  value: T;
  onChange: (value: T) => void;
  options: readonly SelectOption<T>[];
  /** Accessible name of the control (there is no visible `<label>` association to rely on). */
  label: string;
  /** `md` is a 40px control; `sm` looks 32px but keeps a 40px hit area (dense editor panels). */
  size?: "sm" | "md";
  /** Which edge of the trigger the menu lines up with. */
  align?: "start" | "end";
  disabled?: boolean;
  className?: string;
}

interface Placement {
  style: CSSProperties;
  up: boolean;
}

const MENU_MAX_HEIGHT = 320;
const GAP = 6;
const EDGE = 8;
const ROW_HEIGHT = 40;
const EXIT_MS = 110;
const TYPEAHEAD_MS = 600;

/** The up-and-down chevrons of a drop-down (symmetric, so open or closed it looks the same: aria-expanded says which). */
function Chevron() {
  return <Icon name="expand" className="text-ink-dim" />;
}

function Check() {
  return <Icon name="check" size={14} className="text-accent" />;
}

/** Menu position next to the trigger: below by default, above when there is not enough room. */
function placeMenu(trigger: DOMRect, rows: number, align: "start" | "end"): Placement {
  const wanted = Math.min(MENU_MAX_HEIGHT, rows * ROW_HEIGHT + EDGE);
  const below = window.innerHeight - trigger.bottom - GAP - EDGE;
  const above = trigger.top - GAP - EDGE;
  const up = below < wanted && above > below;
  const style: CSSProperties = {
    minWidth: trigger.width,
    maxHeight: Math.max(120, Math.min(MENU_MAX_HEIGHT, up ? above : below)),
    ...(align === "end" ? { right: window.innerWidth - trigger.right } : { left: trigger.left }),
    ...(up ? { bottom: window.innerHeight - trigger.top + GAP } : { top: trigger.bottom + GAP }),
  };
  return { style, up };
}

/**
 * A styled dropdown that replaces the browser's native `<select>`.
 *
 * Keyboard: ↑/↓/Home/End move, Enter/Space choose, Esc closes, typing jumps to a matching option.
 * Focus stays on the trigger (`aria-activedescendant`), the list is rendered in a portal so no
 * scrolling or clipping container can cut it off.
 */
export function Select<T extends string>({ value, onChange, options, label, size = "md", align = "start", disabled, className = "" }: SelectProps<T>) {
  const listId = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const typed = useRef({ text: "", timer: 0 });
  // How the active row must be brought into view: only keyboard moves (and the opening) scroll the list,
  // a hover must never move the row from under the pointer.
  const reveal = useRef<"center" | "nearest" | null>(null);

  const [open, setOpen] = useState(false);
  // `mounted` keeps the menu in the DOM during its exit transition; `shown` drives that transition.
  const [mounted, setMounted] = useState(false);
  const [shown, setShown] = useState(false);
  const [active, setActive] = useState(-1);
  const [placement, setPlacement] = useState<Placement | null>(null);

  const selectedIndex = options.findIndex((o) => o.value === value);
  const selected = options[selectedIndex];

  const openMenu = useCallback(() => {
    const el = trigger.current;
    if (!el || disabled) return;
    setPlacement(placeMenu(el.getBoundingClientRect(), options.length, align));
    setActive(selectedIndex >= 0 && !options[selectedIndex].disabled ? selectedIndex : firstEnabled(options));
    reveal.current = "center";
    setOpen(true);
  }, [align, disabled, options, selectedIndex]);

  const closeMenu = useCallback((refocus = false) => {
    setOpen(false);
    if (refocus) trigger.current?.focus();
  }, []);

  const choose = (index: number) => {
    const option = options[index];
    if (!option || option.disabled) return;
    if (option.value !== value) onChange(option.value);
    closeMenu(true);
  };

  // Mount first, then flip `shown` on the next frame so the enter transition actually runs.
  useEffect(() => {
    if (open) {
      setMounted(true);
      const frame = requestAnimationFrame(() => setShown(true));
      return () => cancelAnimationFrame(frame);
    }
    setShown(false);
    const timer = window.setTimeout(() => setMounted(false), EXIT_MS);
    return () => window.clearTimeout(timer);
  }, [open]);

  // Close when the user clicks elsewhere, scrolls, or resizes (the menu would drift from its trigger).
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (!menu.current?.contains(target) && !trigger.current?.contains(target)) closeMenu();
    };
    const onScroll = (e: Event) => {
      if (!menu.current?.contains(e.target as Node)) closeMenu();
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("scroll", onScroll, true);
    const onResize = () => closeMenu();
    window.addEventListener("resize", onResize);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onResize);
    };
  }, [open, closeMenu]);

  useEffect(() => {
    const mode = reveal.current;
    const list = menu.current;
    if (!open || !mode || !list || active < 0) return;
    const row = list.querySelector<HTMLElement>('[data-active="true"]');
    if (!row) return;
    reveal.current = null;
    if (mode === "center") {
      // Instant and local: the selected row sits mid-list from the first frame (no smooth scroll under the enter animation).
      list.scrollTop = row.offsetTop - (list.clientHeight - row.offsetHeight) / 2;
    } else if (row.offsetTop < list.scrollTop) list.scrollTop = row.offsetTop - 4;
    else if (row.offsetTop + row.offsetHeight > list.scrollTop + list.clientHeight) list.scrollTop = row.offsetTop + row.offsetHeight - list.clientHeight + 4;
  }, [open, active, mounted]);

  useEffect(() => () => window.clearTimeout(typed.current.timer), []);

  const typeChar = (key: string) => {
    window.clearTimeout(typed.current.timer);
    typed.current.text += key;
    typed.current.timer = window.setTimeout(() => (typed.current.text = ""), TYPEAHEAD_MS);
    const match = typeaheadIndex(options.map((o) => o.label), options.map((o) => !!o.disabled), typed.current.text, active);
    if (match >= 0) {
      reveal.current = "nearest";
      setActive(match);
    }
  };

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (disabled) return;
    const key = e.key;
    if (!open) {
      if (key === "ArrowDown" || key === "ArrowUp" || key === "Enter" || key === " ") {
        e.preventDefault();
        openMenu();
      }
      return;
    }
    // A space inside a word being typed ("Top r") is a letter, not "choose".
    if (key === " " && typed.current.text !== "") {
      typeChar(key);
      e.preventDefault();
      return;
    }
    if (key === "ArrowDown" || key === "ArrowUp" || key === "Home" || key === "End") reveal.current = "nearest";
    switch (key) {
      case "ArrowDown":
        setActive((i) => (i < 0 ? firstEnabled(options) : moveIndex(options, i, 1)));
        break;
      case "ArrowUp":
        setActive((i) => (i < 0 ? lastEnabled(options) : moveIndex(options, i, -1)));
        break;
      case "Home":
        setActive(firstEnabled(options));
        break;
      case "End":
        setActive(lastEnabled(options));
        break;
      case "Enter":
      case " ":
        choose(active);
        break;
      case "Escape":
        // Closes only the menu, not a dialog the menu may be inside of.
        e.stopPropagation();
        closeMenu(true);
        break;
      case "Tab":
        closeMenu();
        return;
      default: {
        if (key.length !== 1 || e.ctrlKey || e.metaKey || e.altKey) return;
        typeChar(key);
        break;
      }
    }
    e.preventDefault();
  };

  const sizing = size === "sm" ? "min-h-8 px-2.5 before:absolute before:inset-x-0 before:-inset-y-1 before:content-['']" : "min-h-10 px-3";

  return (
    <>
      <button
        ref={trigger}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={mounted ? listId : undefined}
        aria-activedescendant={open && active >= 0 ? `${listId}-${active}` : undefined}
        aria-label={label}
        disabled={disabled}
        onClick={() => (open ? closeMenu() : openMenu())}
        onKeyDown={onKeyDown}
        className={`relative inline-flex items-center justify-between gap-2 rounded-lg bg-surface text-left text-sm text-ink shadow-[0_0_0_1px_var(--ring-field)] outline-none transition-[box-shadow,background-color,scale] duration-150 hover:bg-wash/5 focus-visible:shadow-[0_0_0_2px_var(--color-accent)] active:scale-[0.96] disabled:pointer-events-none disabled:opacity-50 ${open ? "bg-wash/5 shadow-[0_0_0_1px_oklch(from_var(--wash)_l_c_h/0.22)]" : ""} ${sizing} ${className || "w-full"}`}
      >
        <span className="min-w-0 flex-1 truncate">{selected?.label ?? ""}</span>
        <Chevron />
      </button>

      {mounted &&
        placement &&
        createPortal(
          <div
            ref={menu}
            id={listId}
            role="listbox"
            aria-label={label}
            // Keep focus on the trigger while the pointer moves over the list.
            onMouseDown={(e) => e.preventDefault()}
            style={placement.style}
            className={`fixed z-[60] flex w-max max-w-[min(420px,calc(100vw-16px))] flex-col gap-px overflow-y-auto rounded-lg bg-menu p-1 shadow-[0_0_0_1px_oklch(from_var(--wash)_l_c_h/0.1),0_12px_32px_oklch(0_0_0/0.5)] transition-[opacity,scale] duration-[110ms] ease-out motion-reduce:transition-none ${placement.up ? (align === "end" ? "origin-bottom-right" : "origin-bottom-left") : align === "end" ? "origin-top-right" : "origin-top-left"} ${shown && open ? "scale-100 opacity-100" : "pointer-events-none scale-95 opacity-0"}`}
          >
            {options.map((option, index) => {
              const isSelected = option.value === value;
              return (
                <div
                  key={option.value}
                  id={`${listId}-${index}`}
                  role="option"
                  aria-selected={isSelected}
                  aria-disabled={option.disabled}
                  data-active={index === active}
                  onMouseMove={() => {
                    if (option.disabled || index === active) return;
                    reveal.current = null;
                    setActive(index);
                  }}
                  onClick={() => choose(index)}
                  className={`flex cursor-default items-center justify-between gap-4 rounded-md px-2.5 text-sm select-none ${size === "sm" ? "min-h-9" : "min-h-10"} ${index === active ? "bg-wash/10" : ""} ${isSelected ? "font-medium text-ink" : "text-ink/85"} ${option.disabled ? "opacity-40" : ""}`}
                >
                  <span className="truncate">{option.label}</span>
                  {isSelected && <Check />}
                </div>
              );
            })}
          </div>,
          document.body,
        )}
    </>
  );
}
