import type { ComponentType } from "react";
import type { MessageKey } from "../i18n";
import type { WidgetOption } from "../lib/state/types";
import type { WidgetInstance } from "../overlay/model/layout";

export interface WidgetProps {
  instance: WidgetInstance;
}

/** An option of a built-in widget: the same fields as a community widget's manifest, with a translated label. */
export type BuiltinOption = WidgetOption & {
  labelKey: MessageKey;
  /** Choices that depend on the other options (already labelled): replaces `choices` in the editor. */
  choicesFor?: (values: Record<string, unknown>) => { value: unknown; label: string }[];
  /** Options to set at the same time as this one changes (e.g. a key that no longer fits the device). */
  alsoSet?: (value: unknown) => Record<string, unknown>;
};

export interface WidgetDefinition {
  type: string;
  /** Translation key of the widget's name. */
  labelKey: MessageKey;
  /** Size used when the widget is added from the editor. */
  defaultSize: { w: number; h: number };
  Component: ComponentType<WidgetProps>;
  /** Settings the editor shows as a form, saved in the widget's `options`. */
  options?: BuiltinOption[];
}

/** Tween length for a widget's numbers: `0` when animation is off. */
export function animationMsFor(instance: WidgetInstance): number {
  const style = instance.style;
  return style?.animate === false ? 0 : (style?.animationMs ?? 250);
}

/** Font size in layout pixels: a fraction of the box height, times the user's scale. */
export function fontSizeFor(instance: WidgetInstance, fraction: number): number {
  return instance.h * fraction * (instance.style?.scale ?? 1);
}
