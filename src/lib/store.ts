import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { create } from "zustand";
import { EMPTY_INPUT_STATS, type InputStats, applyInput } from "./inputs";
import { type ApiStatus, type DiagSnapshot, EMPTY_GAME_STATE, EMPTY_INPUT, type GameState, type InputState, type LogLine, type ReaderDiag, type ReaderStatus, type RtssStatus, type Settings, type UpdateStatus, type WidgetManifest } from "./types";

/** Lines of the journal kept in the window. */
const LOG_LIMIT = 300;

interface ReaderStore {
  status: ReaderStatus | null;
  game: GameState;
  settings: Settings | null;
  api: ApiStatus | null;
  rtss: RtssStatus | null;
  /** Community widgets found in the widgets folder. */
  widgets: WidgetManifest[];
  /** The keys and mouse buttons held down (only read while a window asks for them). */
  input: InputState;
  inputStats: InputStats;
  /** Counters of the reader loop, once a second (`null` before the first one). */
  diag: ReaderDiag | null;
  /** The journal of what the app did, oldest first. */
  log: LogLine[];
  /** The update check (see `src/lib/updates.ts`). */
  update: UpdateStatus;
}

export const useReaderStore = create<ReaderStore>(() => ({
  status: null,
  game: EMPTY_GAME_STATE,
  settings: null,
  api: null,
  rtss: null,
  widgets: [],
  input: EMPTY_INPUT,
  inputStats: EMPTY_INPUT_STATS,
  diag: null,
  log: [],
  update: { phase: "idle" },
}));

/** Adds a line to the journal, dropping the oldest ones past the limit. */
export function appendLog(line: LogLine): void {
  useReaderStore.setState((s) => ({ log: [...s.log, line].slice(-LOG_LIMIT) }));
}

export function clearLog(): void {
  useReaderStore.setState({ log: [] });
}

/** Takes a new set of held inputs; presses only count while a play is running. */
export function setInput(next: InputState, now = performance.now()): void {
  useReaderStore.setState((s) => ({ input: next, inputStats: applyInput(s.inputStats, s.input, next, now, s.game.gameplay !== null) }));
}

/** A new game state; the press counters start again with every play. */
export function setGame(game: GameState): void {
  useReaderStore.setState((s) => ({
    game,
    inputStats: !s.game.gameplay && game.gameplay ? { ...s.inputStats, counts: {} } : s.inputStats,
  }));
}

/** Saves new settings; resolves with the settings actually in effect, rejects with a message. */
export async function saveSettings(next: Settings): Promise<Settings> {
  if (!isTauriRuntime()) {
    useReaderStore.setState({ settings: next });
    return next;
  }
  const applied = await invoke<Settings>("set_settings", { new: next });
  useReaderStore.setState({ settings: applied });
  return applied;
}

/**
 * Subscribes the store to the Rust side. Events are subscribed before the initial values
 * are fetched so nothing emitted in between is lost.
 */
export async function connectReaderStore(): Promise<() => void> {
  const unlisteners = await Promise.all([
    listen<ReaderStatus>("reader-status", (e) => useReaderStore.setState({ status: e.payload })),
    listen<GameState>("game-state", (e) => setGame(e.payload)),
    listen<InputState>("input-state", (e) => setInput(e.payload)),
    listen<ApiStatus>("api-status", (e) => useReaderStore.setState({ api: e.payload })),
    listen<RtssStatus>("rtss-status", (e) => useReaderStore.setState({ rtss: e.payload })),
    listen<Settings>("settings-changed", (e) => useReaderStore.setState({ settings: e.payload })),
    listen<ReaderDiag>("reader-diag", (e) => useReaderStore.setState({ diag: e.payload })),
    listen<LogLine>("debug-log", (e) => appendLog(e.payload)),
    listen<UpdateStatus>("update-status", (e) => useReaderStore.setState({ update: e.payload })),
  ]);
  const [status, game, settings, api, rtss, diag, update] = await Promise.all([
    invoke<ReaderStatus>("get_reader_status"),
    invoke<GameState>("get_game_state"),
    invoke<Settings>("get_settings"),
    invoke<ApiStatus>("get_api_status"),
    invoke<RtssStatus>("get_rtss_status"),
    invoke<DiagSnapshot>("get_diag"),
    invoke<UpdateStatus>("get_update_status"),
  ]);
  void refreshWidgets();
  useReaderStore.setState((s) => ({
    status: s.status ?? status,
    game: s.game.connected ? s.game : game,
    settings,
    api: s.api ?? api,
    rtss: s.rtss ?? rtss,
    diag: s.diag ?? diag.metrics,
    update: s.update.phase === "idle" ? update : s.update,
    // Lines that arrived as events while the history was being fetched are already in `diag.log`.
    log: [...diag.log, ...s.log.filter((l) => !diag.log.some((o) => o.atMs === l.atMs && o.text === l.text))].slice(-LOG_LIMIT),
  }));
  return () => unlisteners.forEach((u) => u());
}

/** True inside the Tauri webview (false in a plain browser, used for design previews). */
function isTauriRuntime(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

/** Re-reads the widgets folder (after the user added or edited a widget). */
export async function refreshWidgets(): Promise<void> {
  if (!isTauriRuntime()) return;
  const widgets = await invoke<WidgetManifest[]>("list_widgets").catch(() => []);
  useReaderStore.setState({ widgets });
}
