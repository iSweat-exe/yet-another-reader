import { invoke } from "@tauri-apps/api/core";
import type { MessageKey } from "../../i18n";
import { isTauri } from "../state/mock";

/**
 * Pictures imported for the `image` widget. In the app they are copied into the app's data (Rust side,
 * `src-tauri/src/images.rs`) and served by the local API at `/api/v1/images/{id}`; a layout only keeps the
 * id. In a plain browser (design preview) they stay in memory as object URLs, for the session.
 *
 * The checks here mirror `overlay_server::images` so a bad file is refused before it is sent; the Rust side
 * checks again and is the one that counts.
 */

export const MAX_IMAGE_BYTES = 15 * 1024 * 1024;

export const IMAGE_EXTENSIONS = ["png", "jpg", "gif", "webp", "svg"] as const;
export type ImageExtension = (typeof IMAGE_EXTENSIONS)[number];

/** Value of the `accept` attribute of the file picker. */
export const IMAGE_ACCEPT = "image/png,image/jpeg,image/gif,image/webp,image/svg+xml,.png,.jpg,.jpeg,.gif,.webp,.svg";

export interface ImageInfo {
  id: string;
  bytes: number;
}

const ID_PATTERN = /^[0-9a-f]{32}\.(png|jpg|gif|webp|svg)$/;

/** Whether `value` has the shape of an image id: 32 hex digits and the extension of a supported format. */
export function isImageId(value: unknown): value is string {
  return typeof value === "string" && ID_PATTERN.test(value);
}

/** The id kept in a widget's options, or `null` when there is none (or it is not a valid id). */
export function imageIdOf(option: unknown): string | null {
  return isImageId(option) ? option : null;
}

/** The format of a picture, from its first bytes (and, for an SVG, its text). `null` when it is not one. */
export function sniffImage(bytes: Uint8Array): ImageExtension | null {
  const starts = (...sig: number[]) => sig.every((b, i) => bytes[i] === b);
  const ascii = (from: number, text: string) => [...text].every((c, i) => bytes[from + i] === c.charCodeAt(0));
  if (starts(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return "png";
  if (starts(0xff, 0xd8, 0xff)) return "jpg";
  if (ascii(0, "GIF87a") || ascii(0, "GIF89a")) return "gif";
  if (bytes.length >= 12 && ascii(0, "RIFF") && ascii(8, "WEBP")) return "webp";
  const head = new TextDecoder("utf-8", { fatal: false }).decode(bytes.subarray(0, 4096)).replace(/^﻿/, "").trimStart().toLowerCase();
  if (["<?xml", "<!--", "<!doctype svg", "<svg"].some((p) => head.startsWith(p)) && head.includes("<svg")) return "svg";
  return null;
}

/** Whether an SVG carries a script: a `<script>`, a `javascript:` link, an `on…=` attribute. */
export function svgHasScript(text: string): boolean {
  const lower = text.toLowerCase();
  return lower.includes("<script") || lower.includes("javascript:") || /\son[a-z]+\s*=/.test(lower);
}

export type ImageCheck = { ok: true; extension: ImageExtension } | { ok: false; error: MessageKey };

/** Checks the content of a file before it is imported. */
export function checkImage(bytes: Uint8Array): ImageCheck {
  if (bytes.length === 0) return { ok: false, error: "images.error.empty" };
  if (bytes.length > MAX_IMAGE_BYTES) return { ok: false, error: "images.error.tooLarge" };
  const extension = sniffImage(bytes);
  if (!extension) return { ok: false, error: "images.error.unsupported" };
  if (extension === "svg" && svgHasScript(new TextDecoder().decode(bytes))) return { ok: false, error: "images.error.script" };
  return { ok: true, extension };
}

/** Object URLs of the pictures imported in the browser preview, by id. */
const previews = new Map<string, string>();

/** Where a picture is shown from: the local API, or (browser preview) an in-memory object URL. */
export function imageSrc(id: string | null, api: { running: boolean; url: string | null } | null): string | null {
  if (!id || !isImageId(id)) return null;
  const local = previews.get(id);
  if (local) return local;
  if (!api?.running || !api.url) return null;
  return `${api.url}/api/v1/images/${id}`;
}

async function hexId(bytes: Uint8Array, extension: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes as BufferSource));
  const hex = [...digest.subarray(0, 16)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex}.${extension}`;
}

/** The in-memory copy of a file imported in the browser preview (a font, for instance), under the id the app would give it. */
export function localAsset(id: string): string | undefined {
  return previews.get(id);
}

/** Keeps a file imported in the browser preview in memory, and returns its id. */
export async function rememberLocalAsset(bytes: Uint8Array, extension: string, type: string): Promise<string> {
  const id = await hexId(bytes, extension);
  if (!previews.has(id)) previews.set(id, URL.createObjectURL(new Blob([bytes as BlobPart], { type })));
  return id;
}

export type ImportResult = { ok: true; id: string } | { ok: false; error: MessageKey; detail?: string };

/** Imports a picked file; resolves to its id, or to the reason it was refused. */
export async function importImage(file: File): Promise<ImportResult> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const check = checkImage(bytes);
  if (!check.ok) return check;
  if (!isTauri) {
    const id = await hexId(bytes, check.extension);
    if (!previews.has(id)) previews.set(id, URL.createObjectURL(new Blob([bytes as BlobPart], { type: file.type })));
    return { ok: true, id };
  }
  try {
    const info = await invoke<ImageInfo>("import_image", bytes);
    return { ok: true, id: info.id };
  } catch (e) {
    return { ok: false, error: "images.error.failed", detail: String(e) };
  }
}

/** The imported pictures, newest first. */
export async function listImages(): Promise<ImageInfo[]> {
  if (isTauri) return invoke<ImageInfo[]>("list_images");
  return [...previews.keys()].reverse().map((id) => ({ id, bytes: 0 }));
}

export async function deleteImage(id: string): Promise<void> {
  if (isTauri) return invoke("delete_image", { id });
  const url = previews.get(id);
  if (url) URL.revokeObjectURL(url);
  previews.delete(id);
}
