/// <reference types="node" />
import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { Gate, hoverSample, MAX_VOICES, SFX_NAMES, sanitizePrefs, selectSample, volumeToGain } from "./sfx";

describe("sfx", () => {
  it("should only list samples that exist", () => {
    for (const name of SFX_NAMES) expect(existsSync(`public/Samples/UI/${name}.wav`), name).toBe(true);
  });

  it("should fall back to the defaults for stored garbage", () => {
    expect(sanitizePrefs(null)).toEqual({ enabled: true, volume: 0.5 });
    expect(sanitizePrefs({ enabled: "yes", volume: "loud" })).toEqual({ enabled: true, volume: 0.5 });
    expect(sanitizePrefs({ enabled: false, volume: 3 })).toEqual({ enabled: false, volume: 1 });
  });

  it("should map the volume to a gain between 0 and 1", () => {
    expect(volumeToGain(0)).toBe(0);
    expect(volumeToGain(1)).toBe(1);
    expect(volumeToGain(0.5)).toBeLessThan(0.5);
  });

  it("should pick the hover sample of a set, or the default one when the set has none", () => {
    expect(hoverSample("button")).toBe("button-hover");
    expect(hoverSample("button-sidebar")).toBe("button-sidebar-hover");
    expect(hoverSample("tabselect")).toBe("default-hover");
    expect(hoverSample("dialog-ok")).toBe("default-hover");
    expect(hoverSample("dialog-cancel")).toBe("default-hover");
  });

  it("should pick the select sample of a set, and the disabled one while disabled", () => {
    expect(selectSample("button")).toBe("button-select");
    expect(selectSample("dialog-ok")).toBe("dialog-ok-select");
    expect(selectSample("dialog-cancel")).toBe("dialog-cancel-select");
    expect(selectSample("button-sidebar")).toBe("button-sidebar-select");
    expect(selectSample("default")).toBe("default-select");
    expect(selectSample("button", false)).toBe("default-select-disabled");
    expect(selectSample("default", false)).toBe("default-select-disabled");
  });

  it("should refuse a sound that retriggers at once", () => {
    const gate = new Gate();
    expect(gate.allow("a", 100, 0, false)).toBe(true);
    expect(gate.allow("a", 110, 0, false)).toBe(false);
    expect(gate.allow("a", 200, 0, false)).toBe(true);
    expect(gate.allow("b", 201, 0, false)).toBe(true);
  });

  it("should drop decoration first when many voices play", () => {
    const gate = new Gate();
    expect(gate.allow("hover", 0, MAX_VOICES / 2, true)).toBe(false);
    expect(gate.allow("select", 0, MAX_VOICES / 2, false)).toBe(true);
  });
});
