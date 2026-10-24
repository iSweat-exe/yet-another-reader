import type { IconName } from "../components/Icon";
import { useT } from "../i18n";
import { useReaderStore } from "../lib/store";
import { WIDGETS, WIDGET_CATEGORIES } from "../widgets/registry";
import { optionValues } from "../widgets/web";
import { useEditor } from "./useEditor";
import { widgetIcon } from "./widgetIcons";

/** What a widget needs to be drawn or added: enough for a preview without a layout around it. */
export interface WidgetSpec {
  type: string;
  /** Community widgets: the folder of the widget. */
  widget?: string;
  name?: string;
  size: { w: number; h: number };
  options?: Record<string, unknown>;
}

/** Something that can be added to the layout, built-in or community. */
export interface Addable {
  key: string;
  icon: IconName;
  label: string;
  hint?: string;
  /** Translated name of its category, shown next to a search result. */
  category: string;
  spec: WidgetSpec;
  /** Adds it; `at` (layout pixels) is where its centre lands, otherwise the middle of the screen. */
  add: (at?: { x: number; y: number }) => void;
}

/**
 * Every widget the editor can add, in palette order: the built-in ones by category, then the community ones.
 * Shared by the palette's list and search and by the command palette, so both offer the same things.
 */
export function useAddables() {
  const t = useT();
  const community = useReaderStore((s) => s.widgets);
  const addWidget = useEditor((s) => s.addWidget);

  const builtinOf = (type: string, category: string): Addable | null => {
    const w = WIDGETS.find((x) => x.type === type);
    if (!w) return null;
    const spec: WidgetSpec = { type: w.type, size: w.defaultSize, options: w.options ? optionValues(w, undefined) : undefined };
    return { key: w.type, icon: widgetIcon(w.type), label: t(w.labelKey), category, spec, add: (at) => addWidget(spec, at) };
  };

  /** Built-in widgets by type (unknown types are left out). */
  const present = (types: readonly string[], category = ""): Addable[] => types.map((type) => builtinOf(type, category)).filter((a): a is Addable => a !== null);

  const builtin = WIDGET_CATEGORIES.flatMap((c) => present(c.types, t(`category.${c.id}`)));
  const web: Addable[] = community.map((w) => {
    const spec: WidgetSpec = { type: "web", widget: w.id, name: w.name, size: w.defaultSize, options: optionValues(w, undefined) };
    return { key: `web:${w.id}`, icon: "web", label: w.name, hint: w.description, category: t("editor.community"), spec, add: (at) => addWidget(spec, at) };
  });

  return { present, builtin, community: web, all: [...builtin, ...web] };
}
