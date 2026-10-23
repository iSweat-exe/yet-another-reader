import { onTabListKeyDown } from "../components/tabKeys";
import { useT } from "../i18n";
import { PAGES } from "../overlay/pages";
import { useEditor } from "./useEditor";

/** Chooses the page being edited: each page is a moment of the game with its own set of widgets. */
export function PageTabs() {
  const t = useT();
  const page = useEditor((s) => s.page);
  const widgets = useEditor((s) => s.doc.widgets);
  const setPage = useEditor((s) => s.setPage);

  return (
    <div role="tablist" aria-label={t("editor.pages")} onKeyDown={onTabListKeyDown} className="flex items-stretch overflow-x-auto border-b border-white/8 bg-surface-raised px-1">
      {PAGES.map((p) => {
        const count = widgets.filter((w) => w.pages.includes(p)).length;
        const active = p === page;
        return (
          <button
            key={p}
            type="button"
            role="tab"
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            onClick={() => setPage(p)}
            className={`relative flex min-h-10 shrink-0 items-center gap-2 px-3 text-sm outline-none transition-[color,scale] duration-150 active:scale-[0.96] focus-visible:shadow-[inset_0_0_0_2px_var(--color-accent)] after:absolute after:inset-x-0 after:-bottom-px after:h-0.5 after:origin-center after:bg-accent after:transition-transform after:duration-200 after:ease-out motion-reduce:after:transition-none ${active ? "text-ink after:scale-x-100" : "text-ink-dim after:scale-x-0 hover:text-ink"}`}
          >
            {t(`page.${p}`)}
            <span className={`text-xs tabular-nums ${active ? "text-accent" : "text-ink-dim"}`}>{count}</span>
          </button>
        );
      })}
    </div>
  );
}
