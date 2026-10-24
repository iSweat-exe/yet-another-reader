import { useSyncExternalStore } from "react";
import { useReaderStore } from "./store";
import type { GameState } from "./types";

/** What a play looked like at one moment of the song. */
export interface SeriesPoint {
  /** Song time in ms. */
  t: number;
  pp: number;
  accuracy: number;
  score: number;
}

/** Song time between two samples. */
export const SAMPLE_MS = 500;
/** A song clock this far behind the last sample means the play was restarted. */
const RESTART_MS = 2000;
const MAX_POINTS = 4000;

/**
 * The play in progress as a series of samples, for the widgets that draw it over time. Kept after the
 * play ends (the results screen can still show it) and cleared when the next one starts.
 */
export class PlaySeries {
  points: readonly SeriesPoint[] = [];
  private map: string | null = null;
  private hadPlay = false;

  /** Feeds one game state; returns whether the series changed. */
  push(game: GameState): boolean {
    const sha = game.beatmap?.sha256 ?? null;
    let changed = false;
    if (sha !== this.map) {
      this.map = sha;
      this.hadPlay = false;
      if (this.points.length > 0) {
        this.points = [];
        changed = true;
      }
    }
    const play = game.gameplay;
    if (!play || !game.time) {
      this.hadPlay = false;
      return changed;
    }
    const t = game.time.currentMs;
    const last = this.points[this.points.length - 1];
    if (!this.hadPlay || (last && t < last.t - RESTART_MS)) {
      // A new play (or a retry): the previous series is not this one.
      if (this.points.length > 0) changed = true;
      this.points = [];
    }
    this.hadPlay = true;
    const tail = this.points[this.points.length - 1];
    if (tail && t < tail.t + SAMPLE_MS) return changed;
    const point = { t, pp: play.pp?.live ?? 0, accuracy: play.accuracy, score: play.score };
    this.points = [...this.points.slice(-(MAX_POINTS - 1)), point];
    return true;
  }
}

const series = new PlaySeries();
const listeners = new Set<() => void>();
let started = false;

function start() {
  if (started) return;
  started = true;
  // The store is replaced on every emission: only the pieces that matter are compared by `push`.
  useReaderStore.subscribe((state, prev) => {
    if (state.game === prev.game) return;
    if (series.push(state.game)) listeners.forEach((l) => l());
  });
  series.push(useReaderStore.getState().game);
}

/** The play so far, newest last. A new array whenever a sample is added. */
export function usePlaySeries(): readonly SeriesPoint[] {
  start();
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => series.points,
  );
}
