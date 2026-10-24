import type { Lang } from "../../i18n/languages";
/** Mirrors the JSON published by the local API (see docs/DATA_MODEL.md). */

export type Screen =
  | "unknown"
  | "menu"
  | "songSelect"
  | "playing"
  | "results"
  | "editor"
  | "multiplayer"
  | "other";

export type PlayingState = "notPlaying" | "break" | "playing";

export interface Assets {
  background: boolean;
  audio: boolean;
}

export interface Paths {
  beatmap: string | null;
  background: string | null;
  audio: string | null;
}

export interface Beatmap {
  title: string;
  titleUnicode: string;
  artist: string;
  artistUnicode: string;
  version: string;
  creator: string;
  source: string;
  tags: string;
  onlineId: number;
  setOnlineId: number;
  status: string;
  ruleset: string;
  md5: string;
  sha256: string;
  lengthMs: number;
  bpm: number;
  starRating: number;
  cs: number;
  ar: number;
  od: number;
  hp: number;
  sliderMultiplier: number;
  sliderTickRate: number;
  objectCount: number;
  previewTimeMs: number;
  audioFile: string;
  backgroundFile: string;
  paths: Paths;
  assets: Assets;
}

export interface Hits {
  great: number;
  ok: number;
  meh: number;
  miss: number;
}

export interface Pp {
  live: number;
  fc: number;
  ss: number;
}

export interface Difficulty {
  stars: number;
  maxCombo: number;
  pp95: number;
  pp98: number;
  pp99: number;
  pp100: number;
  /** Song time of the first hit object (ms): where a timer that ignores the intro starts. */
  firstObjectMs: number;
  /** Song time of the last hit object (ms): where that timer ends. */
  lastObjectMs: number;
}

/** How hard each part of the beatmap is, relative to the rest of the same map (with the selected mods). */
export interface DifficultyGraph {
  /** Song time covered by `buckets`, in milliseconds. */
  durationMs: number;
  /** The overall difficulty: the star rating with the selected mods. */
  overall: number;
  /** Song time of the hardest bucket, in milliseconds. */
  peakMs: number;
  /** Strain per bucket, `0` (calmest) to `1` (the hardest section of the map). */
  buckets: number[];
}

export interface Time {
  currentMs: number;
  running: boolean;
  source: "global" | "gameplay";
}

export interface UserStatistics {
  globalRank: number | null;
  countryRank: number | null;
  pp: number | null;
  accuracy: number;
  playCount: number;
  totalHits: number;
  maxCombo: number;
  rankedScore: number;
  totalScore: number;
}

export interface User {
  id: number;
  username: string;
  countryCode: string;
  avatarUrl: string;
  apiState: string;
  statistics: UserStatistics | null;
}

/** A user spectating the signed-in user (`spectators` of the game state). */
export interface Spectator {
  id: number;
  username: string;
  /** Avatar address (`https://a.ppy.sh/{id}`, hosted by osu!); absent for an account without one. */
  avatarUrl?: string;
}

/** The keys and mouse buttons held down right now, as the game sees them (see `/api/v1/inputs`). */
export interface InputState {
  /** Keyboard keys by name: `Z`, `X`, `Space`, `ShiftLeft`, `Number1`… */
  keys: string[];
  /** Mouse buttons by name: `Left`, `Right`, `Middle`, `Button1`, `Button2`. */
  mouse: string[];
}

export const EMPTY_INPUT: InputState = { keys: [], mouse: [] };

export interface Gameplay {
  score: number;
  scoreWithoutMods: number;
  accuracy: number;
  combo: number;
  maxCombo: number;
  beatmapMaxCombo: number;
  rank: string;
  hits: Hits;
  results: Record<string, number>;
  health: number;
  paused: boolean;
  failed: boolean;
  pp: Pp | null;
  unstableRate: number | null;
  hitErrors: number[];
}

export interface DifficultyAdjust {
  cs: number | null;
  ar: number | null;
  od: number | null;
  hp: number | null;
}

/** The best completed solo play of a beatmap that the app has seen (see `/api/v1/personal-best`). */
export interface PersonalBest {
  score: number;
  pp: number;
  accuracy: number;
  maxCombo: number;
  mods: string[];
  /** When the play ended, in ms since the Unix epoch. */
  playedAt: number;
}

/** A personal best with how it unfolded. */
export interface PersonalBestGhost extends PersonalBest {
  /** `[songTimeMs, score, pp, accuracy]`, in song-time order. */
  samples: number[][];
  /** The highest PP of any completed solo play of this beatmap the app has seen. */
  maxPp: number;
}

export interface GameState {
  connected: boolean;
  version: string | null;
  screen: Screen;
  screenType: string;
  playing: PlayingState;
  ruleset: string | null;
  mods: string[];
  /** Playback speed of the active mods: `1.13` for a DT set to 1.13x, `1` without a rate mod. */
  clockRate: number;
  /** Difficulty Adjust overrides (`null` for a stat left alone), or `null` without that mod. */
  difficultyAdjust: DifficultyAdjust | null;
  beatmap: Beatmap | null;
  difficulty: Difficulty | null;
  /** Strain over the beatmap's length, or `null` while it is computed. */
  difficultyGraph: DifficultyGraph | null;
  time: Time | null;
  user: User | null;
  /** Who is spectating the signed-in user right now (capped at 100; `spectatorCount` is not). */
  spectators: Spectator[];
  spectatorCount: number;
  gameplay: Gameplay | null;
  /** The best completed solo play of this beatmap the app has seen, or `null`. */
  personalBest: PersonalBest | null;
}

export type ReaderStatus =
  | { phase: "waiting" }
  | { phase: "connecting" }
  | { phase: "connected"; version: string; profile: string; connectMs: number }
  | { phase: "error"; message: string };

export interface Settings {
  pollIntervalMs: number;
  /** How often the held keys are read, in ms. Much faster than `pollIntervalMs`: inputs are real time. */
  inputPollIntervalMs: number;
  apiEnabled: boolean;
  apiPort: number;
  overlayEnabled: boolean;
  overlayOnlyWhenFocused: boolean;
  overlayFps: number;
  activeLayout: string;
  language: "auto" | Lang;
  rtssEnabled: boolean;
  rtssX: number;
  rtssY: number;
  /** Look for a new version in the background (at startup, then every few hours). */
  autoUpdateCheck: boolean;
  /** Write the current map to `nowplaying.txt` and `cover.*` (OBS, chat bots). */
  nowPlayingEnabled: boolean;
  /** Output folder; empty = `nowplaying` in the app's config folder. */
  nowPlayingDir: string;
  /** Text of `nowplaying.txt`: `{artist}`, `{title}`, `{version}`, `{mods}`, `{stars}`... */
  nowPlayingTemplate: string;
}

/** Where the update check stands (mirrors `UpdateStatus` in `src-tauri/src/updater.rs`). */
export type UpdateStatus =
  | { phase: "idle" }
  | { phase: "checking" }
  | { phase: "upToDate" }
  | { phase: "available"; version: string; current: string; notes: string | null; date: string | null }
  | { phase: "downloading"; downloaded: number; total: number | null }
  | { phase: "installing" }
  | { phase: "error"; message: string };

export interface RtssStatus {
  enabled: boolean;
  available: boolean;
  message: string | null;
}

/** Who keeps the held keys being read (they are only read while someone looks at them). */
export interface InputConsumers {
  sockets: number;
  windows: string[];
  rest: boolean;
}

/** What the reader loop did over the last second (`reader-diag` event, `get_diag` command). */
export interface ReaderDiag {
  snapshotsPerSec: number;
  targetSnapshotsPerSec: number;
  snapshotMs: number;
  snapshotMaxMs: number;
  snapshotsOk: number;
  snapshotsFailed: number;
  inputsReading: boolean;
  inputReadsPerSec: number;
  inputReadUs: number;
  inputConsumers: InputConsumers;
  stateClients: number;
  sessions: number;
  sessionMs: number;
  lastError: string | null;
}

export type LogLevel = "info" | "warn" | "error";

/** One line of the journal shown on the Status page. */
export interface LogLine {
  /** Milliseconds since the Unix epoch. */
  atMs: number;
  level: LogLevel;
  source: string;
  text: string;
}

export interface DiagSnapshot {
  metrics: ReaderDiag;
  log: LogLine[];
}

export interface ApiStatus {
  enabled: boolean;
  running: boolean;
  port: number;
  url: string | null;
  error: string | null;
}

export const EMPTY_GAME_STATE: GameState = {
  connected: false,
  version: null,
  screen: "unknown",
  screenType: "",
  playing: "notPlaying",
  ruleset: null,
  mods: [],
  clockRate: 1,
  difficultyAdjust: null,
  beatmap: null,
  difficulty: null,
  difficultyGraph: null,
  time: null,
  user: null,
  spectators: [],
  spectatorCount: 0,
  gameplay: null,
  personalBest: null,
};

/** A community widget found in the widgets folder (its manifest.json). */
export interface WidgetOption {
  key: string;
  label?: string;
  /** `image` is for built-in widgets only (the id of an imported picture). */
  type: "string" | "number" | "boolean" | "color" | "select" | "image";
  default?: unknown;
  min?: number;
  max?: number;
  choices?: { value: unknown; label?: string }[];
}

export interface WidgetManifest {
  id: string;
  name: string;
  version?: string;
  author?: string;
  description?: string;
  entry: string;
  defaultSize: { w: number; h: number };
  options: WidgetOption[];
}

export const POLL_LIMITS = { min: 8, max: 5000 } as const;
export const INPUT_POLL_LIMITS = { min: 1, max: 100 } as const;
export const MIN_PORT = 1024;
export const FPS_LIMITS = { min: 5, max: 360 } as const;
