import type { GameState } from "../lib/types";

/**
 * A "page" is a moment of the game an overlay can be drawn for. Each widget lists the pages it is
 * shown on, so one layout can hold a gameplay HUD, a pause screen, a song-select card, and so on.
 */
export type Page = "playing" | "paused" | "break" | "songSelect" | "results" | "menu";

export const PAGES: readonly Page[] = ["playing", "paused", "break", "songSelect", "results", "menu"];

/** The pages of an active play: what widgets used to get from `visibleWhen: "playing"`. */
export const PLAY_PAGES: readonly Page[] = ["playing", "paused", "break"];

export const isPage = (value: unknown): value is Page => PAGES.includes(value as Page);

/**
 * The page the game is on right now, or `null` when it is somewhere nothing can be drawn for
 * (editor, multiplayer lobby, unknown screen). Mirrored in `src-tauri/src/overlay.rs`.
 */
export function pageOf(game: Pick<GameState, "connected" | "screen" | "playing" | "gameplay">): Page | null {
  if (!game.connected) return null;
  if (game.gameplay) {
    if (game.gameplay.paused) return "paused";
    return game.playing === "break" ? "break" : "playing";
  }
  switch (game.screen) {
    case "songSelect":
      return "songSelect";
    case "results":
      return "results";
    case "menu":
      return "menu";
    default:
      return null;
  }
}
