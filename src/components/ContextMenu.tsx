import { type CSSProperties, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Icon, type IconName } from "./icons/Icon";

export interface MenuItem {
  id: string;
  label: string;
  icon?: IconName;
  /** Shown on the right, dimmed: the key combination that does the same. */
  shortcut?: string;
  danger?: boolean;
  disabled?: boolean;
  /** A rule above this item, to start a new group of actions. */
  separated?: boolean;
  onSelect: () => void;
}

interface ContextMenuProps {
  /** Where the pointer was, in viewport pixels. */
  x: number;
  y: number;
  items: readonly MenuItem[];
  label: string;
  onClose: () => void;
}

const EDGE = 8;

/**
 * A menu opened by a right click, at the pointer. It grows from the corner that touches the pointer, is
 * pulled back inside the window when it would overflow, and is fully keyboard driven (↑/↓/Home/End, Enter,
 * Esc). It leaves at once when it loses the pointer's interest (click elsewhere, scroll, resize, blur):
 * a menu is a quick question, it never lingers.
 */
export function ContextMenu({ x, y, items, label, onClose }: ContextMenuProps) {
  const menu = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(() => items.findIndex((i) => !i.disabled));
  const [place, setPlace] = useState<{ left: number; top: number; origin: string } | null>(null);

  // Measured once it is in the DOM: flipped to the other side of the pointer when it would run out of the window.
  useLayoutEffect(() => {
    const el = menu.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    const flipX = x + width + EDGE > window.innerWidth;
    const flipY = y + height + EDGE > window.innerHeight;
    const left = Math.max(EDGE, flipX ? x - width : x);
    const top = Math.max(EDGE, flipY ? y - height : y);
    setPlace({ left, top, origin: `${flipX ? "right" : "left"} ${flipY ? "bottom" : "top"}` });
  }, [x, y, items]);

  // The focus stays where it was (the canvas keeps its shortcuts) until a key is pressed in the menu.
  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    menu.current?.focus({ preventScroll: true });
    return () => opener?.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    const away = (e: Event) => {
      if (!menu.current?.contains(e.target as Node)) onClose();
    };
    document.addEventListener("pointerdown", away, true);
    document.addEventListener("contextmenu", away, true);
    window.addEventListener("scroll", onClose, true);
    window.addEventListener("resize", onClose);
    window.addEventListener("blur", onClose);
    return () => {
      document.removeEventListener("pointerdown", away, true);
      document.removeEventListener("contextmenu", away, true);
      window.removeEventListener("scroll", onClose, true);
      window.removeEventListener("resize", onClose);
      window.removeEventListener("blur", onClose);
    };
  }, [onClose]);

  const move = (step: 1 | -1) => {
    const enabled = items.map((item, index) => (item.disabled ? -1 : index)).filter((i) => i >= 0);
    if (enabled.length === 0) return;
    const at = enabled.indexOf(active);
    setActive(enabled[(at + step + enabled.length) % enabled.length]);
  };

  const choose = (item: MenuItem | undefined) => {
    if (!item || item.disabled) return;
    onClose();
    item.onSelect();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    e.stopPropagation();
    if (e.key === "ArrowDown") move(1);
    else if (e.key === "ArrowUp") move(-1);
    else if (e.key === "Home") setActive(items.findIndex((i) => !i.disabled));
    else if (e.key === "End") setActive(items.length - 1 - [...items].reverse().findIndex((i) => !i.disabled));
    else if (e.key === "Enter" || e.key === " ") choose(items[active]);
    else if (e.key === "Escape" || e.key === "Tab") onClose();
    else return;
    e.preventDefault();
  };

  const style: CSSProperties = place ? { left: place.left, top: place.top, transformOrigin: place.origin } : { left: x, top: y, visibility: "hidden" };

  return createPortal(
    <div
      ref={menu}
      role="menu"
      aria-label={label}
      aria-activedescendant={active >= 0 ? `ctx-${items[active].id}` : undefined}
      tabIndex={-1}
      onKeyDown={onKeyDown}
      onContextMenu={(e) => e.preventDefault()}
      style={style}
      className="context-menu fixed z-[70] min-w-52 rounded-lg bg-menu p-1 text-sm shadow-[0_0_0_1px_oklch(from_var(--wash)_l_c_h/0.1),0_12px_32px_oklch(0_0_0/0.5)] outline-none"
    >
      {items.map((item, index) => (
        <div key={item.id} role="none">
          {item.separated && <div role="separator" className="mx-1 my-1 h-px bg-wash/8" />}
          <button
            id={`ctx-${item.id}`}
            type="button"
            role="menuitem"
            tabIndex={-1}
            disabled={item.disabled}
            onMouseMove={() => !item.disabled && setActive(index)}
            onClick={() => choose(item)}
            className={`flex min-h-9 w-full items-center gap-2.5 rounded-md px-2.5 text-left outline-none transition-colors duration-75 disabled:opacity-40 ${index === active ? (item.danger ? "bg-red-500/15" : "bg-wash/10") : ""} ${item.danger ? "text-red-300" : "text-ink"}`}
          >
            <span className="grid size-4 shrink-0 place-items-center text-ink-dim">{item.icon && <Icon name={item.icon} size={14} />}</span>
            <span className="min-w-0 flex-1 truncate">{item.label}</span>
            {item.shortcut && <span className="shrink-0 pl-4 text-xs text-ink-dim tabular-nums">{item.shortcut}</span>}
          </button>
        </div>
      ))}
    </div>,
    document.body,
  );
}
