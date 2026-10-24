import { describe, expect, it } from "vitest";
import { flagUrl } from "../lib/assets";
import { spectatorSettings } from "./social";

describe("spectatorSettings", () => {
  it("uses avatars, stacked, five at most, remote, by default", () => {
    expect(spectatorSettings(undefined)).toEqual({ mode: "avatars", limit: 5, showCount: true, stack: true, remote: true, hideEmpty: false });
  });

  it("reads the saved options", () => {
    const s = spectatorSettings({ mode: "count", limit: 3, remoteAvatars: false, hideEmpty: true, stack: false, showCount: false });
    expect(s).toEqual({ mode: "count", limit: 3, showCount: false, stack: false, remote: false, hideEmpty: true });
  });

  it("falls back on an unknown mode and clamps the limit", () => {
    expect(spectatorSettings({ mode: "nope", limit: 999 })).toMatchObject({ mode: "avatars", limit: 20 });
    expect(spectatorSettings({ limit: 0 }).limit).toBe(5);
  });
});

describe("flags", () => {
  it("falls back to the unknown flag for an empty or malformed country code", () => {
    expect(flagUrl("")).toBe("/Textures/flags/__.png");
    expect(flagUrl("FRA")).toBe("/Textures/flags/__.png");
    expect(flagUrl("fr")).toBe("/Textures/flags/FR.png");
  });
});
