import { describe, expect, it } from "vitest";
import { PlaySeries } from "./playSeries";
import { EMPTY_GAME_STATE, type GameState } from "./types";

function playing(t: number, score = 0, sha = "map-a"): GameState {
  return {
    ...EMPTY_GAME_STATE,
    beatmap: { sha256: sha } as GameState["beatmap"],
    time: { currentMs: t, running: true, source: "gameplay" },
    gameplay: { score, accuracy: 0.98, pp: { live: 12, fc: 0, ss: 0 } } as GameState["gameplay"],
  };
}

describe("PlaySeries", () => {
  it("samples a play at most every half second of song time", () => {
    const series = new PlaySeries();
    expect(series.push(playing(0))).toBe(true);
    expect(series.push(playing(200))).toBe(false);
    expect(series.push(playing(600))).toBe(true);
    expect(series.points.map((p) => p.t)).toEqual([0, 600]);
  });

  it("starts over when the song clock goes back (a retry)", () => {
    const series = new PlaySeries();
    series.push(playing(0));
    series.push(playing(9000));
    series.push(playing(100));
    expect(series.points.map((p) => p.t)).toEqual([100]);
  });

  it("keeps the series after the play ends and clears it for the next play", () => {
    const series = new PlaySeries();
    series.push(playing(0));
    series.push(playing(1000));
    series.push({ ...playing(1000), gameplay: null });
    expect(series.points).toHaveLength(2);
    series.push(playing(0));
    expect(series.points).toHaveLength(1);
  });

  it("clears when the beatmap changes", () => {
    const series = new PlaySeries();
    series.push(playing(0));
    series.push(playing(1000));
    expect(series.push({ ...EMPTY_GAME_STATE, beatmap: { sha256: "map-b" } as GameState["beatmap"] })).toBe(true);
    expect(series.points).toHaveLength(0);
  });

  it("records pp, accuracy and score", () => {
    const series = new PlaySeries();
    series.push(playing(0, 4200));
    expect(series.points[0]).toEqual({ t: 0, pp: 12, accuracy: 0.98, score: 4200 });
  });
});
