import { describe, expect, it, vi } from "vitest";
import { en } from "./en";
import { LANGUAGES, langOfLocale } from "./languages";
import { loadLanguage, resolveLanguage, translate } from "./index";

const dictionaries = {
  fr: () => import("./fr").then((m) => m.fr),
  es: () => import("./es").then((m) => m.es),
  de: () => import("./de").then((m) => m.de),
  pt: () => import("./pt").then((m) => m.pt),
  ru: () => import("./ru").then((m) => m.ru),
  zh: () => import("./zh").then((m) => m.zh),
  ko: () => import("./ko").then((m) => m.ko),
  ja: () => import("./ja").then((m) => m.ja),
};

const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe.each(Object.entries(dictionaries))("dictionary %s", (code, load) => {
  it("provides exactly the English keys", async () => {
    expect(Object.keys(await load()).sort()).toEqual(Object.keys(en).sort());
  });

  it("keeps the same placeholders as English, and leaves no value empty", async () => {
    const messages = await load();
    for (const key of Object.keys(en) as (keyof typeof en)[]) {
      expect(placeholders(messages[key]), `${code}: ${key}`).toEqual(placeholders(en[key]));
      expect(messages[key].trim().length, `${code}: ${key}`).toBeGreaterThan(0);
    }
  });
});

describe("languages", () => {
  it("lists every dictionary, and the settings accept exactly those codes", () => {
    expect(LANGUAGES.map((l) => l.code).sort()).toEqual(["en", ...Object.keys(dictionaries)].sort());
  });

  it("maps a locale tag to its language", () => {
    expect(langOfLocale("pt-BR")).toBe("pt");
    expect(langOfLocale("zh-Hans-CN")).toBe("zh");
    expect(langOfLocale("ja_JP")).toBe("ja");
    expect(langOfLocale("it-IT")).toBeNull();
    expect(langOfLocale(undefined)).toBeNull();
  });
});

describe("translate / resolveLanguage", () => {
  it("fills placeholders", () => {
    expect(translate("en", "editor.multiSelection", { count: 3 })).toBe("3 widgets selected");
    expect(translate("fr", "editor.multiSelection", { count: 3 })).toBe("3 widgets sélectionnés");
  });

  it("honours an explicit language", () => {
    expect(resolveLanguage("fr")).toBe("fr");
    expect(resolveLanguage("en")).toBe("en");
  });
});

describe("loadLanguage", () => {
  it("shows English until a language has arrived, then its own words", async () => {
    expect(translate("ja", "tab.settings")).toBe(en["tab.settings"]);
    loadLanguage("ja");
    await vi.waitFor(() => expect(translate("ja", "tab.settings")).not.toBe(en["tab.settings"]));
  });
});
