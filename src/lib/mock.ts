import { setGame, setInput, useReaderStore } from "./store";
import { EMPTY_GAME_STATE, type GameState, type LogLine, type ReaderDiag } from "./types";

/** True when running inside the Tauri webview (false in a plain browser, e.g. for design previews). */
export const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

const BEATMAP: NonNullable<GameState["beatmap"]> = {
  title: "If U Think Im Pretty (r0pss Hardtekk)",
  titleUnicode: "If U Think Im Pretty (r0pss Hardtekk)",
  artist: "Artemas",
  artistUnicode: "Artemas",
  version: "pretty",
  creator: "inf0space",
  source: "",
  tags: "",
  onlineId: 4776581,
  setOnlineId: 2200000,
  status: "graveyard",
  ruleset: "osu",
  md5: "",
  sha256: "",
  lengthMs: 90166,
  bpm: 90,
  starRating: 6.0,
  cs: 4,
  ar: 10,
  od: 5,
  hp: 4,
  sliderMultiplier: 3.6,
  sliderTickRate: 1,
  objectCount: 341,
  previewTimeMs: -1,
  audioFile: "audio.mp3",
  backgroundFile: "bg.jpg",
  paths: { beatmap: null, background: null, audio: null },
  assets: { background: false, audio: false },
};

/** Fake live data, so widgets can be designed without osu!lazer running. */
export function mockState(t: number): GameState {
  const hit = Math.max(0, Math.floor(t * 4));
  const errors = Array.from({ length: 48 }, (_, i) => Math.sin((hit - i) * 1.7) * 28 + Math.cos((hit - i) * 0.6) * 9);
  const combo = hit % 120;
  return {
    ...EMPTY_GAME_STATE,
    connected: true,
    version: "2026.1005.0-lazer+9a10d935",
    screen: "playing",
    screenType: "osu.Game.Screens.Play.SoloPlayer",
    playing: "playing",
    ruleset: "osu",
    mods: ["HD", "DT"],
    clockRate: 1.5,
    difficultyAdjust: null,
    beatmap: BEATMAP,
    user: {
      id: 1,
      username: "iSweat",
      countryCode: "FR",
      avatarUrl: "",
      apiState: "online",
      statistics: { globalRank: 12873, countryRank: 412, pp: 5234, accuracy: 98.12, playCount: 24511, totalHits: 4200000, maxCombo: 2210, rankedScore: 9000000000, totalScore: 21000000000 },
    },
    difficulty: { stars: 7.4, maxCombo: 458, pp95: 250, pp98: 290, pp99: 310, pp100: 340 },
    time: { currentMs: (t * 1000) % BEATMAP.lengthMs, running: true, source: "gameplay" },
    gameplay: {
      score: 1_204_331 + hit * 311,
      scoreWithoutMods: 900_000,
      accuracy: 0.9871,
      combo,
      maxCombo: 214,
      beatmapMaxCombo: 458,
      rank: "S",
      hits: { great: 320 + hit, ok: 12, meh: 2, miss: 3 },
      results: {},
      health: 0.55 + Math.sin(t / 2) * 0.4,
      paused: false,
      failed: false,
      pp: { live: 188 + (hit % 40), fc: 231, ss: 340 },
      unstableRate: 144.6,
      hitErrors: errors,
    },
  };
}

/** Fake held keys: two keys alternating like a player streaming, and a click from time to time. */
export function mockInput(t: number) {
  const step = Math.floor(t * 8);
  const keys = step % 2 === 0 ? ["Z"] : ["X"];
  // A hold on a pause in the stream, now and then.
  const rest = step % 24 >= 20;
  return { keys: rest ? [] : keys, mouse: step % 16 < 3 ? ["Left"] : [] };
}

/** Feeds only the game state with animated fake data (the editor's preview); returns a stop function. */
export function startGameMock(): () => void {
  const started = performance.now();
  const apply = () => {
    const t = (performance.now() - started) / 1000;
    setGame(mockState(t));
    setInput(mockInput(t));
  };
  apply();
  const id = setInterval(apply, 50);
  return () => clearInterval(id);
}

/** Feeds the store with animated fake data; returns a function that stops it. */
/** Fake counters and journal for the design preview: they drift a little, like the real ones. */
function mockDiag(t: number): ReaderDiag {
  const wave = Math.sin(t * 1.7);
  return {
    snapshotsPerSec: 30 + wave * 0.6,
    targetSnapshotsPerSec: 30,
    snapshotMs: 0.8 + Math.abs(wave) * 0.4,
    snapshotMaxMs: 2.1 + Math.abs(Math.cos(t)) * 2,
    snapshotsOk: Math.round(t * 30),
    snapshotsFailed: 0,
    inputsReading: true,
    inputReadsPerSec: 490 + wave * 8,
    inputReadUs: 42 + wave * 6,
    inputConsumers: { sockets: 0, windows: ["main", "overlay"], rest: false },
    stateClients: 1,
    sessions: 1,
    sessionMs: Math.round(t * 1000) + 61_000,
    lastError: null,
  };
}

const MOCK_LOG: Omit<LogLine, "atMs">[] = [
  { level: "info", source: "reader", text: "osu!lazer found, locating the game's objects" },
  { level: "info", source: "reader", text: "connected to 2026.1005.0-lazer+9a10d935 in 1.7 s" },
  { level: "info", source: "game", text: "screen: SoloSongSelect" },
  { level: "info", source: "game", text: "mods: HD DT (speed 1.13x)" },
  { level: "info", source: "inputs", text: "reading keys started (main window, overlay window)" },
  { level: "warn", source: "reader", text: "snapshot failed (1 in a row): root object is temporarily unreadable" },
  { level: "info", source: "reader", text: "read recovered after 1 failed attempt(s)" },
  { level: "info", source: "game", text: "play started" },
];

export function startMock(): () => void {
  const started = performance.now();
  const now = Date.now();
  useReaderStore.setState({ log: MOCK_LOG.map((l, i) => ({ ...l, atMs: now - (MOCK_LOG.length - i) * 4200 })) });
  const apply = () => {
    const t = (performance.now() - started) / 1000;
    setGame(mockState(t));
    setInput(mockInput(t));
  };
  useReaderStore.setState({
    status: { phase: "connected", version: "2026.1005.0-lazer+9a10d935", profile: "mock", connectMs: 0 },
    settings: { pollIntervalMs: 33, inputPollIntervalMs: 2, apiEnabled: true, apiPort: 24051, overlayEnabled: true, overlayOnlyWhenFocused: true, overlayFps: 30, activeLayout: "default", language: "auto", rtssEnabled: false, rtssX: 40, rtssY: 40, autoUpdateCheck: true },
    api: { enabled: true, running: true, port: 24051, url: "http://127.0.0.1:24051", error: null },
    update: { phase: "available", version: "1.1.0", current: "0.1.0", notes: "- Faster game detection\n- A trail effect for the key overlay\n- Automatic updates", date: null },
  });
  apply();
  useReaderStore.setState({ diag: mockDiag(0) });
  const diagId = setInterval(() => useReaderStore.setState({ diag: mockDiag((performance.now() - started) / 1000) }), 1000);
  const id = setInterval(apply, 50);
  return () => {
    clearInterval(id);
    clearInterval(diagId);
  };
}
