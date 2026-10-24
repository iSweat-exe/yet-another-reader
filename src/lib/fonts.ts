import { invoke } from "@tauri-apps/api/core";
import { useEffect } from "react";
import type { MessageKey } from "../i18n";
import { customFontFamily, customFontId } from "../overlay/textStyle";
import { MAX_IMAGE_BYTES, type ImageInfo, deleteImage, listImages, localAsset, rememberLocalAsset } from "./images";
import { isTauri } from "./mock";
import { useReaderStore } from "./store";

/**
 * Fonts imported for the widgets' text. They are stored and served exactly like the pictures (same folder, same
 * `/api/v1/images/{id}` route: the id is a hash of the content and its extension tells the format); only the checks
 * differ. Like pictures, they are checked here before they are sent and again by the Rust side, which counts.
 */
export const FONT_EXTENSIONS = ["ttf", "otf", "woff", "woff2"] as const;
export type FontExtension = (typeof FONT_EXTENSIONS)[number];

export const FONT_ACCEPT = "font/ttf,font/otf,font/woff,font/woff2,.ttf,.otf,.woff,.woff2";

const FONT_ID = /^[0-9a-f]{32}\.(ttf|otf|woff|woff2)$/;

export const isFontId = (value: unknown): value is string => typeof value === "string" && FONT_ID.test(value);

/** The format of a font file, from its first bytes. `null` when it is not a font the overlay can use. */
export function sniffFont(bytes: Uint8Array): FontExtension | null {
  const starts = (...sig: number[]) => sig.every((b, i) => bytes[i] === b);
  const ascii = (text: string) => [...text].every((c, i) => bytes[i] === c.charCodeAt(0));
  if (starts(0x00, 0x01, 0x00, 0x00) || ascii("true")) return "ttf";
  if (ascii("OTTO")) return "otf";
  if (ascii("wOFF")) return "woff";
  if (ascii("wOF2")) return "woff2";
  return null;
}

export type FontCheck = { ok: true; extension: FontExtension } | { ok: false; error: MessageKey };

export function checkFont(bytes: Uint8Array): FontCheck {
  if (bytes.length === 0) return { ok: false, error: "images.error.empty" };
  if (bytes.length > MAX_IMAGE_BYTES) return { ok: false, error: "images.error.tooLarge" };
  const extension = sniffFont(bytes);
  return extension ? { ok: true, extension } : { ok: false, error: "fonts.error.unsupported" };
}

export type FontImport = { ok: true; id: string } | { ok: false; error: MessageKey; detail?: string };

/** Imports a picked font file; resolves to its id, or to the reason it was refused. */
export async function importFont(file: File): Promise<FontImport> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const check = checkFont(bytes);
  if (!check.ok) return check;
  if (!isTauri) return { ok: true, id: await rememberLocalAsset(bytes, check.extension, file.type || "font/ttf") };
  try {
    const info = await invoke<ImageInfo>("import_image", bytes);
    return { ok: true, id: info.id };
  } catch (e) {
    return { ok: false, error: "images.error.failed", detail: String(e) };
  }
}

/** Removes an imported font; text that still uses it falls back to its stack. */
export const deleteFontFile = deleteImage;

/** The imported fonts, newest first. */
export async function listFonts(): Promise<ImageInfo[]> {
  return (await listImages()).filter((f) => isFontId(f.id));
}

/** Where a font is loaded from: the local API, or (browser preview) an in-memory object URL. */
export function fontSrc(id: string, api: { running: boolean; url: string | null } | null): string | null {
  if (!isFontId(id)) return null;
  const local = localAsset(id);
  if (local) return local;
  return api?.running && api.url ? `${api.url}/api/v1/images/${id}` : null;
}

const requested = new Map<string, Promise<void>>();

/**
 * Makes an imported font available to the page (once per id and address). A font that cannot be loaded (deleted, API
 * off) is simply left out: the text then uses the fallback of its font stack.
 */
export function loadFont(id: string, src: string): Promise<void> {
  const key = `${id}@${src}`;
  const known = requested.get(key);
  if (known) return known;
  const pending = new FontFace(customFontFamily(id), `url("${src}")`)
    .load()
    .then((face) => void document.fonts.add(face))
    .catch(() => {
      requested.delete(key);
    });
  requested.set(key, pending);
  return pending;
}

/** Loads the imported font a widget style names, if any. */
export function useCustomFont(font: string | undefined): void {
  const api = useReaderStore((s) => s.api);
  const id = customFontId(font);
  const src = id ? fontSrc(id, api) : null;
  useEffect(() => {
    if (id && src) void loadFont(id, src);
  }, [id, src]);
}
