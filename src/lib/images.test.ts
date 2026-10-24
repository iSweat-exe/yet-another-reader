import { describe, expect, it } from "vitest";
import { migrateLayout } from "../overlay/layout";
import { IMAGE_OPTIONS, imageSettings } from "../widgets/image";
import { NO_ADJUSTMENTS } from "./imageAdjust";
import { MAX_IMAGE_BYTES, checkImage, imageIdOf, imageSrc, isImageId, sniffImage } from "./images";

const bytes = (...b: number[]) => Uint8Array.from(b);
const text = (s: string) => new TextEncoder().encode(s);
const PNG = bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0);
const ID = `${"ab".repeat(16)}.png`;

describe("isImageId", () => {
  it("accepts only the ids the app makes", () => {
    expect(isImageId(ID)).toBe(true);
    expect(isImageId(`${"0f".repeat(16)}.svg`)).toBe(true);
    for (const bad of ["", "../x.png", "a/b.png", `${"ab".repeat(16)}.exe`, `${"AB".repeat(16)}.png`, `${"ab".repeat(15)}.png`, `${ID}/..`, 42, null, undefined]) {
      expect(isImageId(bad), String(bad)).toBe(false);
    }
  });

  it("turns anything else into no image", () => {
    expect(imageIdOf(ID)).toBe(ID);
    expect(imageIdOf("")).toBeNull();
    expect(imageIdOf({ evil: true })).toBeNull();
  });
});

describe("checkImage", () => {
  it("recognises each format by its signature", () => {
    expect(sniffImage(PNG)).toBe("png");
    expect(sniffImage(bytes(0xff, 0xd8, 0xff, 0xe0))).toBe("jpg");
    expect(sniffImage(text("GIF89a...."))).toBe("gif");
    expect(sniffImage(text("RIFF\0\0\0\0WEBPVP8 "))).toBe("webp");
    expect(sniffImage(text('<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg"/>'))).toBe("svg");
    expect(sniffImage(text("MZ an exe renamed to .png"))).toBeNull();
    expect(sniffImage(text("<html><svg></svg></html>"))).toBeNull();
  });

  it("refuses empty, oversized, unknown and scripted files", () => {
    expect(checkImage(new Uint8Array())).toEqual({ ok: false, error: "images.error.empty" });
    expect(checkImage(text("hello"))).toEqual({ ok: false, error: "images.error.unsupported" });
    expect(checkImage(new Uint8Array(MAX_IMAGE_BYTES + 1).fill(0x41))).toEqual({ ok: false, error: "images.error.tooLarge" });
    expect(checkImage(text('<svg xmlns="x"><script>alert(1)</script></svg>'))).toEqual({ ok: false, error: "images.error.script" });
    expect(checkImage(text('<svg xmlns="x" onload="x()"/>'))).toEqual({ ok: false, error: "images.error.script" });
    expect(checkImage(PNG)).toEqual({ ok: true, extension: "png" });
    expect(checkImage(text('<svg xmlns="x"><text id="icon">on</text></svg>'))).toEqual({ ok: true, extension: "svg" });
  });
});

describe("imageSrc", () => {
  it("points at the local API, and at nothing when the API is off or the id is invalid", () => {
    expect(imageSrc(ID, { running: true, url: "http://127.0.0.1:24051" })).toBe(`http://127.0.0.1:24051/api/v1/images/${ID}`);
    expect(imageSrc(ID, { running: false, url: null })).toBeNull();
    expect(imageSrc(ID, null)).toBeNull();
    expect(imageSrc("../etc/passwd", { running: true, url: "http://127.0.0.1:24051" })).toBeNull();
    expect(imageSrc(null, { running: true, url: "http://127.0.0.1:24051" })).toBeNull();
  });
});

describe("image widget settings", () => {
  it("starts from the defaults", () => {
    expect(imageSettings(undefined)).toEqual({ id: null, fit: "cover", radius: 0, borderWidth: 0, borderColor: "#ffffff", adjust: NO_ADJUSTMENTS });
    for (const o of IMAGE_OPTIONS) expect(o.default).not.toBeUndefined();
  });

  it("brings hand-edited values back into range", () => {
    const s = imageSettings({ image: "../../x", fit: "weird", radius: 9999, borderWidth: -3, borderColor: 5 });
    expect(s).toEqual({ id: null, fit: "cover", radius: 400, borderWidth: 0, borderColor: "#ffffff", adjust: NO_ADJUSTMENTS });
    expect(imageSettings({ image: ID, fit: "fill", radius: 12.5 })).toMatchObject({ id: ID, fit: "fill", radius: 12.5 });
  });

  it("is kept as it is by the layout migration, and layouts without it still load", () => {
    const raw = { version: 2, name: "x", widgets: [{ id: "pic", type: "image", anchor: "top-left", x: 1, y: 2, w: 3, h: 4, pages: ["play"], options: { image: ID, fit: "contain" } }] };
    expect(migrateLayout(raw)?.widgets[0].options).toEqual({ image: ID, fit: "contain" });
    expect(migrateLayout({ ...raw, widgets: [] })?.widgets).toEqual([]);
  });
});
