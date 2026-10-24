import { type ReactNode, useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Icon, type IconName } from "../components/Icon";
import { ThemePreview } from "../components/ThemePicker";
import { type MessageKey, useT } from "../i18n";
import { type ThemeId, THEMES, setTheme, useTheme } from "../lib/theme";
import { PAGES, type Page } from "../overlay/pages";
import { type WidgetSpec, useAddables } from "./addables";
import { type BackgroundId, BACKGROUNDS, backgroundStyle } from "./backgrounds";
import { rank } from "./commands";
import { useEditor } from "./useEditor";
import { WidgetPreview } from "./WidgetPreview";

type Kind = "action" | "page" | "layout" | "theme" | "background" | "widget";

/** Group order when nothing is typed. With a query the list is one ranked list across all of them. */
const KINDS: readonly Kind[] = ["widget", "action", "page", "layout", "theme", "background"];

type Preview = { kind: "widget"; spec: WidgetSpec } | { kind: "theme"; id: ThemeId } | { kind: "background"; id: BackgroundId } | { kind: "none" };

interface Item {
  id: string;
  kind: Kind;
  label: string;
  /** Translated name of where it comes from (a widget's category). */
  detail?: string;
  icon: IconName;
  current?: boolean;
  preview: Preview;
  run: () => void;
}

const EXIT_MS = 100;

/** The commands of the editor in one searchable list: add a widget, open a layout, change theme or background, go to a page. */
export function CommandPalette() {
  const t = useT();
  const open = useEditor((s) => s.commandOpen);
  if (!open) return null;
  return createPortal(<Palette t={t} />, document.body);
}

function Palette({ t }: { t: ReturnType<typeof useT> }) {
  const listId = useId();
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [closing, setClosing] = useState(false);
  const theme = useTheme();
  const { all } = useAddables();
  const layouts = useEditor((s) => s.layouts);
  const layoutName = useEditor((s) => s.name);
  const page = useEditor((s) => s.page);
  const background = useEditor((s) => s.background);
  const ed = useEditor.getState();

  const close = () => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return ed.setCommandOpen(false);
    setClosing(true);
    window.setTimeout(() => useEditor.getState().setCommandOpen(false), EXIT_MS);
  };

  const items = useMemo<Item[]>(() => {
    const list: Item[] = [];
    for (const a of all) list.push({ id: `widget:${a.key}`, kind: "widget", label: t("command.add", { name: a.label }), detail: a.category, icon: a.icon, preview: { kind: "widget", spec: a.spec }, run: () => a.add() });
    const actions: [string, string, IconName, () => void][] = [
      ["save", t("command.action.save"), "save", () => void useEditor.getState().save()],
      ["undo", t("command.action.undo"), "undo", () => useEditor.getState().undo()],
      ["redo", t("command.action.redo"), "redo", () => useEditor.getState().redo()],
      ["grid", t("command.action.grid"), "grid", () => useEditor.getState().setToggle("showGrid", !useEditor.getState().showGrid)],
      ["snap", t("command.action.snap"), "magnet", () => useEditor.getState().setToggle("snap", !useEditor.getState().snap)],
      ["autosave", t("command.action.autosave"), "refresh", () => useEditor.getState().setToggle("autosave", !useEditor.getState().autosave)],
    ];
    for (const [id, label, icon, run] of actions) list.push({ id: `action:${id}`, kind: "action", label, icon, preview: { kind: "none" }, run });
    for (const p of PAGES) list.push({ id: `page:${p}`, kind: "page", label: t("command.page", { name: t(`page.${p}` as MessageKey) }), icon: "play", current: p === page, preview: { kind: "none" }, run: () => useEditor.getState().setPage(p as Page) });
    for (const name of layouts) list.push({ id: `layout:${name}`, kind: "layout", label: t("command.layout", { name }), icon: "layers", current: name === layoutName, preview: { kind: "none" }, run: () => void useEditor.getState().openLayout(name) });
    for (const id of THEMES) list.push({ id: `theme:${id}`, kind: "theme", label: t("command.theme", { name: t(`theme.${id}` as MessageKey) }), icon: "star", current: id === theme, preview: { kind: "theme", id }, run: () => setTheme(id) });
    for (const id of BACKGROUNDS) list.push({ id: `bg:${id}`, kind: "background", label: t("command.background", { name: t(`editor.bg.${id}` as MessageKey) }), icon: "image", current: id === background, preview: { kind: "background", id }, run: () => useEditor.getState().setBackground(id) });
    return list;
  }, [all, layouts, layoutName, page, theme, background, t]);

  const shown = useMemo(() => {
    if (query.trim()) return rank(items, query, (i) => `${i.label} ${i.detail ?? ""} ${t(`command.kind.${i.kind}` as MessageKey)}`);
    return KINDS.flatMap((k) => items.filter((i) => i.kind === k));
  }, [items, query, t]);

  // A new search starts at the best result.
  useEffect(() => setActive(0), [query]);
  useEffect(() => input.current?.focus(), []);
  // Keep the highlighted row in view while arrowing through a long list.
  useEffect(() => {
    list.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  // The editor's own shortcuts must not act on the page behind while the palette is open.
  const run = (item: Item | undefined) => {
    if (!item) return;
    item.run();
    close();
  };
  const onKeyDown = (e: React.KeyboardEvent) => {
    const last = shown.length - 1;
    if (e.key === "ArrowDown") setActive((a) => (a >= last ? 0 : a + 1));
    else if (e.key === "ArrowUp") setActive((a) => (a <= 0 ? last : a - 1));
    else if (e.key === "Home") setActive(0);
    else if (e.key === "End") setActive(last);
    else if (e.key === "Enter") run(shown[active]);
    else if (e.key === "Escape") close();
    else return;
    e.preventDefault();
    e.stopPropagation();
  };

  const current = shown[active];
  const grouped = !query.trim();
  let lastKind: Kind | null = null;
  const rows: ReactNode[] = shown.map((item, index) => {
    const heading = grouped && item.kind !== lastKind ? <div className="px-3 pt-3 pb-1 text-[0.6875rem] font-medium tracking-[0.04em] text-ink-dim">{t(`command.group.${item.kind}` as MessageKey)}</div> : null;
    lastKind = item.kind;
    const selected = index === active;
    return (
      <div key={item.id}>
        {heading}
        <div
          id={`${listId}-${index}`}
          role="option"
          aria-selected={selected}
          data-index={index}
          onPointerMove={() => active !== index && setActive(index)}
          onClick={() => run(item)}
          className={`mx-1 flex min-h-9 cursor-pointer items-center gap-2.5 rounded-md px-2.5 text-sm transition-colors duration-100 ${selected ? "bg-accent/16 text-ink" : "text-ink"}`}
        >
          <Icon name={item.icon} className={selected ? "text-accent" : "text-ink-dim"} />
          <span className="min-w-0 flex-1 truncate">{item.label}</span>
          {item.current && <Icon name="check" size={14} className="shrink-0 text-accent" />}
          {(item.detail || !grouped) && <span className="shrink-0 truncate text-xs text-ink-dim">{item.detail ?? t(`command.kind.${item.kind}` as MessageKey)}</span>}
        </div>
      </div>
    );
  });

  return (
    <div data-closing={closing} className="modal-scrim fixed inset-0 z-[80] flex items-start justify-center bg-black/55 p-4 pt-[12vh]" onPointerDown={close}>
      <div role="dialog" data-command-palette aria-modal="true" aria-label={t("command.title")} onPointerDown={(e) => e.stopPropagation()} onKeyDown={onKeyDown} className="modal-panel flex max-h-[70vh] w-full max-w-3xl overflow-hidden rounded-2xl bg-surface-raised shadow-[0_0_0_1px_oklch(from_var(--wash)_l_c_h/0.1),0_20px_60px_oklch(0_0_0/0.6)]">
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="relative border-b border-wash/8 p-3">
            <Icon name="search" size={16} className="pointer-events-none absolute top-1/2 left-6 -translate-y-1/2 text-ink-dim" />
            <input
              ref={input}
              role="combobox"
              aria-expanded="true"
              aria-controls={listId}
              aria-activedescendant={current ? `${listId}-${active}` : undefined}
              aria-label={t("command.title")}
              placeholder={t("command.placeholder")}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="min-h-10 w-full rounded-md bg-surface py-2 pr-3 pl-9 text-sm text-ink shadow-[0_0_0_1px_var(--ring-field)] outline-none transition-shadow duration-150 focus-visible:shadow-[0_0_0_2px_var(--color-accent)]"
            />
          </div>
          <div ref={list} id={listId} role="listbox" aria-label={t("command.title")} className="min-h-0 flex-1 overflow-y-auto pb-2">
            {shown.length === 0 ? <p className="px-4 py-6 text-sm text-ink-dim">{t("command.empty", { query: query.trim() })}</p> : rows}
          </div>
          <footer className="flex items-center gap-4 border-t border-wash/8 px-4 py-2 text-xs text-ink-dim">
            <span>↑↓ {t("command.hint.move")}</span>
            <span>↵ {t("command.hint.run")}</span>
            <span>Esc {t("command.hint.close")}</span>
          </footer>
        </div>
        <aside aria-hidden className="hidden w-[340px] shrink-0 flex-col gap-3 border-l border-wash/8 p-5 md:flex">
          <PreviewPane item={current} />
        </aside>
      </div>
    </div>
  );
}

/** The right side: what the highlighted command would give, drawn rather than described. */
function PreviewPane({ item }: { item: Item | undefined }) {
  const t = useT();
  if (!item) return null;
  const p = item.preview;
  return (
    <>
      <div className="text-[0.6875rem] font-medium tracking-[0.04em] text-ink-dim">{t(`command.kind.${item.kind}` as MessageKey)}</div>
      {p.kind === "widget" && <WidgetPreview spec={p.spec} />}
      {p.kind === "theme" && (
        <div className="w-[300px]">
          <ThemePreview id={p.id} />
        </div>
      )}
      {p.kind === "background" && <div className="rounded-lg shadow-[0_0_0_1px_oklch(from_var(--wash)_l_c_h/0.12)]" style={{ width: 300, height: 168, ...backgroundStyle(p.id) }} />}
      {p.kind === "none" && <div className="flex size-[168px] items-center justify-center rounded-lg bg-wash/4 text-ink-dim"><Icon name={item.icon} size={32} /></div>}
      <div className="min-w-0">
        <div className="truncate text-sm font-medium text-ink">{item.label}</div>
        {item.detail && <div className="truncate text-xs text-ink-dim">{item.detail}</div>}
      </div>
    </>
  );
}
