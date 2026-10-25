import { describe, expect, it } from "vitest";
import { classicLayout } from "../../overlay/model/layout";
import {
  assetIdsIn,
  base64ToBytes,
  bytesToBase64,
  CODE_PREFIX,
  encodeBundle,
  fromShareCode,
  isAssetId,
  parseBundle,
  readImport,
  remapAssetIds,
  toShareCode,
} from "./layoutBundle";

const PIC = "0123456789abcdef0123456789abcdef.png";
const FONT = "fedcba9876543210fedcba9876543210.woff2";

function layoutWithAssets() {
  const layout = classicLayout("shared");
  layout.widgets = [
    { id: "img", type: "image", anchor: "top-left", x: 0, y: 0, w: 100, h: 100, pages: ["playing"], options: { image: PIC, fit: "cover" } },
    { id: "txt", type: "score", anchor: "top-left", x: 0, y: 0, w: 100, h: 100, pages: ["playing"], style: { font: `custom:${FONT}` } },
    { id: "plain", type: "combo", anchor: "top-left", x: 0, y: 0, w: 100, h: 100, pages: ["playing"] },
  ];
  return layout;
}

describe("isAssetId", () => {
  it("accepts a hash with a picture or font extension", () => {
    expect(isAssetId(PIC)).toBe(true);
    expect(isAssetId(FONT)).toBe(true);
  });
  it("refuses anything else", () => {
    for (const bad of ["x.png", "../0123456789abcdef0123456789abcdef.png", `${PIC}.exe`, "0123456789abcdef0123456789abcdef.exe", 5, null]) expect(isAssetId(bad)).toBe(false);
  });
});

describe("assetIdsIn", () => {
  it("finds pictures in the options and custom fonts in the style", () => {
    expect(assetIdsIn(layoutWithAssets()).sort()).toEqual([FONT, PIC].sort());
  });
  it("is empty for a layout without files", () => {
    expect(assetIdsIn(classicLayout())).toEqual([]);
  });
});

describe("base64", () => {
  it("round-trips bytes, including a large buffer", () => {
    const bytes = Uint8Array.from({ length: 70_000 }, (_, i) => i % 256);
    expect(base64ToBytes(bytesToBase64(bytes))).toEqual(bytes);
  });
});

describe("bundle", () => {
  it("round-trips a layout with its files", () => {
    const layout = layoutWithAssets();
    const text = encodeBundle(layout, [{ id: PIC, bytes: Uint8Array.of(1, 2, 3) }]);
    const parsed = parseBundle(text);
    expect(parsed?.layout).toEqual(JSON.parse(JSON.stringify(layout)));
    expect(parsed?.assets).toEqual([{ id: PIC, bytes: Uint8Array.of(1, 2, 3) }]);
  });

  it("still reads a plain layout JSON", () => {
    const layout = classicLayout("old");
    expect(parseBundle(JSON.stringify(layout))).toEqual({ layout: JSON.parse(JSON.stringify(layout)), assets: [] });
  });

  it("refuses garbage, a newer version and a file with an unsafe id", () => {
    expect(parseBundle("not json")).toBeNull();
    expect(parseBundle("5")).toBeNull();
    expect(parseBundle(JSON.stringify({ format: "yar-layout", version: 99, assets: [], layout: {} }))).toBeNull();
    expect(parseBundle(JSON.stringify({ format: "yar-layout", version: 1, assets: [{ id: "../evil.png", data: "AA==" }], layout: {} }))).toBeNull();
  });

  it("refuses too many files", () => {
    const assets = Array.from({ length: 65 }, () => ({ id: PIC, data: "AA==" }));
    expect(parseBundle(JSON.stringify({ format: "yar-layout", version: 1, assets, layout: {} }))).toBeNull();
  });
});

describe("remapAssetIds", () => {
  it("renames ids everywhere in the layout without touching the original", () => {
    const layout = layoutWithAssets();
    const other = "11111111111111111111111111111111.png";
    const mapped = remapAssetIds(layout, new Map([[PIC, other]]));
    expect(assetIdsIn(mapped)).toContain(other);
    expect(assetIdsIn(mapped)).not.toContain(PIC);
    expect(assetIdsIn(layout)).toContain(PIC);
  });
  it("returns the same layout for an empty map", () => {
    const layout = layoutWithAssets();
    expect(remapAssetIds(layout, new Map())).toBe(layout);
  });
});

describe("share code", () => {
  it("round-trips a bundle through compression", async () => {
    const text = encodeBundle(classicLayout("code"), []);
    const code = await toShareCode(text);
    expect(code.startsWith(CODE_PREFIX)).toBe(true);
    expect(code).toMatch(/^yar1:[A-Za-z0-9_-]+$/);
    expect(code.length).toBeLessThan(text.length);
    expect(await fromShareCode(code)).toBe(text);
  });
  it("rejects a text that is not a code", async () => {
    expect(await fromShareCode("hello")).toBeNull();
    expect(await fromShareCode("yar1:@@@")).toBeNull();
  });
  it("readImport accepts a code, a bundle and a plain layout", async () => {
    const text = encodeBundle(classicLayout("x"), []);
    expect(await readImport(await toShareCode(text))).not.toBeNull();
    expect(await readImport(text)).not.toBeNull();
    expect(await readImport(JSON.stringify(classicLayout("y")))).not.toBeNull();
    expect(await readImport("yar1:@@@")).toBeNull();
  });
});
