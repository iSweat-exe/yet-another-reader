import { BAR_WIDGETS } from "./bars";
import { BASIC_WIDGETS } from "./basic";
import { INFO_WIDGETS } from "./info";
import { INPUT_WIDGETS } from "./input";
import { LIVE_WIDGETS } from "./live";
import { MAP_WIDGETS } from "./map";
import { MISC_WIDGETS } from "./misc";
import { PLAYER_WIDGETS } from "./player";
import type { WidgetDefinition } from "./types";

export const WIDGETS: readonly WidgetDefinition[] = [...BASIC_WIDGETS, ...BAR_WIDGETS, ...INFO_WIDGETS, ...PLAYER_WIDGETS, ...INPUT_WIDGETS, ...MAP_WIDGETS, ...LIVE_WIDGETS, ...MISC_WIDGETS];

const BY_TYPE = new Map(WIDGETS.map((w) => [w.type, w]));

export function widgetDefinition(type: string): WidgetDefinition | undefined {
  return BY_TYPE.get(type);
}

export type WidgetCategory = "gameplay" | "beatmap" | "player" | "input" | "other";

/** Widgets that show the held keys: the app only reads them from the game while one is on screen. */
export const INPUT_WIDGET_TYPES: ReadonlySet<string> = new Set(INPUT_WIDGETS.map((w) => w.type));

/** How the editor's palette groups the built-in widgets, in display order. */
export const WIDGET_CATEGORIES: readonly { id: WidgetCategory; types: readonly string[] }[] = [
  { id: "gameplay", types: ["score", "combo", "accuracy", "rank", "pp", "ppFc", "ppSs", "ppTable", "playStatus", "ur", "health", "progress", "great", "ok", "meh", "miss", "hitErrors", "maxCombo"] },
  { id: "beatmap", types: ["beatmapInfo", "title", "artist", "mapper", "version", "background", "stars", "bpm", "cs", "ar", "od", "hp", "timer", "mods"] },
  { id: "player", types: ["avatar", "username", "globalRank", "countryRank", "playerPp", "playerAccuracy", "playCount"] },
  { id: "input", types: ["inputKey", "kps"] },
  { id: "other", types: ["text", "clock"] },
];
