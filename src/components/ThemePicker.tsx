import { type MessageKey, useT } from "../i18n";
import { THEMES, THEME_SWATCHES, type ThemeId, setTheme, useTheme } from "../lib/theme";
import { Icon } from "./Icon";

/** A miniature of the app in a theme's colours: a header with its accent tab, a panel and a line of text. */
export function ThemePreview({ id }: { id: ThemeId }) {
  const c = THEME_SWATCHES[id];
  return (
    <span aria-hidden className="block h-16 w-full overflow-hidden" style={{ background: c.surface, borderRadius: c.radius + 2 }}>
      <span className="flex items-center gap-1.5 px-2 py-1.5">
        <span className="h-1.5 w-6" style={{ background: c.accent, borderRadius: c.radius }} />
        <span className="h-1.5 w-8 opacity-50" style={{ background: c.ink, borderRadius: c.radius }} />
        <span className="h-1.5 w-5 opacity-30" style={{ background: c.ink, borderRadius: c.radius }} />
      </span>
      <span className="mx-2 mt-1 block h-8 p-1.5" style={{ background: c.raised, borderRadius: c.radius }}>
        <span className="block h-1.5 w-3/4 opacity-80" style={{ background: c.ink, borderRadius: c.radius }} />
        <span className="mt-1.5 block h-1.5 w-1/2 opacity-40" style={{ background: c.ink, borderRadius: c.radius }} />
      </span>
    </span>
  );
}

/** The themes of the app as a row of cards; picking one applies it at once (there is nothing to save). */
export function ThemePicker() {
  const t = useT();
  const theme = useTheme();
  return (
    <div role="radiogroup" aria-label={t("theme.title")} className="grid grid-cols-2 gap-3 py-4 sm:grid-cols-3 lg:grid-cols-4">
      {THEMES.map((id) => {
        const selected = id === theme;
        return (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => setTheme(id)}
            className={`group relative flex flex-col gap-2 rounded-xl p-2 text-left outline-none transition-[box-shadow,scale,background-color] duration-150 ease-out hover:bg-wash/5 focus-visible:shadow-[0_0_0_2px_var(--color-accent)] active:scale-[0.97] motion-reduce:transition-none ${selected ? "shadow-[0_0_0_2px_var(--color-accent)]" : "shadow-[0_0_0_1px_var(--ring-field)]"}`}
          >
            <ThemePreview id={id} />
            <span className="flex items-center justify-between gap-2 px-0.5">
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium text-ink">{t(`theme.${id}` as MessageKey)}</span>
                <span className="block truncate text-xs text-ink-dim">{t(`theme.${id}.hint` as MessageKey)}</span>
              </span>
              {selected && <Icon name="check" size={14} className="shrink-0 text-accent" />}
            </span>
          </button>
        );
      })}
    </div>
  );
}
