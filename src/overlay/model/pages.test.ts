import { describe, expect, it } from "vitest";
import { migrateLayout } from "./layout";
import { pageOf } from "./pages";

const game = (over: Partial<Parameters<typeof pageOf>[0]> = {}): Parameters<typeof pageOf>[0] => ({ connected: true, screen: "menu", playing: "notPlaying", gameplay: null, ...over });
const gameplay = (paused = false) => ({ paused }) as NonNullable<Parameters<typeof pageOf>[0]["gameplay"]>;

describe("pageOf", () => {
  it("should be null when the game is not connected", () => {
    expect(pageOf(game({ connected: false }))).toBeNull();
  });

  it("should be playing during a play", () => {
    expect(pageOf(game({ screen: "playing", playing: "playing", gameplay: gameplay() }))).toBe("playing");
  });

  it("should be paused when the play is paused", () => {
    expect(pageOf(game({ screen: "playing", gameplay: gameplay(true) }))).toBe("paused");
  });

  it("should be break during a map break", () => {
    expect(pageOf(game({ screen: "playing", playing: "break", gameplay: gameplay() }))).toBe("break");
  });

  it("should follow the screen outside a play", () => {
    expect(pageOf(game({ screen: "songSelect" }))).toBe("songSelect");
    expect(pageOf(game({ screen: "results" }))).toBe("results");
    expect(pageOf(game({ screen: "menu" }))).toBe("menu");
  });

  it("should be null on screens nothing is drawn for", () => {
    expect(pageOf(game({ screen: "multiplayer" }))).toBeNull();
  });
});

describe("migrateLayout pages", () => {
  const widgetsOf = (raw: object) => migrateLayout({ version: 2, widgets: [{ type: "score", ...raw }] })?.widgets[0];

  it("should turn visibleWhen playing into the play pages", () => {
    expect(widgetsOf({ visibleWhen: "playing" })?.pages).toEqual(["playing", "paused", "break"]);
  });

  it("should turn visibleWhen always into every page", () => {
    expect(widgetsOf({ visibleWhen: "always" })?.pages).toHaveLength(6);
  });

  it("should keep valid pages and drop unknown ones", () => {
    expect(widgetsOf({ pages: ["results", "nope"] })?.pages).toEqual(["results"]);
  });
});
