import { type PointerEvent as ReactPointerEvent, type ReactNode, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { invoke } from "@tauri-apps/api/core";
import { Icon, type IconName } from "../components/Icon";
import { type MessageKey, useT } from "../i18n";
import { isTauri } from "../lib/mock";
import { refreshWidgets, useReaderStore } from "../lib/store";
import type { WidgetInstance } from "../overlay/layout";
import { WIDGETS, WIDGET_CATEGORIES } from "../widgets/registry";
import { IconButton, Section, controlClass } from "./fields";
import { widgetIcon } from "./widgetIcons";
import { useEditor } from "./useEditor";
import { useRowDrag } from "./useRowDrag";
import { useAddables } from "./addables";
import { fold } from "./commands";
import { dropPosition } from "./dropTarget";
import { keyLabel } from "../lib/inputs";


/** How long a tile keeps its "added" check, so a click is acknowledged where the finger is. */
const ADDED_MS = 900;

/** Travel (px) before a press on a tile becomes a drag: a click that wobbles must still add the widget. */
const TILE_DRAG_PX = 6;

interface TileDrag {
  pointerId: number;
  startX: number;
  startY: number;
  moved: boolean;
}

/**
 * One addable widget as a tile: the icon above its name. A click adds it in the middle of the screen; dragging it
 * onto the preview drops it where it is released (the tile's ghost follows the pointer, and says whether the
 * pointer is over the screen).
 */
function WidgetTile({ icon, label, hint, onAdd }: { icon: IconName; label: string; hint?: string; onAdd: (at?: { x: number; y: number }) => void }) {
  const t = useT();
  const [added, setAdded] = useState(false);
  const [ghost, setGhost] = useState<{ x: number; y: number; over: boolean } | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const drag = useRef<TileDrag | null>(null);
  const suppressClick = useRef(false);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const confirm = () => {
    setAdded(true);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setAdded(false), ADDED_MS);
  };
  const end = (e: ReactPointerEvent<HTMLButtonElement>, drop: boolean) => {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    setGhost(null);
    if (d.moved) {
      suppressClick.current = true;
      setTimeout(() => (suppressClick.current = false), 0);
      const at = drop ? dropPosition(e.clientX, e.clientY) : null;
      if (at) {
        onAdd(at);
        confirm();
      }
    }
  };

  return (
    <button
      type="button"
      title={hint ?? t("editor.add")}
      onClick={() => {
        if (suppressClick.current) return;
        onAdd();
        confirm();
      }}
      onPointerDown={(e) => {
        if (e.button !== 0 || drag.current) return;
        drag.current = { pointerId: e.pointerId, startX: e.clientX, startY: e.clientY, moved: false };
      }}
      onPointerMove={(e) => {
        const d = drag.current;
        if (!d || e.pointerId !== d.pointerId) return;
        if (!d.moved) {
          if (Math.hypot(e.clientX - d.startX, e.clientY - d.startY) < TILE_DRAG_PX) return;
          d.moved = true;
          e.currentTarget.setPointerCapture(e.pointerId);
        }
        setGhost({ x: e.clientX, y: e.clientY, over: dropPosition(e.clientX, e.clientY) !== null });
      }}
      onPointerUp={(e) => end(e, true)}
      onPointerCancel={(e) => end(e, false)}
      onKeyDown={(e) => {
        // Escape while dragging drops nothing.
        if (e.key === "Escape" && drag.current?.moved) {
          e.stopPropagation();
          drag.current = null;
          setGhost(null);
        }
      }}
      className="group relative flex min-h-14 w-full flex-col items-start justify-between gap-1.5 rounded-lg bg-wash/4 p-2 text-left text-xs leading-tight text-ink outline-none transition-[background-color,scale] duration-150 hover:bg-wash/9 focus-visible:shadow-[0_0_0_2px_var(--color-accent)] active:scale-[0.96] motion-reduce:transition-none"
    >
      <Icon name={icon} className="text-ink-dim transition-colors duration-150 group-hover:text-ink" />
      <span className="line-clamp-2 w-full break-words">{label}</span>
      {/* The plus shows on hover and focus; after a click it gives way to a check for a moment. */}
      <span aria-hidden className={`absolute top-1.5 right-1.5 text-accent transition-opacity duration-150 ${added ? "opacity-100" : "opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100"}`}>
        <Icon name={added ? "check" : "plus"} size={14} />
      </span>
      <span role="status" className="sr-only">
        {added ? t("palette.added") : ""}
      </span>
      {ghost &&
        createPortal(
          // The copy of the tile under the pointer: solid over the screen (it will land), faint elsewhere (it will not).
          <div
            aria-hidden
            className="pointer-events-none fixed z-50 flex w-28 -translate-x-1/2 -translate-y-1/2 flex-col gap-1.5 rounded-lg bg-surface-raised p-2 text-xs leading-tight text-ink shadow-[0_8px_24px_oklch(0_0_0/0.5),0_0_0_1px_var(--color-accent)] transition-opacity duration-100"
            style={{ left: ghost.x, top: ghost.y, opacity: ghost.over ? 1 : 0.5 }}
          >
            <Icon name={icon} className="text-accent" />
            <span className="line-clamp-2 break-words">{label}</span>
          </div>,
          document.body,
        )}
    </button>
  );
}

function TileGrid({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-2 gap-1.5">{children}</div>;
}

/** A palette category that can be folded; the choice is remembered. */
function Category({ id, title, count, children }: { id: string; title: string; count: number; children: ReactNode }) {
  const key = `yar.editor.fold.${id}`;
  const [open, setOpen] = useState(() => {
    try {
      return localStorage.getItem(key) !== "closed";
    } catch {
      return true;
    }
  });
  const toggle = () => {
    setOpen(!open);
    try {
      localStorage.setItem(key, open ? "closed" : "open");
    } catch {
      /* not remembered */
    }
  };
  return (
    <section className="border-b border-wash/5 px-3 py-2">
      <button type="button" aria-expanded={open} onClick={toggle} className="flex min-h-9 w-full items-center justify-between gap-2 rounded-md text-xs font-medium text-ink outline-none transition-colors duration-150 focus-visible:shadow-[0_0_0_2px_var(--color-accent)]">
        <span className="flex items-baseline gap-1.5">
          {title}
          <span className="font-normal text-ink-dim tabular-nums">{count}</span>
        </span>
        <Icon name="chevron-down" size={14} className={`text-ink-dim transition-transform duration-200 ease-[cubic-bezier(0.2,0,0,1)] motion-reduce:transition-none ${open ? "rotate-180" : ""}`} />
      </button>
      {/* Folds by animating the row height from its content to 0 (the 1fr/0fr trick); folded rows leave the tab order. */}
      <div inert={!open} className={`grid transition-[grid-template-rows,opacity] duration-200 ease-[cubic-bezier(0.2,0,0,1)] motion-reduce:transition-none ${open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}>
        <div className="-mx-1 min-h-0 space-y-3 overflow-hidden px-1 pt-1 pb-1">{children}</div>
      </div>
    </section>
  );
}

function SearchField({ value, onChange, onSubmit }: { value: string; onChange: (value: string) => void; onSubmit: () => void }) {
  const t = useT();
  return (
    <div className="relative">
      <Icon name="search" size={14} className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-ink-dim" />
      <input
        type="search"
        aria-label={t("palette.search")}
        placeholder={t("palette.searchHint")}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") onSubmit();
          // Escape clears first; it only leaves the field when there is nothing left to clear.
          if (e.key === "Escape" && value) {
            e.preventDefault();
            e.stopPropagation();
            onChange("");
          }
        }}
        className={`${controlClass} min-h-9 w-full pr-8 pl-8 text-left [&::-webkit-search-cancel-button]:hidden`}
      />
      {value && (
        <button
          type="button"
          title={t("palette.clear")}
          aria-label={t("palette.clear")}
          onClick={() => onChange("")}
          className="absolute top-1/2 right-1 flex size-7 -translate-y-1/2 items-center justify-center rounded-md text-ink-dim outline-none transition-[background-color,color,scale] duration-150 hover:bg-wash/10 hover:text-ink focus-visible:shadow-[0_0_0_2px_var(--color-accent)] active:scale-[0.96]"
        >
          <Icon name="close" size={12} />
        </button>
      )}
    </div>
  );
}

/** Left column, top: the widgets that can be added to the layout. */
export function Palette() {
  const t = useT();
  const apiEnabled = useReaderStore((s) => s.settings?.apiEnabled ?? true);
  const { present, all, community } = useAddables();
  const [query, setQuery] = useState("");

  const needle = fold(query.trim());
  const results = needle ? all.filter((a) => fold(a.label).includes(needle) || fold(a.key).includes(needle)) : [];

  return (
    <div>
      {/* Stays in view while the list scrolls: searching is the fast path to any widget. */}
      <div className="sticky top-0 z-10 border-b border-wash/5 bg-surface-raised px-3 py-2">
        <SearchField value={query} onChange={setQuery} onSubmit={() => results[0]?.add()} />
      </div>

      {needle ? (
        <section className="px-3 py-3" aria-live="polite">
          {results.length === 0 ? (
            <p className="text-xs text-ink-dim">{t("palette.noResults", { query: query.trim() })}</p>
          ) : (
            <TileGrid>
              {results.map((a) => (
                <WidgetTile key={a.key} icon={a.icon} label={a.label} hint={a.hint} onAdd={a.add} />
              ))}
            </TileGrid>
          )}
        </section>
      ) : (
        <>
          {WIDGET_CATEGORIES.map((category) => (
            <Category key={category.id} id={category.id} title={t(`category.${category.id}`)} count={category.types.length}>
              {category.groups.map((group) => (
                <div key={group.id}>
                  {category.groups.length > 1 && <h4 className="mb-1.5 px-0.5 text-[0.6875rem] font-medium tracking-[0.04em] text-ink-dim">{t(`palette.group.${group.id}` as MessageKey)}</h4>}
                  <TileGrid>
                    {present(group.types).map((a) => (
                      <WidgetTile key={a.key} icon={a.icon} label={a.label} onAdd={a.add} />
                    ))}
                  </TileGrid>
                </div>
              ))}
            </Category>
          ))}

          <Section title={t("editor.community")} aside={<IconButton icon="refresh" label={t("editor.refresh")} onClick={() => void refreshWidgets()} />}>
            {!apiEnabled && (
              <p className="flex gap-2 rounded-md bg-amber-400/10 px-2 py-1.5 text-xs text-amber-300">
                <Icon name="web" className="mt-0.5" />
                {t("editor.apiOff")}
              </p>
            )}
            {community.length === 0 ? (
              <p className="text-xs text-ink-dim">{t("editor.noCommunity")}</p>
            ) : (
              <TileGrid>
                {community.map((a) => (
                  <WidgetTile key={a.key} icon={a.icon} label={a.label} hint={a.hint} onAdd={a.add} />
                ))}
              </TileGrid>
            )}
            {isTauri && (
              <button
                type="button"
                onClick={() => void invoke("open_widgets_folder")}
                className="flex min-h-10 w-full items-center gap-2 rounded-md px-2 text-left text-xs text-ink-dim outline-none transition-[background-color,color,scale] duration-150 hover:bg-wash/8 hover:text-ink focus-visible:shadow-[0_0_0_2px_var(--color-accent)] active:scale-[0.98]"
              >
                <Icon name="folder" />
                <span className="flex-1">{t("editor.openFolder")}</span>
                <Icon name="external" size={14} />
              </button>
            )}
          </Section>
        </>
      )}
    </div>
  );
}

const iconButton = "relative inline-flex size-7 items-center justify-center rounded-md text-ink-dim outline-none transition-[background-color,color,opacity,scale] duration-150 before:absolute before:-inset-x-0.5 before:-inset-y-1 before:content-[''] hover:bg-wash/10 hover:text-ink focus-visible:opacity-100 focus-visible:shadow-[0_0_0_2px_var(--color-accent)] active:scale-[0.96]";

/**
 * The row's actions float over its right end on hover or focus, on a backdrop that hides the name behind them, so the
 * name keeps the whole row the rest of the time (a narrow panel would otherwise cut every name short).
 */
function RowActions({ children }: { children: ReactNode }) {
  return (
    <div className="absolute inset-y-0 right-0 flex items-center gap-0.5 rounded-md bg-surface-raised pr-1 pl-1 opacity-0 shadow-[-8px_0_8px_-2px_var(--color-surface-raised)] transition-opacity duration-150 group-focus-within:opacity-100 group-hover:opacity-100 pointer-coarse:opacity-100 motion-reduce:transition-none">
      {children}
    </div>
  );
}

/** What tells two widgets of the same kind apart in the list: the key of a key cap, the words of a text. */
function layerLabel(w: WidgetInstance, labels: ReadonlyMap<string, string>): { title: string; detail?: string } {
  const kind = w.type === "web" ? (w.widget ?? w.type) : (labels.get(w.type) ?? w.type);
  const title = w.name ?? kind;
  const options = w.options ?? {};
  let detail: string | undefined;
  if (w.type === "inputKey") detail = typeof options.label === "string" && options.label ? options.label : keyLabel(options.device === "mouse" ? "mouse" : "keyboard", typeof options.key === "string" && options.key ? options.key : "Z");
  else if (w.type === "text" && typeof options.text === "string" && options.text.trim()) detail = options.text.trim().slice(0, 28);
  // A renamed widget keeps its kind visible next to its name.
  else if (w.name && w.name !== kind) detail = kind;
  return { title, detail };
}

/** A group is named after its number: `group-3` is "Group 3". */
const groupNumber = (id: string) => id.replace(/^group-/, "");

/** Right column, bottom: every widget of the layout, front to back; a group is one expandable row. */
export function Layers() {
  const t = useT();
  const allWidgets = useEditor((s) => s.doc.widgets);
  const page = useEditor((s) => s.page);
  const widgets = allWidgets.filter((w) => w.pages.includes(page));
  const selection = useEditor((s) => s.selection);
  const { select, reorder, reorderGroup, setLocked, ungroupSelected } = useEditor.getState();
  const labels = new Map(WIDGETS.map((w) => [w.type, t(w.labelKey)]));
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set());
  const { moveUnit } = useEditor.getState();

  /** The widgets a row stands for: itself, or every member of a group (`w:<id>` / `g:<group>`). */
  const unitOf = (key: string) => (key.startsWith("g:") ? allWidgets.filter((w) => w.group === key.slice(2)).map((w) => w.id) : [key.slice(2)]);
  const drag = useRowDrag((key, target) => moveUnit(unitOf(key), unitOf(target.key), target.placement));

  const toggle = (group: string) =>
    setOpen((current) => {
      const next = new Set(current);
      if (!next.delete(group)) next.add(group);
      return next;
    });

  const widgetRow = (w: WidgetInstance, nested?: boolean) => {
    const selected = selection.includes(w.id);
    const { title, detail } = layerLabel(w, labels);
    const lockLabel = w.locked ? t("editor.unlock") : t("editor.lock");
    return (
      <li
        key={w.id}
        data-row={`w:${w.id}`}
        {...drag.rowProps(`w:${w.id}`)}
        style={drag.rowStyle(`w:${w.id}`)}
        className={`group relative flex items-center rounded-md transition-colors duration-150 ${selected ? "bg-accent/14 shadow-[inset_2px_0_0_var(--color-accent)]" : "hover:bg-wash/5"} ${drag.state?.key === `w:${w.id}` ? "bg-surface-raised" : ""}`}
      >
        <button
          type="button"
          data-grip
          // Inside a group the row picks that widget alone; elsewhere it behaves as usual.
          onClick={(e) => select([w.id], e.shiftKey || e.ctrlKey, !!nested)}
          style={nested ? { paddingLeft: 24 } : undefined}
          className={`flex min-h-9 min-w-0 flex-1 cursor-grab items-center gap-2 rounded-md ${nested ? "" : "pl-2"} pr-2 text-left text-sm outline-none focus-visible:shadow-[0_0_0_2px_var(--color-accent)] active:cursor-grabbing`}
        >
          <Icon name={widgetIcon(w.type)} className={selected ? "text-accent" : "text-ink-dim"} />
          <span className="min-w-0 truncate">{title}</span>
          {detail && <span className="min-w-0 shrink-[2] truncate text-xs text-ink-dim tabular-nums">{detail}</span>}
          {w.locked && <Icon name="lock" size={12} className="ml-auto shrink-0 text-ink-dim" />}
        </button>
        <RowActions>
          <button type="button" data-sfx="swap" title={t("editor.bringFront")} aria-label={t("editor.bringFront")} onClick={() => reorder(w.id, "forward")} className={iconButton}>
            <Icon name="chevron-up" />
          </button>
          <button type="button" data-sfx="swap" title={t("editor.sendBack")} aria-label={t("editor.sendBack")} onClick={() => reorder(w.id, "backward")} className={iconButton}>
            <Icon name="chevron-down" />
          </button>
          <button type="button" title={lockLabel} aria-label={lockLabel} aria-pressed={!!w.locked} onClick={() => setLocked([w.id], !w.locked)} className={`${iconButton} ${w.locked ? "text-ink" : ""}`}>
            <Icon name={w.locked ? "lock" : "unlock"} />
          </button>
        </RowActions>
      </li>
    );
  };

  const groupRows = (group: string, members: WidgetInstance[]) => {
    const ids = members.map((m) => m.id);
    const picked = ids.filter((id) => selection.includes(id)).length;
    const selected = picked === ids.length;
    const expanded = open.has(group);
    const locked = members.every((m) => m.locked);
    const label = t("editor.group", { n: groupNumber(group) });
    return (
      <li key={group} data-row={`g:${group}`} {...drag.rowProps(`g:${group}`)} style={drag.rowStyle(`g:${group}`)} className={drag.state?.key === `g:${group}` ? "rounded-md bg-surface-raised" : undefined}>
        <div className={`group relative flex items-center gap-1 rounded-md transition-colors duration-150 ${selected ? "bg-accent/14 shadow-[inset_2px_0_0_var(--color-accent)]" : picked > 0 ? "bg-accent/7" : "hover:bg-wash/5"}`}>
          <button
            type="button"
            title={expanded ? t("editor.collapseGroup") : t("editor.expandGroup")}
            aria-label={expanded ? t("editor.collapseGroup") : t("editor.expandGroup")}
            aria-expanded={expanded}
            onClick={() => toggle(group)}
            className={`${iconButton} ml-0.5`}
          >
            <Icon name="chevron-right" className={`transition-transform duration-200 ease-[cubic-bezier(0.2,0,0,1)] motion-reduce:transition-none ${expanded ? "rotate-90" : ""}`} />
          </button>
          <button type="button" data-grip onClick={(e) => select(ids, e.shiftKey || e.ctrlKey)} className="flex min-h-9 min-w-0 flex-1 items-center gap-2 rounded-md pr-2 text-left text-sm outline-none focus-visible:shadow-[0_0_0_2px_var(--color-accent)]">
            <Icon name="group" className={selected ? "text-accent" : "text-ink-dim"} />
            <span className="truncate">{label}</span>
            <span className="shrink-0 text-xs text-ink-dim tabular-nums">{ids.length}</span>
          </button>
          <RowActions>
            <button
              type="button"
              title={t("editor.ungroupAction")}
              aria-label={t("editor.ungroupAction")}
              onClick={() => {
                select(ids);
                ungroupSelected();
              }}
              className={iconButton}
            >
              <Icon name="ungroup" />
            </button>
            <button type="button" data-sfx="swap" title={t("editor.bringFront")} aria-label={t("editor.bringFront")} onClick={() => reorderGroup(group, "forward")} className={iconButton}>
              <Icon name="chevron-up" />
            </button>
            <button type="button" data-sfx="swap" title={t("editor.sendBack")} aria-label={t("editor.sendBack")} onClick={() => reorderGroup(group, "backward")} className={iconButton}>
              <Icon name="chevron-down" />
            </button>
            <button
              type="button"
              title={locked ? t("editor.unlock") : t("editor.lock")}
              aria-label={locked ? t("editor.unlock") : t("editor.lock")}
              aria-pressed={locked}
              onClick={() => setLocked(ids, !locked)}
              className={`${iconButton} ${locked ? "text-ink" : ""}`}
            >
              <Icon name={locked ? "lock" : "unlock"} />
            </button>
          </RowActions>
        </div>
        {/* Same fold as the palette categories; a folded group's rows leave the tab order. */}
        <div inert={!expanded} className={`grid transition-[grid-template-rows,opacity] duration-200 ease-[cubic-bezier(0.2,0,0,1)] motion-reduce:transition-none ${expanded ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}>
          <ul data-rows className="-mx-1 min-h-0 overflow-hidden px-1">
            {[...members].reverse().map((m) => widgetRow(m, true))}
          </ul>
        </div>
      </li>
    );
  }

  // Front to back; a group takes the place of its topmost member.
  const rows: ReactNode[] = [];
  const seen = new Set<string>();
  for (const w of [...widgets].reverse()) {
    if (!w.group) {
      rows.push(widgetRow(w));
    } else if (!seen.has(w.group)) {
      seen.add(w.group);
      rows.push(groupRows(w.group, widgets.filter((m) => m.group === w.group)));
    }
  }

  return (
    <Section title={t("editor.layers")} aside={widgets.length > 0 ? <span className="text-xs text-ink-dim tabular-nums">{widgets.length}</span> : undefined}>
      {widgets.length > 3 && <p className="px-0.5 text-[0.6875rem] tracking-[0.04em] text-ink-dim">{t("editor.layersFront")}</p>}
      {widgets.length === 0 ? (
        <p className="text-xs text-ink-dim">{t("editor.layersEmpty")}</p>
      ) : (
        <div className="relative">
          <ul data-rows className="-mx-1">
            {rows}
          </ul>
          {/* Where the dragged row will land: a line, not a gap, so the list does not jump under the pointer. */}
          {drag.state?.lineTop != null && <span aria-hidden className="pointer-events-none absolute -inset-x-1 h-0.5 rounded-full bg-accent" style={{ top: drag.state.lineTop - 1 }} />}
        </div>
      )}
      {widgets.length > 3 && <p className="px-0.5 text-[0.6875rem] tracking-[0.04em] text-ink-dim">{t("editor.layersBack")}</p>}
    </Section>
  );
}
