import type { CSSProperties } from "react";
import { MENU_BACKGROUNDS, menuBackgroundUrl } from "../../lib/media/assets";

/**
 * What the editor draws behind the overlay. The overlay is shown on top of the game, so a layout is judged against
 * the kinds of picture it will meet: dark and bright scenes, a flat key colour (to cut it out in a stream), the
 * checkerboard that stands for "nothing", and real beatmap-style pictures.
 */
const GRADIENTS = {
  rose: "linear-gradient(135deg, #1e1b4b, #831843 60%, #0f172a)",
  night: "linear-gradient(135deg, #05070f, #151a33 55%, #0b0f1f)",
  ocean: "linear-gradient(135deg, #0b2239, #0e5b7a 60%, #06141f)",
  forest: "linear-gradient(135deg, #07150e, #1e5a38 60%, #0a1a12)",
  sunset: "linear-gradient(135deg, #2b0f3a, #b4381d 60%, #f59e0b)",
  light: "linear-gradient(135deg, #f3f5fa, #cfd8ea 60%, #e9edf7)",
} as const;

const SOLIDS = {
  black: "#000000",
  green: "#00b140",
} as const;

const CHECKER = "repeating-conic-gradient(#2b2b2b 0% 25%, #3d3d3d 0% 50%) 0 0 / 24px 24px";

export const PHOTO_IDS = Array.from({ length: MENU_BACKGROUNDS }, (_, i) => `photo${i + 1}` as const);

export type BackgroundId = keyof typeof GRADIENTS | keyof typeof SOLIDS | "checker" | (typeof PHOTO_IDS)[number];

/** Every background, in picker order. */
export const BACKGROUNDS: readonly BackgroundId[] = [...(Object.keys(GRADIENTS) as (keyof typeof GRADIENTS)[]), ...(Object.keys(SOLIDS) as (keyof typeof SOLIDS)[]), "checker", ...PHOTO_IDS];

export const DEFAULT_BACKGROUND: BackgroundId = "rose";

export const isBackgroundId = (value: unknown): value is BackgroundId => typeof value === "string" && (BACKGROUNDS as readonly string[]).includes(value);

/** The CSS of a background, for the screen of the editor and for the swatch of the picker. */
export function backgroundStyle(id: BackgroundId): CSSProperties {
  if (id in GRADIENTS) return { background: GRADIENTS[id as keyof typeof GRADIENTS] };
  if (id in SOLIDS) return { background: SOLIDS[id as keyof typeof SOLIDS] };
  if (id === "checker") return { background: CHECKER };
  const n = Number(id.slice("photo".length));
  // A veil keeps the pictures in the range of a game scene (they are meant to be darkened).
  return { background: `linear-gradient(rgb(0 0 0 / 0.35), rgb(0 0 0 / 0.35)), url("${menuBackgroundUrl(n)}") center / cover` };
}
