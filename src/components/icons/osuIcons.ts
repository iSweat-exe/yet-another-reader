/**
 * The osu!lazer icons (`public/Textures/icons/`) that stand in for an SVG icon of `Icon.tsx`, or that exist
 * only as a PNG. They are white and monochrome, so `Icon` uses them as a CSS mask over `currentColor`: they
 * take the colour, the size and the hover / disabled / accent states of the surrounding text like an SVG.
 *
 * An icon name listed here wins over the SVG of the same name. Where no osu icon has the right meaning, the
 * name is simply not listed and the SVG stays. See `docs/CONTRIBUTING.md` to add one.
 */
export interface OsuIcon {
  /** Path under `Textures/icons/`, without the extension. */
  file: string;
  /**
   * How much of the picture the drawing fills along its longest side, in percent. The PNGs have different
   * margins (a bare cross fills half of its square, a circle 90%), so `Icon` scales each one to look as big
   * as the others.
   */
  ext: number;
  /** Mirrored horizontally (redo is undo turned around). */
  flip?: boolean;
}

const icon = (file: string, ext = 90, flip = false): OsuIcon => ({ file, ext, ...(flip ? { flip } : {}) });

export const OSU_ICONS = {
  // Replace an SVG icon of the same name.
  plus: icon("add"),
  close: icon("cross", 50),
  "check-circle": icon("check-circle"),
  copy: icon("user-interface", 82),
  pencil: icon("EditCircle", 98),
  trash: icon("delete"),
  undo: icon("undo", 100),
  redo: icon("undo", 100, true),
  folder: icon("collections"),
  search: icon("search", 82),
  monitor: icon("graphics"),
  grid: icon("Editor/grid", 95),
  magnet: icon("Editor/grid-snap", 95),
  cursor: icon("Editor/select", 98),
  clock: icon("clock", 94),
  score: icon("tournament", 82),
  rank: icon("ranking", 82),
  health: icon("heart"),
  beatmap: icon("beatmap"),
  user: icon("player"),
  globe: icon("global"),
  web: icon("online"),
  keyboard: icon("input", 86),
  hits: icon("Editor/hitcircle", 93),
  accuracy: icon("BeatmapDetails/accuracy", 72),
  // Only exist as an osu icon.
  settings: icon("settings"),
  debug: icon("debug"),
  home: icon("home"),
  wiki: icon("wiki", 82),
  music: icon("music", 82),
  play: icon("play", 70),
  online: icon("online"),
  metronome: icon("metronome", 86),
  "star-outline": icon("star", 88),
  /** The up-and-down chevrons of a drop-down. */
  expand: icon("expand-a", 82),
  "approach-rate": icon("BeatmapDetails/approach-rate", 60),
  "overall-difficulty": icon("BeatmapDetails/overall-difficulty", 66),
  "hp-drain": icon("BeatmapDetails/hp-drain", 44),
  "circle-size": icon("BeatmapDetails/circles", 66),
  discord: icon("discord"),
  twitter: icon("twitter", 98),
  notification: icon("notification"),
} as const satisfies Record<string, OsuIcon>;

export type OsuIconName = keyof typeof OSU_ICONS;

/** URL of an osu icon's picture. */
export function osuIconUrl(file: string): string {
  return `/Textures/icons/${file}.png`;
}

/** Share of the icon's box that the drawing should fill, so that an osu icon looks as big as an SVG one. */
export const TARGET_EXTENT = 0.8;
/** An icon that is mostly margin is not scaled up past this multiple of its box (it would bleed into its neighbours). */
const MAX_SCALE = 1.5;

/** Size of the picture relative to the icon's box so that the drawing fills {@link TARGET_EXTENT}. */
export function osuIconScale(ext: number): number {
  return Math.min(MAX_SCALE, TARGET_EXTENT / (ext / 100));
}
