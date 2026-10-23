import { describe, expect, it } from "vitest";
import { en } from "./en";
import { fr } from "./fr";
import { resolveLanguage, translate } from "./index";

describe("dictionaries", () => {
  it("French provides exactly the English keys", () => {
    expect(Object.keys(fr).sort()).toEqual(Object.keys(en).sort());
  });

  it("keeps the same placeholders in both languages", () => {
    const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
    for (const key of Object.keys(en) as (keyof typeof en)[]) {
      expect(placeholders(fr[key]), key).toEqual(placeholders(en[key]));
    }
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
