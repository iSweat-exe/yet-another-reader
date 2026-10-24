import { BAR_WIDGETS } from "./builtin/bars";
import { BASIC_WIDGETS } from "./builtin/basic";
import { DIFFICULTY_GRAPH_WIDGETS } from "./builtin/difficultyGraph";
import { HISTORY_WIDGETS } from "./builtin/history";
import { IMAGE_WIDGETS } from "./builtin/image";
import { INFO_WIDGETS } from "./builtin/info";
import { INPUT_WIDGETS } from "./builtin/input";
import { LIVE_WIDGETS } from "./builtin/live";
import { MAP_WIDGETS } from "./builtin/map";
import { MISC_WIDGETS } from "./builtin/misc";
import { PLAYER_WIDGETS } from "./builtin/player";
import { SOCIAL_WIDGETS } from "./builtin/social";
import type { WidgetDefinition } from "./types";

export const WIDGETS: readonly WidgetDefinition[] = [...BASIC_WIDGETS, ...BAR_WIDGETS, ...INFO_WIDGETS, ...PLAYER_WIDGETS, ...SOCIAL_WIDGETS, ...INPUT_WIDGETS, ...MAP_WIDGETS, ...LIVE_WIDGETS, ...MISC_WIDGETS, ...IMAGE_WIDGETS, ...DIFFICULTY_GRAPH_WIDGETS, ...HISTORY_WIDGETS];

const BY_TYPE = new Map(WIDGETS.map((w) => [w.type, w]));

export function widgetDefinition(type: string): WidgetDefinition | undefined {
  return BY_TYPE.get(type);
}

export type WidgetCategory = "gameplay" | "beatmap" | "player" | "input" | "other";

/** Widgets that show the held keys: the app only reads them from the game while one is on screen. */
export const INPUT_WIDGET_TYPES: ReadonlySet<string> = new Set(INPUT_WIDGETS.map((w) => w.type));

/** A named run of widgets inside a palette category (the editor shows its title when the category has several). */
export interface WidgetGroup {
  id: string;
  types: readonly string[];
}

/** How the editor's palette groups the built-in widgets, in display order: categories, then groups of related widgets. */
const CATEGORY_GROUPS: readonly { id: WidgetCategory; groups: readonly WidgetGroup[] }[] = [
  {
    id: "gameplay",
    groups: [
      { id: "score", types: ["score", "combo", "maxCombo", "accuracy", "rank", "ur"] },
      { id: "pp", types: ["pp", "ppFc", "ppSs", "ppMax", "ppTable"] },
      { id: "judgements", types: ["great", "ok", "meh", "miss", "hitErrors", "hitErrorBar"] },
      { id: "history", types: ["playGraph", "pbDelta"] },
      { id: "state", types: ["health", "progress", "playStatus"] },
    ],
  },
  {
    id: "beatmap",
    groups: [
      { id: "identity", types: ["beatmapInfo", "title", "artist", "mapper", "version", "background"] },
      { id: "difficulty", types: ["stars", "difficultyGraph", "bpm", "cs", "ar", "od", "hp"] },
      { id: "time", types: ["timer", "mods"] },
    ],
  },
  {
    id: "player",
    groups: [
      { id: "profile", types: ["avatar", "username", "flag", "spectators"] },
      { id: "stats", types: ["globalRank", "countryRank", "playerPp", "playerAccuracy", "playCount"] },
    ],
  },
  { id: "input", groups: [{ id: "keys", types: ["inputKey", "kps"] }] },
  { id: "other", groups: [{ id: "misc", types: ["text", "clock", "image"] }] },
];

export const WIDGET_CATEGORIES: readonly { id: WidgetCategory; groups: readonly WidgetGroup[]; types: readonly string[] }[] = CATEGORY_GROUPS.map((c) => ({
  ...c,
  types: c.groups.flatMap((g) => g.types),
}));
