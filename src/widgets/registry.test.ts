import { describe, expect, it } from "vitest";
import { en } from "../i18n/en";
import { fr } from "../i18n/fr";
import { INPUT_WIDGET_TYPES, WIDGETS, WIDGET_CATEGORIES } from "./registry";
import { backgroundUrl } from "./builtin/map";
import { optionValues } from "./web";

/** Still drawn (layouts use it) but no longer offered in the palette. */
const LEGACY = new Set(["hitCounts"]);

describe("widget registry", () => {
  it("has a unique type per widget", () => {
    const types = WIDGETS.map((w) => w.type);
    expect(new Set(types).size).toBe(types.length);
  });

  it("names every widget in both languages", () => {
    for (const w of WIDGETS) {
      expect(en[w.labelKey], w.type).toBeTruthy();
      expect(fr[w.labelKey], w.type).toBeTruthy();
    }
  });

  it("offers every widget in exactly one category, except the legacy ones", () => {
    const offered = WIDGET_CATEGORIES.flatMap((c) => c.types);
    expect(new Set(offered).size).toBe(offered.length);
    for (const type of offered) expect(WIDGETS.some((w) => w.type === type), type).toBe(true);
    for (const w of WIDGETS) expect(offered.includes(w.type) || LEGACY.has(w.type), w.type).toBe(true);
  });

  it("gives every category a name in both languages", () => {
    for (const c of WIDGET_CATEGORIES) {
      expect(en[`category.${c.id}`], c.id).toBeTruthy();
      expect(fr[`category.${c.id}`], c.id).toBeTruthy();
    }
  });

  it("translates every option and every choice of a select option", () => {
    for (const w of WIDGETS) {
      for (const option of w.options ?? []) {
        expect(en[option.labelKey], `${w.type}.${option.key}`).toBeTruthy();
        expect(fr[option.labelKey], `${w.type}.${option.key}`).toBeTruthy();
        expect(option.default, `${w.type}.${option.key} default`).not.toBeUndefined();
        for (const c of option.choices ?? []) {
          const key = `widget.choice.${option.key}.${String(c.value)}` as keyof typeof en;
          expect(en[key], key).toBeTruthy();
          expect(fr[key], key).toBeTruthy();
        }
      }
    }
  });

  it("starts a widget with its options at their defaults", () => {
    const key = WIDGETS.find((w) => w.type === "inputKey");
    expect(optionValues(key, undefined)).toMatchObject({ device: "keyboard", key: "Z", showCount: false });
    expect(optionValues(key, { key: "X" })).toMatchObject({ device: "keyboard", key: "X" });
  });

  it("knows which widgets need the held keys", () => {
    expect([...INPUT_WIDGET_TYPES].sort()).toEqual(["inputKey", "kps"]);
  });
});

describe("backgroundUrl", () => {
  const map = { assets: { background: true, audio: true }, sha256: "ab/cd" };

  it("points at the API with the beatmap hash, so a new beatmap is not served from cache", () => {
    expect(backgroundUrl(map, { running: true, url: "http://127.0.0.1:24051" })).toBe("http://127.0.0.1:24051/api/v1/assets/background?v=ab%2Fcd");
  });

  it("gives nothing when the API is off, the beatmap has no picture, or there is no beatmap", () => {
    expect(backgroundUrl(map, { running: false, url: null })).toBeNull();
    expect(backgroundUrl({ ...map, assets: { background: false, audio: true } }, { running: true, url: "http://x" })).toBeNull();
    expect(backgroundUrl(null, { running: true, url: "http://x" })).toBeNull();
  });
});
