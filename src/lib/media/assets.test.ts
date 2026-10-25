/// <reference types="node" />
import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { flagUrl, menuBackgroundUrl, MENU_BACKGROUNDS, rulesetIconUrl } from "./assets";
import { modIconUrl } from "../state/mods";

const onDisk = (url: string) => existsSync(`public${url}`);

describe("assets", () => {
  it("should map the ruleset names of the game to an icon", () => {
    for (const name of ["osu", "taiko", "fruits", "mania"]) expect(onDisk(rulesetIconUrl(name) ?? "")).toBe(true);
    expect(rulesetIconUrl("nope")).toBeUndefined();
  });

  it("should only build a flag url from a two letter code", () => {
    expect(flagUrl("fr")).toBe("/Textures/flags/FR.png");
    expect(onDisk(flagUrl("FR") ?? "")).toBe(true);
    expect(flagUrl("../x")).toBe("/Textures/flags/__.png");
    expect(flagUrl("")).toBe("/Textures/flags/__.png");
    expect(onDisk(flagUrl(null))).toBe(true);
  });

  it("should wrap the menu background index", () => {
    expect(menuBackgroundUrl(MENU_BACKGROUNDS + 1)).toBe(menuBackgroundUrl(1));
    expect(menuBackgroundUrl(0)).toBe(menuBackgroundUrl(MENU_BACKGROUNDS));
    for (let i = 1; i <= MENU_BACKGROUNDS; i++) expect(onDisk(menuBackgroundUrl(i))).toBe(true);
  });

  it("should point every mod to a file that exists", () => {
    for (const acronym of ["HD", "DT", "HR", "NF", "RX", "SV2", "TD", "WU"]) expect(onDisk(modIconUrl(acronym) ?? ""), acronym).toBe(true);
  });
});
