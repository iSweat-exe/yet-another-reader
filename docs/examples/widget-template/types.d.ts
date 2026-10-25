// Types of what the local API sends, for editors that understand JSDoc (`// @ts-check` in script.js).
// Generated from the app's own model (src/lib/state/types.ts): see docs/DATA_MODEL.md for the meaning of each field.
// Nothing to import: these are global declarations.

type Screen =
  | "unknown"
  | "menu"
  | "songSelect"
  | "playing"
  | "results"
  | "editor"
  | "multiplayer"
  | "other";

type PlayingState = "notPlaying" | "break" | "playing";

interface Assets {
  background: boolean;
  audio: boolean;
}

interface Paths {
  beatmap: string | null;
  background: string | null;
  audio: string | null;
}

interface Beatmap {
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

interface Hits {
  great: number;
  ok: number;
  meh: number;
  miss: number;
}

interface Pp {
  live: number;
  fc: number;
  ss: number;
}

interface Difficulty {
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
interface DifficultyGraph {
  /** Song time covered by `buckets`, in milliseconds. */
  durationMs: number;
  /** The overall difficulty: the star rating with the selected mods. */
  overall: number;
  /** Song time of the hardest bucket, in milliseconds. */
  peakMs: number;
  /** Strain per bucket, `0` (calmest) to `1` (the hardest section of the map). */
  buckets: number[];
}

interface Time {
  currentMs: number;
  running: boolean;
  source: "global" | "gameplay";
}

interface UserStatistics {
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

interface User {
  id: number;
  username: string;
  countryCode: string;
  avatarUrl: string;
  apiState: string;
  statistics: UserStatistics | null;
}

/** A user spectating the signed-in user (`spectators` of the game state). */
interface Spectator {
  id: number;
  username: string;
  /** Avatar address (`https://a.ppy.sh/{id}`, hosted by osu!); absent for an account without one. */
  avatarUrl?: string;
}

/** The keys and mouse buttons held down right now, as the game sees them (see `/api/v1/inputs`). */
interface InputState {
  /** Keyboard keys by name: `Z`, `X`, `Space`, `ShiftLeft`, `Number1`… */
  keys: string[];
  /** Mouse buttons by name: `Left`, `Right`, `Middle`, `Button1`, `Button2`. */
  mouse: string[];
}


interface Gameplay {
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

interface DifficultyAdjust {
  cs: number | null;
  ar: number | null;
  od: number | null;
  hp: number | null;
}

/** The best completed solo play of a beatmap that the app has seen (see `/api/v1/personal-best`). */
interface PersonalBest {
  score: number;
  pp: number;
  accuracy: number;
  maxCombo: number;
  mods: string[];
  /** When the play ended, in ms since the Unix epoch. */
  playedAt: number;
}

/** A personal best with how it unfolded. */
interface PersonalBestGhost extends PersonalBest {
  /** `[songTimeMs, score, pp, accuracy]`, in song-time order. */
  samples: number[][];
  /** The highest PP of any completed solo play of this beatmap the app has seen. */
  maxPp: number;
}

interface GameState {
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

/** A message of the state WebSocket (`/api/v1/ws`). */
interface StateMessage {
  type: "hello" | "state";
  seq: number;
  /** The fields asked with `?topics=` (all of them without it). */
  data: Partial<GameState>;
}

/** An event of `/api/v1/events/ws` (and of `/api/v1/ws`): something that just happened. */
type GameEvent =
  | { name: "connectionChanged"; connected: boolean }
  | { name: "screenChanged"; from: Screen; to: Screen; screenType: string }
  | { name: "beatmapChanged"; beatmap: Beatmap | null }
  | { name: "modsChanged"; mods: string[] }
  | { name: "playStarted"; beatmap: Beatmap | null; mods: string[] }
  | { name: "playEnded"; reason: "failed" | "completed" | "quit"; beatmap: Beatmap | null; mods: string[]; result: Gameplay }
  | { name: "paused" }
  | { name: "resumed" }
  | { name: "failed" }
  | { name: "hit"; judgement: "great" | "ok" | "meh"; count: number; errorsMs: number[]; combo: number }
  | { name: "miss"; count: number; combo: number }
  | { name: "comboBreak"; lost: number };
