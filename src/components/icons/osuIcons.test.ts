/// <reference types="node" />
import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { OSU_ICONS, osuIconScale, osuIconUrl } from "./osuIcons";

describe("osu icons", () => {
  it("should point every icon to a file that exists", () => {
    for (const [name, { file }] of Object.entries(OSU_ICONS)) expect(existsSync(`public${osuIconUrl(file)}`), name).toBe(true);
  });

  it("should size every drawing to the same share of its box, within limits", () => {
    for (const [name, { ext }] of Object.entries(OSU_ICONS)) {
      expect(ext, name).toBeGreaterThan(0);
      expect(ext, name).toBeLessThanOrEqual(100);
    }
    // A bare cross is mostly margin: scaled up, but never past the cap.
    expect(osuIconScale(50)).toBe(1.5);
    // A circle that fills 90% of its square is shrunk a little.
    expect(osuIconScale(90)).toBeLessThan(1);
    expect(osuIconScale(100)).toBeCloseTo(0.8);
  });
});
