import { describe, expect, it } from "vitest";
import { customFontFamily, customFontId, shadowCss, textLook } from "./textStyle";

const ID = `${"ab".repeat(16)}.woff2`;

describe("textLook", () => {
  it("draws what it always drew when no typography is set", () => {
    const look = textLook({ color: "#fff" });
    expect(look.fontId).toBeNull();
    expect(look.weight).toBeUndefined();
    expect(look.css.fontFamily).toBeUndefined();
    expect(look.css.letterSpacing).toBeUndefined();
    expect(look.css.WebkitTextStroke).toBeUndefined();
    expect(look.css.textShadow).toBe(shadowCss("auto", undefined, "#fff"));
  });

  it("maps a built-in typeface to its stack", () => {
    expect(textLook({ font: "mono" }).css.fontFamily).toContain("monospace");
    expect(textLook({ font: "default" }).css.fontFamily).toBeUndefined();
    expect(textLook({ font: "nonsense" }).css.fontFamily).toBeUndefined();
  });

  it("names an imported font by its id, with a fallback", () => {
    const look = textLook({ font: `custom:${ID}` });
    expect(look.fontId).toBe(ID);
    expect(look.css.fontFamily).toContain(customFontFamily(ID));
    expect(look.css.fontFamily).toContain("sans-serif");
  });

  it("refuses a font value that is not an id the app made", () => {
    expect(customFontId("custom:../../etc/passwd")).toBeNull();
    expect(customFontId(`custom:${"ab".repeat(16)}.exe`)).toBeNull();
    expect(customFontId(undefined)).toBeNull();
  });

  it("keeps spacing, weight and outline in their ranges", () => {
    const look = textLook({ tracking: 999, weight: 1234, outline: -5 });
    expect(look.css.letterSpacing).toBe("0.5em");
    expect(look.weight).toBe(900);
    expect(look.css.WebkitTextStroke).toBeUndefined();
    expect(textLook({ weight: 449 }).weight).toBe(400);
    expect(textLook({ outline: 3, outlineColor: "#f00" }).css.WebkitTextStroke).toBe("3px #f00");
  });
});

describe("shadowCss", () => {
  it("covers every kind", () => {
    expect(shadowCss("none", undefined, "#fff")).toBe("none");
    expect(shadowCss("soft", "#000", "#fff")).toContain("#000");
    expect(shadowCss("strong", undefined, "#fff")).toContain("12px");
  });

  it("glows in the text colour unless told otherwise", () => {
    expect(shadowCss("glow", undefined, "#0ff")).toContain("#0ff");
    expect(shadowCss("glow", "#f0f", "#0ff")).toContain("#f0f");
  });
});
