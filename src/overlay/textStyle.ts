import type { CSSProperties } from "react";
import type { WidgetStyle } from "./layout";

/**
 * The typography of a widget (`WidgetStyle.font`, `weight`, `tracking`, `shadow`, `outline`…) as CSS. Everything is
 * optional: a layout that sets none of it draws exactly what it always drew.
 */

/** The typefaces every machine has (or a close cousin of them); a widget can also use an imported font, `custom:<id>`. */
export const BUILTIN_FONTS = ["default", "system", "serif", "mono", "rounded", "condensed", "handwriting"] as const;
export type BuiltinFont = (typeof BUILTIN_FONTS)[number];

const STACKS: Record<Exclude<BuiltinFont, "default">, string> = {
  system: 'system-ui, "Segoe UI Variable", "Segoe UI", sans-serif',
  serif: '"Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif',
  mono: 'ui-monospace, "Cascadia Mono", Consolas, "SF Mono", monospace',
  rounded: 'ui-rounded, "Arial Rounded MT Bold", "Varela Round", Nunito, "Segoe UI", sans-serif',
  condensed: '"Bahnschrift SemiCondensed", "Bahnschrift", "Arial Narrow", "Roboto Condensed", sans-serif',
  handwriting: '"Segoe Print", "Bradley Hand", "Comic Sans MS", cursive',
};

export const SHADOWS = ["auto", "none", "soft", "strong", "glow"] as const;
export type ShadowKind = (typeof SHADOWS)[number];

export const WEIGHTS = [100, 200, 300, 400, 500, 600, 700, 800, 900] as const;
export const TRACKING_RANGE = { min: -10, max: 50 } as const; // hundredths of an em
export const OUTLINE_RANGE = { min: 0, max: 8 } as const; // px

/** What the overlay has always drawn behind text, so it stays legible over any game scene. */
const AUTO_SHADOW = "0 0 2px rgb(0 0 0 / 0.5), 0 1px 3px rgb(0 0 0 / 0.85)";

const CUSTOM = /^custom:([0-9a-f]{32}\.(?:ttf|otf|woff|woff2))$/;

/** The id of the imported font a `font` value names, or `null` for a built-in typeface. */
export function customFontId(font: string | undefined): string | null {
  return font?.match(CUSTOM)?.[1] ?? null;
}

/** The CSS family name an imported font is registered under (see `lib/fonts.ts`). */
export const customFontFamily = (id: string) => `yar-font-${id.slice(0, 16)}`;

const clamp = (n: unknown, min: number, max: number, fallback: number) => (typeof n === "number" && Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback);

/** The text shadow of a widget: the default one, none, or a soft, strong or glowing one in the chosen colour. */
export function shadowCss(kind: ShadowKind | undefined, color: string | undefined, textColor: string): string | undefined {
  const c = color ?? "rgb(0 0 0 / 0.85)";
  switch (kind) {
    case "none":
      return "none";
    case "soft":
      return `0 1px 2px ${c}`;
    case "strong":
      return `0 0 3px ${c}, 0 2px 6px ${c}, 0 0 12px ${c}`;
    case "glow": {
      const glow = color ?? textColor;
      return `0 0 6px ${glow}, 0 0 16px ${glow}, 0 0 32px ${glow}`;
    }
    default:
      return AUTO_SHADOW;
  }
}

export interface TextLook {
  css: CSSProperties;
  /** A weight that applies to the whole widget (set with `data-weight`, see `index.css`). */
  weight?: number;
  /** The imported font to load before the text can use it. */
  fontId: string | null;
}

/** The typography of a widget style. */
export function textLook(style: WidgetStyle | undefined): TextLook {
  const css: CSSProperties = {};
  const fontId = customFontId(style?.font);
  if (fontId) css.fontFamily = `"${customFontFamily(fontId)}", ${STACKS.system}`;
  else if (style?.font && style.font in STACKS) css.fontFamily = STACKS[style.font as keyof typeof STACKS];

  const tracking = clamp(style?.tracking, TRACKING_RANGE.min, TRACKING_RANGE.max, 0);
  if (tracking !== 0) css.letterSpacing = `${tracking / 100}em`;

  css.textShadow = shadowCss(style?.shadow, style?.shadowColor, style?.color ?? "#ffffff");

  const outline = clamp(style?.outline, OUTLINE_RANGE.min, OUTLINE_RANGE.max, 0);
  if (outline > 0) {
    // Stroke behind the fill, so the letters keep their shape instead of being eaten from the inside.
    css.WebkitTextStroke = `${outline}px ${style?.outlineColor ?? "#000000"}`;
    css.paintOrder = "stroke fill";
  }

  const weight = style?.weight === undefined ? undefined : Math.round(clamp(style.weight, 100, 900, 400) / 100) * 100;
  return { css, weight, fontId };
}
