import { useCallback, useEffect, useRef, useState } from "react";
import { Icon } from "../components/Icon";
import { Slider } from "../components/controls";
import { type MessageKey, useT } from "../i18n";
import { FONT_ACCEPT, deleteFontFile, fontSrc, importFont, listFonts, loadFont } from "../lib/fonts";
import { isTauri } from "../lib/mock";
import type { ImageInfo } from "../lib/images";
import { useReaderStore } from "../lib/store";
import type { WidgetStyle } from "../overlay/layout";
import { BUILTIN_FONTS, OUTLINE_RANGE, SHADOWS, TRACKING_RANGE, WEIGHTS, customFontFamily, customFontId } from "../overlay/textStyle";
import { ActionButton, ColorInput, NumberInput, Row, Section, SelectInput } from "./fields";

const SAMPLE = "Aa 0123 pp";

/** A slider with its exact value beside it, for a setting that is an integer in a range. */
function SliderRow({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (value: number) => void }) {
  return (
    <Row label={label}>
      <div className="w-24">
        <Slider label={label} value={value} min={min} max={max} onChange={onChange} />
      </div>
      <NumberInput label={label} value={value} min={min} max={max} className="w-14" onChange={onChange} />
    </Row>
  );
}

/** The imported fonts, each shown in its own letters, with the button that imports another. */
function FontLibrary({ value, onPick }: { value: string | undefined; onPick: (font: string) => void }) {
  const t = useT();
  const api = useReaderStore((s) => s.api);
  const fileInput = useRef<HTMLInputElement>(null);
  const [fonts, setFonts] = useState<ImageInfo[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(() => void listFonts().then(setFonts).catch(() => setFonts([])), []);
  useEffect(refresh, [refresh]);
  // The samples are drawn in the fonts themselves, so they have to be loaded here too.
  useEffect(() => {
    for (const f of fonts) {
      const src = fontSrc(f.id, api);
      if (src) void loadFont(f.id, src);
    }
  }, [fonts, api]);

  const pick = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    setError(null);
    const result = await importFont(file);
    setBusy(false);
    if (!result.ok) return setError(t(result.error, { detail: result.detail ?? "" }));
    refresh();
    onPick(`custom:${result.id}`);
  };

  const current = customFontId(value);
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-ink-dim">{t("fonts.library")}</span>
        <ActionButton icon="upload" onClick={() => fileInput.current?.click()} disabled={busy}>
          {t("fonts.import")}
        </ActionButton>
        <input ref={fileInput} type="file" accept={FONT_ACCEPT} hidden aria-label={t("fonts.import")} onChange={(e) => { void pick(e.target.files?.[0]); e.target.value = ""; }} />
      </div>
      <p className="text-[0.6875rem] leading-snug text-ink-dim">{t("fonts.hint")}</p>
      {error && (
        <p role="alert" className="text-xs text-amber-400">
          {error}
        </p>
      )}
      {isTauri && api && !api.running && <p className="text-xs text-amber-400">{t("images.apiOff")}</p>}
      {fonts.length > 0 && (
        <ul className="space-y-1">
          {fonts.map((f, index) => {
            const selected = f.id === current;
            return (
              <li key={f.id} className="group flex items-center gap-1">
                <button
                  type="button"
                  aria-pressed={selected}
                  onClick={() => onPick(`custom:${f.id}`)}
                  style={{ fontFamily: `"${customFontFamily(f.id)}", system-ui, sans-serif` }}
                  className={`flex min-h-9 min-w-0 flex-1 items-center gap-2 rounded-md bg-surface px-2 text-left text-sm outline-none transition-[box-shadow,scale] duration-150 active:scale-[0.98] focus-visible:shadow-[0_0_0_2px_var(--color-accent)] ${selected ? "shadow-[0_0_0_2px_var(--color-accent)]" : "shadow-[0_0_0_1px_var(--ring-field)] hover:shadow-[0_0_0_1px_oklch(from_var(--wash)_l_c_h/0.4)]"}`}
                >
                  <span className="min-w-0 flex-1 truncate">{SAMPLE}</span>
                  <span className="shrink-0 font-sans text-xs text-ink-dim">{t("fonts.item", { n: index + 1 })}</span>
                </button>
                <button
                  type="button"
                  title={t("fonts.delete")}
                  aria-label={t("fonts.delete")}
                  onClick={() => void deleteFontFile(f.id).then(refresh)}
                  className="flex size-8 shrink-0 items-center justify-center rounded-md text-ink-dim opacity-0 outline-none transition-[opacity,background-color,color,scale] duration-150 group-hover:opacity-100 hover:bg-red-500/20 hover:text-red-400 focus-visible:opacity-100 focus-visible:shadow-[0_0_0_2px_var(--color-accent)] active:scale-[0.92] [@media(hover:none)]:opacity-100"
                >
                  <Icon name="trash" size={14} />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/** The type of a widget: typeface (built-in or imported), weight, spacing, shadow and outline. */
export function Typography({ style, onChange }: { style: WidgetStyle | undefined; onChange: (changes: Partial<WidgetStyle>) => void }) {
  const t = useT();
  const [imported, setImported] = useState<ImageInfo[]>([]);
  useEffect(() => void listFonts().then(setImported).catch(() => setImported([])), [style?.font]);

  const font = style?.font ?? "default";
  const fontOptions = [
    ...BUILTIN_FONTS.map((id) => ({ value: id as string, label: t(`font.${id}` as MessageKey) })),
    ...imported.map((f, i) => ({ value: `custom:${f.id}`, label: t("fonts.item", { n: i + 1 }) })),
  ];
  // A font that was deleted still names itself, so the select does not go blank.
  const known = fontOptions.some((o) => o.value === font);
  const options = known ? fontOptions : [...fontOptions, { value: font, label: t("fonts.missing") }];
  const shadow = style?.shadow ?? "auto";

  return (
    <Section title={t("editor.typography")}>
      <Row label={t("editor.font")}>
        <SelectInput label={t("editor.font")} value={font} options={options} onChange={(v) => onChange({ font: v === "default" ? undefined : v })} />
      </Row>
      <FontLibrary value={style?.font} onPick={(v) => onChange({ font: v })} />
      <Row label={t("editor.weight")}>
        <SelectInput
          label={t("editor.weight")}
          value={String(style?.weight ?? "auto")}
          options={[{ value: "auto", label: t("editor.weight.auto") }, ...WEIGHTS.map((w) => ({ value: String(w), label: t(`editor.weight.${w}` as MessageKey) }))]}
          onChange={(v) => onChange({ weight: v === "auto" ? undefined : Number(v) })}
        />
      </Row>
      <SliderRow label={t("editor.tracking")} value={style?.tracking ?? 0} min={TRACKING_RANGE.min} max={TRACKING_RANGE.max} onChange={(tracking) => onChange({ tracking: tracking === 0 ? undefined : tracking })} />
      <Row label={t("editor.shadow")}>
        <SelectInput
          label={t("editor.shadow")}
          value={shadow}
          options={SHADOWS.map((s) => ({ value: s as string, label: t(`editor.shadow.${s}` as MessageKey) }))}
          onChange={(v) => onChange({ shadow: v === "auto" ? undefined : (v as WidgetStyle["shadow"]) })}
        />
      </Row>
      {(shadow === "soft" || shadow === "strong" || shadow === "glow") && (
        <Row label={t("editor.shadowColor")}>
          <ColorInput label={t("editor.shadowColor")} value={style?.shadowColor ?? (shadow === "glow" ? (style?.color ?? "#ffffff") : "#000000")} onChange={(shadowColor) => onChange({ shadowColor })} />
        </Row>
      )}
      <SliderRow label={t("editor.outline")} value={style?.outline ?? 0} min={OUTLINE_RANGE.min} max={OUTLINE_RANGE.max} onChange={(outline) => onChange({ outline: outline === 0 ? undefined : outline })} />
      {(style?.outline ?? 0) > 0 && (
        <Row label={t("editor.outlineColor")}>
          <ColorInput label={t("editor.outlineColor")} value={style?.outlineColor ?? "#000000"} onChange={(outlineColor) => onChange({ outlineColor })} />
        </Row>
      )}
    </Section>
  );
}
