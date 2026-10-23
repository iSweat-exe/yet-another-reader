import { describe, expect, it } from "vitest";
import { modIconUrl } from "./mods";

describe("modIconUrl", () => {
  it("should return the icon path when the mod is known", () => {
    expect(modIconUrl("HD")).toBe("/mods/difficulty_increase/hidden_HD.png");
  });

  it("should ignore settings appended to the acronym", () => {
    expect(modIconUrl("DT(1.5x)")).toBe("/mods/difficulty_increase/double_time_DT.png");
  });

  it("should return undefined when the mod has no icon", () => {
    expect(modIconUrl("ZZ")).toBeUndefined();
  });
});
