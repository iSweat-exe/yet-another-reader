import { type ReactNode, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Icon, type IconName } from "../components/Icon";
import { useT } from "../i18n";
import { isTauri } from "../lib/mock";
import { refreshWidgets, useReaderStore } from "../lib/store";
import type { WidgetInstance } from "../overlay/layout";
import { WIDGETS, WIDGET_CATEGORIES } from "../widgets/registry";
import { optionValues } from "../widgets/web";
import { IconButton, Section } from "./fields";
import { widgetIcon } from "./widgetIcons";
import { useEditor } from "./useEditor";

/** One addable widget: clicking the row adds it to the layout. */
function PaletteRow({ icon, label, hint, onAdd }: { icon: IconName; label: string; hint?: string; onAdd: () => void }) {
  const t = useT();
  return (
    <button
      type="button"
      title={hint ?? t("editor.add")}
      onClick={onAdd}
      className="group flex min-h-9 w-full items-center gap-2.5 rounded-md px-2 text-left text-sm text-ink outline-none transition-[background-color,scale] duration-150 hover:bg-white/6 focus-visible:shadow-[0_0_0_2px_var(--color-accent)] active:scale-[0.98]"
    >
      <Icon name={icon} className="text-ink-dim transition-colors duration-150 group-hover:text-ink" />
      <span className="min-w-0 flex-1 truncate">{label}</span>
      <Icon name="plus" className="text-accent opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100" />
    </button>
  );
}

/** A palette group that can be folded; the choice is remembered. */
function Category({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
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
    <section className="border-b border-white/5 px-3 py-2">
      <button type="button" aria-expanded={open} onClick={toggle} className="flex min-h-9 w-full items-center justify-between gap-2 rounded-md text-xs font-medium text-ink-dim outline-none transition-colors duration-150 hover:text-ink focus-visible:shadow-[0_0_0_2px_var(--color-accent)]">
        {title}
        <Icon name="chevron-down" size={14} className={`transition-transform duration-200 ease-[cubic-bezier(0.2,0,0,1)] motion-reduce:transition-none ${open ? "rotate-180" : ""}`} />
      </button>
      {/* Folds by animating the row height from its content to 0 (the 1fr/0fr trick); folded rows leave the tab order. */}
      <div inert={!open} className={`grid transition-[grid-template-rows,opacity] duration-200 ease-[cubic-bezier(0.2,0,0,1)] motion-reduce:transition-none ${open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}>
        <div className="-mx-1 min-h-0 overflow-hidden px-1">{children}</div>
      </div>
    </section>
  );
}

/** Left column, top: the widgets that can be added to the layout. */
export function Palette() {
  const t = useT();
  const widgets = useReaderStore((s) => s.widgets);
  const apiEnabled = useReaderStore((s) => s.settings?.apiEnabled ?? true);
  const addWidget = useEditor((s) => s.addWidget);

  return (
    <div>
      {WIDGET_CATEGORIES.map((category) => (
        <Category key={category.id} id={category.id} title={t(`category.${category.id}`)}>
          <ul className="-mx-1">
            {category.types
              .map((type) => WIDGETS.find((w) => w.type === type))
              .filter((w) => w !== undefined)
              .map((w) => (
                <li key={w.type}>
                  <PaletteRow icon={widgetIcon(w.type)} label={t(w.labelKey)} onAdd={() => addWidget({ type: w.type, size: w.defaultSize, options: w.options ? optionValues(w, undefined) : undefined })} />
                </li>
              ))}
          </ul>
        </Category>
      ))}

      <Section title={t("editor.community")} aside={<IconButton icon="refresh" label={t("editor.refresh")} onClick={() => void refreshWidgets()} />}>
        {!apiEnabled && (
          <p className="flex gap-2 rounded-md bg-amber-400/10 px-2 py-1.5 text-xs text-amber-300">
            <Icon name="web" className="mt-0.5" />
            {t("editor.apiOff")}
          </p>
        )}
        {widgets.length === 0 ? (
          <p className="text-xs text-ink-dim">{t("editor.noCommunity")}</p>
        ) : (
          <ul className="-mx-1">
            {widgets.map((w) => (
              <li key={w.id}>
                <PaletteRow icon="web" label={w.name} hint={w.description} onAdd={() => addWidget({ type: "web", widget: w.id, name: w.name, size: w.defaultSize, options: optionValues(w, undefined) })} />
              </li>
            ))}
          </ul>
        )}
        {isTauri && (
          <button
            type="button"
            onClick={() => void invoke("open_widgets_folder")}
            className="flex min-h-10 w-full items-center gap-2 rounded-md px-2 text-left text-xs text-ink-dim outline-none transition-[background-color,color,scale] duration-150 hover:bg-white/8 hover:text-ink focus-visible:shadow-[0_0_0_2px_var(--color-accent)] active:scale-[0.98]"
          >
            <Icon name="folder" />
            <span className="flex-1">{t("editor.openFolder")}</span>
            <Icon name="external" size={14} />
          </button>
        )}
      </Section>
    </div>
  );
}

const iconButton = "relative inline-flex size-7 items-center justify-center rounded-md text-ink-dim outline-none transition-[background-color,color,opacity,scale] duration-150 before:absolute before:-inset-x-0.5 before:-inset-y-1 before:content-[''] hover:bg-white/10 hover:text-ink focus-visible:opacity-100 focus-visible:shadow-[0_0_0_2px_var(--color-accent)] active:scale-[0.96]";
// Revealed by hover, by focus anywhere in the row (keyboard) and always on touch screens, where there is no hover.
const hoverOnly = "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 pointer-coarse:opacity-100";

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

  const toggle = (group: string) =>
    setOpen((current) => {
      const next = new Set(current);
      if (!next.delete(group)) next.add(group);
      return next;
    });

  const widgetRow = (w: WidgetInstance, nested?: boolean) => {
    const selected = selection.includes(w.id);
    return (
      <li key={w.id} className={`group flex items-center gap-1 rounded-md pr-1 transition-colors duration-150 ${selected ? "bg-accent/14" : "hover:bg-white/5"}`}>
        <button
          type="button"
          // Inside a group the row picks that widget alone; elsewhere it behaves as usual.
          onClick={(e) => select([w.id], e.shiftKey || e.ctrlKey, !!nested)}
          style={nested ? { paddingLeft: 28 } : undefined}
          className={`flex min-h-9 min-w-0 flex-1 items-center gap-2 rounded-md ${nested ? "" : "px-2"} pr-2 text-left text-sm outline-none focus-visible:shadow-[0_0_0_2px_var(--color-accent)]`}
        >
          <Icon name={widgetIcon(w.type)} className={selected ? "text-accent" : "text-ink-dim"} />
          <span className="truncate">{w.name ?? (w.type === "web" ? w.widget : labels.get(w.type)) ?? w.type}</span>
        </button>
        <button type="button" title={t("editor.bringFront")} aria-label={t("editor.bringFront")} onClick={() => reorder(w.id, "forward")} className={`${iconButton} ${hoverOnly}`}>
          <Icon name="chevron-up" />
        </button>
        <button type="button" title={t("editor.sendBack")} aria-label={t("editor.sendBack")} onClick={() => reorder(w.id, "backward")} className={`${iconButton} ${hoverOnly}`}>
          <Icon name="chevron-down" />
        </button>
        <button
          type="button"
          title={w.locked ? t("editor.unlock") : t("editor.lock")}
          aria-label={w.locked ? t("editor.unlock") : t("editor.lock")}
          aria-pressed={!!w.locked}
          onClick={() => setLocked([w.id], !w.locked)}
          // A locked widget keeps its icon visible so the state is never hidden.
          className={`${iconButton} ${w.locked ? "text-ink" : hoverOnly}`}
        >
          <Icon name={w.locked ? "lock" : "unlock"} />
        </button>
      </li>
    );
  }

  const groupRows = (group: string, members: WidgetInstance[]) => {
    const ids = members.map((m) => m.id);
    const picked = ids.filter((id) => selection.includes(id)).length;
    const selected = picked === ids.length;
    const expanded = open.has(group);
    const locked = members.every((m) => m.locked);
    const label = t("editor.group", { n: groupNumber(group) });
    return (
      <li key={group}>
        <div className={`group flex items-center gap-1 rounded-md pr-1 transition-colors duration-150 ${selected ? "bg-accent/14" : picked > 0 ? "bg-accent/7" : "hover:bg-white/5"}`}>
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
          <button type="button" onClick={(e) => select(ids, e.shiftKey || e.ctrlKey)} className="flex min-h-9 min-w-0 flex-1 items-center gap-2 rounded-md pr-2 text-left text-sm outline-none focus-visible:shadow-[0_0_0_2px_var(--color-accent)]">
            <Icon name="group" className={selected ? "text-accent" : "text-ink-dim"} />
            <span className="truncate">{label}</span>
            <span className="text-xs text-ink-dim tabular-nums">{ids.length}</span>
          </button>
          <button
            type="button"
            title={t("editor.ungroupAction")}
            aria-label={t("editor.ungroupAction")}
            onClick={() => {
              select(ids);
              ungroupSelected();
            }}
            className={`${iconButton} ${hoverOnly}`}
          >
            <Icon name="ungroup" />
          </button>
          <button type="button" title={t("editor.bringFront")} aria-label={t("editor.bringFront")} onClick={() => reorderGroup(group, "forward")} className={`${iconButton} ${hoverOnly}`}>
            <Icon name="chevron-up" />
          </button>
          <button type="button" title={t("editor.sendBack")} aria-label={t("editor.sendBack")} onClick={() => reorderGroup(group, "backward")} className={`${iconButton} ${hoverOnly}`}>
            <Icon name="chevron-down" />
          </button>
          <button
            type="button"
            title={locked ? t("editor.unlock") : t("editor.lock")}
            aria-label={locked ? t("editor.unlock") : t("editor.lock")}
            aria-pressed={locked}
            onClick={() => setLocked(ids, !locked)}
            className={`${iconButton} ${locked ? "text-ink" : hoverOnly}`}
          >
            <Icon name={locked ? "lock" : "unlock"} />
          </button>
        </div>
        {/* Same fold as the palette categories; a folded group's rows leave the tab order. */}
        <div inert={!expanded} className={`grid transition-[grid-template-rows,opacity] duration-200 ease-[cubic-bezier(0.2,0,0,1)] motion-reduce:transition-none ${expanded ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}>
          <ul className="-mx-1 min-h-0 overflow-hidden px-1">{[...members].reverse().map((m) => widgetRow(m, true))}</ul>
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
    <Section title={t("editor.layers")}>
      {widgets.length === 0 ? (
        <p className="text-xs text-ink-dim">{t("editor.layersEmpty")}</p>
      ) : (
        <ul className="-mx-1">{rows}</ul>
      )}
    </Section>
  );
}
