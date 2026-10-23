import { describe, expect, it } from "vitest";
import { isBrowserShortcut } from "./browserKeys";

const key = (k: string, mods: Partial<{ ctrlKey: boolean; metaKey: boolean; altKey: boolean; shiftKey: boolean }> = {}) => ({ key: k, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, ...mods });

describe("isBrowserShortcut", () => {
  it("should block find, find next and print", () => {
    expect(isBrowserShortcut(key("f", { ctrlKey: true }))).toBe(true);
    expect(isBrowserShortcut(key("g", { ctrlKey: true }))).toBe(true);
    expect(isBrowserShortcut(key("G", { ctrlKey: true, shiftKey: true }))).toBe(true);
    expect(isBrowserShortcut(key("p", { ctrlKey: true }))).toBe(true);
  });

  it("should block reload and zoom", () => {
    expect(isBrowserShortcut(key("F5"))).toBe(true);
    expect(isBrowserShortcut(key("r", { ctrlKey: true }))).toBe(true);
    expect(isBrowserShortcut(key("+", { ctrlKey: true }))).toBe(true);
    expect(isBrowserShortcut(key("-", { ctrlKey: true }))).toBe(true);
    expect(isBrowserShortcut(key("0", { ctrlKey: true }))).toBe(true);
  });

  it("should leave editing shortcuts alone", () => {
    for (const k of ["c", "v", "x", "z", "y", "a"]) expect(isBrowserShortcut(key(k, { ctrlKey: true }))).toBe(false);
  });

  it("should leave the developer tools alone", () => {
    expect(isBrowserShortcut(key("F12"))).toBe(false);
    expect(isBrowserShortcut(key("I", { ctrlKey: true, shiftKey: true }))).toBe(false);
  });

  it("should ignore plain typing and Alt combinations", () => {
    expect(isBrowserShortcut(key("f"))).toBe(false);
    expect(isBrowserShortcut(key("f", { ctrlKey: true, altKey: true }))).toBe(false);
  });
});
