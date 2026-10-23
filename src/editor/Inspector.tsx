import { Icon } from "../components/Icon";
import { type MessageKey, useT } from "../i18n";
import { useReaderStore } from "../lib/store";
import type { WidgetOption } from "../lib/types";
import { ANCHORS, type Anchor, type WidgetInstance, type WidgetStyle, alignFromAnchor, withAnchor, withAutoAnchor } from "../overlay/layout";
import { PAGES } from "../overlay/pages";
import { WIDGETS } from "../widgets/registry";
import { optionValues } from "../widgets/web";
import { ColorInput, IconButton, NumberInput, Row, Section, SelectInput, Toggle, controlClass } from "./fields";
import { averageGap, unitsOf } from "./geometry";
import { viewWidthOf, useEditor } from "./useEditor";
import { widgetIcon } from "./widgetIcons";

function AnchorPicker({ value, onChange }: { value: Anchor; onChange: (anchor: Anchor) => void }) {
  const t = useT();
  return (
    <div role="radiogroup" aria-label={t("editor.anchor")} className="grid shrink-0 grid-cols-3 gap-1 rounded-lg bg-surface p-1 shadow-[0_0_0_1px_var(--ring-field)]">
      {ANCHORS.map((anchor) => (
        <button
          key={anchor}
          type="button"
          role="radio"
          aria-checked={anchor === value}
          title={t(`anchor.${anchor}`)}
          aria-label={t(`anchor.${anchor}`)}
          onClick={() => onChange(anchor)}
          className={`flex size-8 items-center justify-center rounded-md outline-none transition-[background-color,scale] duration-150 focus-visible:shadow-[0_0_0_2px_var(--color-accent)] active:scale-[0.96] ${anchor === value ? "bg-accent" : "hover:bg-white/10"}`}
        >
          <span className={`size-1.5 rounded-full transition-colors duration-150 ${anchor === value ? "bg-surface" : "bg-ink-dim"}`} />
        </button>
      ))}
    </div>
  );
}

function OptionField({ option, value, onChange }: { option: WidgetOption; value: unknown; onChange: (value: unknown) => void }) {
  const label = option.label ?? option.key;
  switch (option.type) {
    case "boolean":
      return <Toggle label={label} checked={value === true} onChange={onChange} />;
    case "number":
      return <NumberInput label={label} value={typeof value === "number" ? value : 0} min={option.min} max={option.max} onChange={onChange} />;
    case "color":
      return <ColorInput label={label} value={typeof value === "string" ? value : "#ffffff"} onChange={onChange} />;
    case "select": {
      const choices = (option.choices ?? []).map((c) => ({ value: JSON.stringify(c.value), label: c.label ?? String(c.value) }));
      return <SelectInput label={label} value={JSON.stringify(value)} options={choices} onChange={(v) => onChange(JSON.parse(v) as unknown)} />;
    }
    default:
      return <input aria-label={label} value={typeof value === "string" ? value : ""} onChange={(e) => onChange(e.target.value)} className={`${controlClass} min-h-8 w-36 text-left`} />;
  }
}

function SingleInspector({ widget }: { widget: WidgetInstance }) {
  const t = useT();
  const doc = useEditor((s) => s.doc);
  const aspect = useEditor((s) => s.aspect);
  const manifest = useReaderStore((s) => s.widgets.find((w) => w.id === widget.widget));
  const { updateWidget, commit, removeSelected, duplicateSelected } = useEditor.getState();
  const viewWidth = viewWidthOf(doc, aspect);

  const patch = (changes: Partial<WidgetInstance>) => updateWidget(widget.id, changes);
  const style = (changes: Partial<WidgetStyle>) => patch({ style: { ...widget.style, ...changes } });
  const isWeb = widget.type === "web";
  const builtin = isWeb ? undefined : WIDGETS.find((w) => w.type === widget.type);
  const values = optionValues(isWeb ? manifest : builtin, widget.options);
  const typeLabel = isWeb ? (manifest?.name ?? widget.widget ?? "") : t(builtin?.labelKey ?? "editor.inspector");

  return (
    <>
      <header className="flex items-center gap-2.5 border-b border-white/5 px-3 py-3">
        <Icon name={widgetIcon(widget.type)} size={18} className="text-accent" />
        <div className="min-w-0 flex-1">
          <input aria-label={t("editor.name")} value={widget.name ?? ""} placeholder={typeLabel} onChange={(e) => patch({ name: e.target.value || undefined })} className="w-full truncate rounded bg-transparent px-1 py-0.5 text-sm font-medium text-ink outline-none transition-shadow duration-150 placeholder:text-ink focus-visible:shadow-[0_0_0_2px_var(--color-accent)]" />
          <p className="truncate px-1 text-[0.6875rem] text-ink-dim">{typeLabel}</p>
        </div>
        <IconButton icon="copy" label={t("editor.duplicateWidget")} onClick={duplicateSelected} />
        <IconButton icon="trash" tone="danger" label={t("editor.deleteWidget")} onClick={removeSelected} />
      </header>

      <Section title={t("editor.placement")}>
        <div className="flex items-start gap-3">
          <AnchorPicker
            value={widget.anchor}
            // Picking an anchor by hand pins it: it no longer follows the widget's position.
            onChange={(anchor) => commit({ ...doc, widgets: doc.widgets.map((w) => (w.id === widget.id ? { ...withAnchor(w, anchor, viewWidth, doc.referenceHeight), anchorLocked: true } : w)) })}
          />
          <div className="grid min-w-0 flex-1 grid-cols-2 gap-1.5">
            <NumberInput label="X" prefix="X" className="w-full" value={widget.x} onChange={(x) => patch({ x })} />
            <NumberInput label="Y" prefix="Y" className="w-full" value={widget.y} onChange={(y) => patch({ y })} />
            <NumberInput label={t("editor.width")} prefix="W" className="w-full" value={widget.w} min={1} onChange={(w) => patch({ w })} />
            <NumberInput label={t("editor.height")} prefix="H" className="w-full" value={widget.h} min={1} onChange={(h) => patch({ h })} />
          </div>
        </div>
        <Row label={t("editor.anchorAuto")}>
          <Toggle
            label={t("editor.anchorAuto")}
            checked={!widget.anchorLocked}
            onChange={(auto) =>
              commit({
                ...doc,
                widgets: doc.widgets.map((w) => {
                  if (w.id !== widget.id) return w;
                  // On: follow the position again (and re-anchor now). Off: keep the current anchor, pinned.
                  return auto ? withAutoAnchor({ ...w, anchorLocked: undefined }, viewWidth, doc.referenceHeight) : { ...w, anchorLocked: true };
                }),
              })
            }
          />
        </Row>
        <p className="text-[0.6875rem] leading-snug text-ink-dim">{t(widget.anchorLocked ? "editor.anchorManualHint" : "editor.anchorAutoHint")}</p>
      </Section>

      <Section title={t("editor.pages")}>
        <p className="text-[0.6875rem] leading-snug text-ink-dim">{t("editor.pagesHint")}</p>
        <ul className="grid grid-cols-2 gap-x-2">
          {PAGES.map((p) => {
            const on = widget.pages.includes(p);
            return (
              <li key={p}>
                <label className="flex min-h-9 cursor-pointer items-center gap-2 text-sm">
                  <Toggle
                    label={t(`page.${p}`)}
                    checked={on}
                    onChange={(checked) => {
                      const next = PAGES.filter((q) => (q === p ? checked : widget.pages.includes(q)));
                      // A widget must stay on at least one page, or it would be invisible everywhere.
                      if (next.length > 0) patch({ pages: next });
                    }}
                  />
                  {t(`page.${p}`)}
                </label>
              </li>
            );
          })}
        </ul>
      </Section>

      {isWeb ? (
        <Section title={t("editor.options")}>
          {!manifest ? (
            <p className="text-xs text-amber-400">{t("editor.widgetMissing")}</p>
          ) : (
            manifest.options.map((option) => (
              <Row key={option.key} label={option.label ?? option.key}>
                <OptionField option={option} value={values[option.key]} onChange={(value) => patch({ options: { ...values, [option.key]: value } })} />
              </Row>
            ))
          )}
          <Row label={t("editor.opacity")}>
            <NumberInput label={t("editor.opacity")} value={widget.style?.opacity ?? 1} min={0} max={1} step={0.05} onChange={(opacity) => style({ opacity })} />
          </Row>
        </Section>
      ) : (
        <>
          {builtin?.options && (
            <Section title={t("editor.options")}>
              {builtin.options.map((option) => {
                const choices = option.choices?.map((c) => ({ ...c, label: t(`widget.choice.${option.key}.${String(c.value)}` as MessageKey) }));
                return (
                  <Row key={option.key} label={t(option.labelKey)}>
                    <OptionField option={{ ...option, label: t(option.labelKey), choices }} value={values[option.key]} onChange={(value) => patch({ options: { ...values, [option.key]: value } })} />
                  </Row>
                );
              })}
            </Section>
          )}
        <Section title={t("editor.style")}>
          <Row label={t("editor.color")}>
            <ColorInput label={t("editor.color")} value={widget.style?.color ?? "#ffffff"} onChange={(color) => style({ color })} />
          </Row>
          <Row label={t("editor.scale")}>
            <NumberInput label={t("editor.scale")} value={widget.style?.scale ?? 1} min={0.1} max={10} step={0.1} onChange={(scale) => style({ scale })} />
          </Row>
          <Row label={t("editor.opacity")}>
            <NumberInput label={t("editor.opacity")} value={widget.style?.opacity ?? 1} min={0} max={1} step={0.05} onChange={(opacity) => style({ opacity })} />
          </Row>
          <Row label={t("editor.textAlign")}>
            <SelectInput
              label={t("editor.textAlign")}
              value={widget.style?.align ?? "auto"}
              options={[
                { value: "auto", label: `${t("editor.textAlignAuto")} (${t(`editor.textAlign.${alignFromAnchor(widget.anchor)}`)})` },
                { value: "left", label: t("editor.textAlign.left") },
                { value: "center", label: t("editor.textAlign.center") },
                { value: "right", label: t("editor.textAlign.right") },
              ]}
              // "Auto" removes the explicit value so the alignment follows the anchor.
              onChange={(align) => style({ align: align === "auto" ? undefined : align })}
            />
          </Row>
          <Row label={t("editor.animate")}>
            <Toggle label={t("editor.animate")} checked={widget.style?.animate !== false} onChange={(animate) => style({ animate })} />
          </Row>
          {widget.style?.animate !== false && (
            // Appears with a short fade instead of pushing the section down in one frame.
            <div className="transition-opacity duration-150 ease-out starting:opacity-0 motion-reduce:transition-none">
            <Row label={t("editor.animationMs")}>
              <NumberInput label={t("editor.animationMs")} value={widget.style?.animationMs ?? 250} min={0} max={5000} step={50} className="w-20" onChange={(animationMs) => style({ animationMs })} />
            </Row>
            </div>
          )}
        </Section>
        </>
      )}
    </>
  );
}

/** Several widgets selected: grouping and the spacing between them. */
function MultiInspector({ chosen }: { chosen: WidgetInstance[] }) {
  const t = useT();
  const doc = useEditor((s) => s.doc);
  const aspect = useEditor((s) => s.aspect);
  const { duplicateSelected, removeSelected, groupSelected, ungroupSelected, spaceSelected, distributeSelected } = useEditor.getState();
  const units = unitsOf(
    chosen.filter((w) => !w.locked),
    viewWidthOf(doc, aspect),
    doc.referenceHeight,
  );
  const rects = units.map((u) => u.rect);
  const grouped = chosen.some((w) => w.group);
  const oneGroup = new Set(chosen.map((w) => w.group ?? w.id)).size === 1;

  return (
    <>
      <header className="flex items-center gap-1 px-3 py-3">
        <Icon name={oneGroup ? "group" : "layers"} size={18} className="mr-1 text-accent" />
        <p className="min-w-0 flex-1 text-sm font-medium">{t("editor.multiSelection", { count: chosen.length })}</p>
        {!oneGroup && <IconButton icon="group" label={t("editor.groupAction")} onClick={groupSelected} />}
        {grouped && <IconButton icon="ungroup" label={t("editor.ungroupAction")} onClick={ungroupSelected} />}
        <IconButton icon="copy" label={t("editor.duplicateWidget")} onClick={duplicateSelected} />
        <IconButton icon="trash" tone="danger" label={t("editor.deleteWidget")} onClick={removeSelected} />
      </header>
      {oneGroup && <p className="px-3 pb-3 text-[0.6875rem] leading-snug text-ink-dim">{t("editor.groupHint")}</p>}
      {units.length >= 2 && (
        <Section title={t("editor.spacing")}>
          <Row label={t("editor.gapX")}>
            <NumberInput label={t("editor.gapX")} prefix="↔" className="w-24" value={Math.round(averageGap(rects, "x"))} onChange={(gap) => spaceSelected("x", gap)} />
            <IconButton icon="distribute-h" label={t("editor.distributeX")} disabled={units.length < 3} onClick={() => distributeSelected("x")} />
          </Row>
          <Row label={t("editor.gapY")}>
            <NumberInput label={t("editor.gapY")} prefix="↕" className="w-24" value={Math.round(averageGap(rects, "y"))} onChange={(gap) => spaceSelected("y", gap)} />
            <IconButton icon="distribute-v" label={t("editor.distributeY")} disabled={units.length < 3} onClick={() => distributeSelected("y")} />
          </Row>
          <p className="text-[0.6875rem] leading-snug text-ink-dim">{t("editor.spacingHint")}</p>
        </Section>
      )}
    </>
  );
}

/** Right column: properties of the selected widget. */
export function Inspector() {
  const t = useT();
  const widgets = useEditor((s) => s.doc.widgets);
  const selection = useEditor((s) => s.selection);
  const chosen = widgets.filter((w) => selection.includes(w.id));

  return (
    <div className="min-h-0 overflow-y-auto">
      {chosen.length === 0 ? (
        <p className="px-4 py-6 text-sm text-ink-dim">{t("editor.noSelection")}</p>
      ) : chosen.length === 1 ? (
        <SingleInspector key={chosen[0].id} widget={chosen[0]} />
      ) : (
        <MultiInspector chosen={chosen} />
      )}
    </div>
  );
}
