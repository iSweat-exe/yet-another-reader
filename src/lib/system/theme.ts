import { useSyncExternalStore } from "react";

/**
 * The look of the app's own windows (never the in-game overlay, which is drawn over the game). A theme is a set of
 * design tokens in `index.css`, selected by `data-theme` on `<html>`; "graphite" is the original and has no attribute.
 * The choice is a preference of this machine, so it lives in the browser storage of the webview.
 */
export const THEMES = ["graphite", "midnight", "paper", "terminal", "sakura", "ember", "mono", "synthwave", "gameboy", "blueprint", "newsprint", "amber", "nord", "cyber", "matcha"] as const;
export type ThemeId = (typeof THEMES)[number];

export const DEFAULT_THEME: ThemeId = "graphite";

/** The colours a theme card previews: page, panel, text and accent. They mirror the tokens in `index.css`. */
export const THEME_SWATCHES: Record<ThemeId, { surface: string; raised: string; ink: string; accent: string; radius: number }> = {
  graphite: { surface: "oklch(0.175 0.004 80)", raised: "oklch(0.21 0.005 80)", ink: "oklch(0.95 0.004 80)", accent: "oklch(0.72 0.19 355)", radius: 4 },
  midnight: { surface: "oklch(0.19 0.03 260)", raised: "oklch(0.23 0.035 260)", ink: "oklch(0.95 0.015 250)", accent: "oklch(0.8 0.13 215)", radius: 6 },
  paper: { surface: "oklch(0.975 0.008 85)", raised: "oklch(0.945 0.01 85)", ink: "oklch(0.24 0.012 70)", accent: "oklch(0.55 0.21 355)", radius: 6 },
  terminal: { surface: "oklch(0.14 0.02 155)", raised: "oklch(0.175 0.025 155)", ink: "oklch(0.9 0.14 150)", accent: "oklch(0.86 0.2 145)", radius: 0 },
  sakura: { surface: "oklch(0.22 0.04 330)", raised: "oklch(0.26 0.045 330)", ink: "oklch(0.96 0.015 340)", accent: "oklch(0.84 0.1 350)", radius: 12 },
  ember: { surface: "oklch(0.2 0.025 45)", raised: "oklch(0.24 0.03 45)", ink: "oklch(0.95 0.02 75)", accent: "oklch(0.76 0.17 55)", radius: 3 },
  mono: { surface: "oklch(0.1 0 0)", raised: "oklch(0.14 0 0)", ink: "oklch(0.98 0 0)", accent: "oklch(1 0 0)", radius: 2 },
  synthwave: { surface: "oklch(0.18 0.06 300)", raised: "oklch(0.22 0.07 300)", ink: "oklch(0.96 0.03 330)", accent: "oklch(0.86 0.14 205)", radius: 2 },
  gameboy: { surface: "oklch(0.77 0.17 122)", raised: "oklch(0.7 0.16 123)", ink: "oklch(0.3 0.07 145)", accent: "oklch(0.3 0.07 145)", radius: 0 },
  blueprint: { surface: "oklch(0.36 0.1 255)", raised: "oklch(0.41 0.1 255)", ink: "oklch(0.97 0.01 240)", accent: "oklch(0.9 0.15 95)", radius: 0 },
  newsprint: { surface: "oklch(0.96 0 0)", raised: "oklch(0.925 0 0)", ink: "oklch(0.15 0 0)", accent: "oklch(0.5 0.22 25)", radius: 0 },
  amber: { surface: "oklch(0.15 0.03 70)", raised: "oklch(0.19 0.035 70)", ink: "oklch(0.82 0.15 75)", accent: "oklch(0.85 0.17 80)", radius: 0 },
  nord: { surface: "oklch(0.32 0.025 260)", raised: "oklch(0.37 0.03 260)", ink: "oklch(0.95 0.01 250)", accent: "oklch(0.8 0.07 205)", radius: 6 },
  cyber: { surface: "oklch(0.15 0.015 285)", raised: "oklch(0.19 0.02 285)", ink: "oklch(0.95 0.03 100)", accent: "oklch(0.9 0.18 100)", radius: 0 },
  matcha: { surface: "oklch(0.97 0.02 130)", raised: "oklch(0.94 0.03 130)", ink: "oklch(0.27 0.04 150)", accent: "oklch(0.55 0.15 150)", radius: 8 },
};

const KEY = "yar.theme";

export const isThemeId = (value: unknown): value is ThemeId => typeof value === "string" && (THEMES as readonly string[]).includes(value);

/** The theme saved on this machine (the original when none, or when storage is unavailable). */
export function storedTheme(): ThemeId {
  try {
    const saved = localStorage.getItem(KEY);
    return isThemeId(saved) ? saved : DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
  }
}

let current: ThemeId = DEFAULT_THEME;
const listeners = new Set<() => void>();

/** Puts a theme on the document; the original removes the attribute so nothing of it is left behind. */
function paint(theme: ThemeId) {
  if (theme === DEFAULT_THEME) delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = theme;
}

/** Applies the saved theme; called before the first render so the window never flashes the wrong colours. */
export function initTheme(): void {
  current = storedTheme();
  paint(current);
}

export function setTheme(theme: ThemeId): void {
  current = theme;
  paint(theme);
  try {
    localStorage.setItem(KEY, theme);
  } catch {
    /* not remembered */
  }
  listeners.forEach((l) => l());
}

export function useTheme(): ThemeId {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => current,
  );
}
