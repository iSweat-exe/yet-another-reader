import { FONT_EXTENSIONS } from "../media/fonts";
import { IMAGE_EXTENSIONS } from "../media/images";
import type { Layout } from "../../overlay/model/layout";

/**
 * A layout to share: its JSON plus the pictures and fonts it uses, in one text file (`.yarlayout`) or one
 * compact code. A layout alone only keeps the *ids* of its pictures and fonts, which mean nothing on another
 * computer; the bundle carries the files and the receiver imports them (the id of a file is its hash, so the
 * layout's references stay valid).
 */

export const BUNDLE_FORMAT = "yar-layout";
export const BUNDLE_VERSION = 1;
/** Prefix of a share code (the version is part of it: a future format gets another prefix). */
export const CODE_PREFIX = "yar1:";
/** A bundle with more files than this is refused (a hand-made one could be a bomb). */
export const MAX_ASSETS = 64;
/** Total size of the embedded files. */
export const MAX_ASSET_BYTES = 40 * 1024 * 1024;
/** Longest share code the dialog offers: beyond it, the file is the way to share. */
export const MAX_CODE_CHARS = 120_000;

const EXTENSIONS = [...IMAGE_EXTENSIONS, ...FONT_EXTENSIONS].join("|");
const ASSET_ID = new RegExp(`^[0-9a-f]{32}\\.(${EXTENSIONS})$`);
const CUSTOM_FONT = /^custom:(.+)$/;

export const isAssetId = (value: unknown): value is string => typeof value === "string" && ASSET_ID.test(value);

export interface BundleAsset {
  id: string;
  bytes: Uint8Array;
}

/** The ids of every picture and font a layout refers to (in a widget's options, or as its text font). */
export function assetIdsIn(layout: Layout): string[] {
  const ids = new Set<string>();
  for (const widget of layout.widgets) {
    for (const value of Object.values(widget.options ?? {})) if (isAssetId(value)) ids.add(value);
    const font = widget.style?.font?.match(CUSTOM_FONT)?.[1];
    if (isAssetId(font)) ids.add(font);
  }
  return [...ids];
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

export function base64ToBytes(text: string): Uint8Array {
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** The text of a bundle: JSON with the files in base64. */
export function encodeBundle(layout: Layout, assets: readonly BundleAsset[]): string {
  return JSON.stringify(
    {
      format: BUNDLE_FORMAT,
      version: BUNDLE_VERSION,
      layout,
      assets: assets.map((a) => ({ id: a.id, data: bytesToBase64(a.bytes) })),
    },
    null,
    1,
  );
}

export interface ParsedBundle {
  /** The layout as found (not yet migrated). */
  layout: unknown;
  assets: BundleAsset[];
}

/** Reads a bundle, or a plain layout JSON (what the editor exported before bundles): both give a layout. */
export function parseBundle(text: string): ParsedBundle | null {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof raw !== "object" || raw === null) return null;
  const obj = raw as Record<string, unknown>;
  if (obj.format !== BUNDLE_FORMAT) return { layout: raw, assets: [] };
  if (typeof obj.version !== "number" || obj.version > BUNDLE_VERSION || !Array.isArray(obj.assets)) return null;
  if (obj.assets.length > MAX_ASSETS) return null;
  const assets: BundleAsset[] = [];
  let total = 0;
  for (const entry of obj.assets as unknown[]) {
    const e = entry as { id?: unknown; data?: unknown } | null;
    if (!e || !isAssetId(e.id) || typeof e.data !== "string") return null;
    let bytes: Uint8Array;
    try {
      bytes = base64ToBytes(e.data);
    } catch {
      return null;
    }
    total += bytes.length;
    if (total > MAX_ASSET_BYTES) return null;
    assets.push({ id: e.id, bytes });
  }
  return { layout: obj.layout, assets };
}

/** Replaces ids in a layout (after the files were imported under other ids). The layout is not modified. */
export function remapAssetIds<T>(layout: T, map: ReadonlyMap<string, string>): T {
  if (map.size === 0) return layout;
  let text = JSON.stringify(layout);
  for (const [from, to] of map) if (from !== to) text = text.split(from).join(to);
  return JSON.parse(text) as T;
}

function toBase64Url(bytes: Uint8Array): string {
  return bytesToBase64(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(text: string): Uint8Array {
  const padded = text.replace(/-/g, "+").replace(/_/g, "/");
  return base64ToBytes(padded + "=".repeat((4 - (padded.length % 4)) % 4));
}

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const out = new Blob([bytes as BlobPart]).stream().pipeThrough(stream as unknown as ReadableWritablePair<Uint8Array, BufferSource>);
  return new Uint8Array(await new Response(out).arrayBuffer());
}

/** The bundle as a short text to paste in a chat: compressed, URL-safe, with a version prefix. */
export async function toShareCode(bundleText: string): Promise<string> {
  return CODE_PREFIX + toBase64Url(await pipe(new TextEncoder().encode(bundleText), new CompressionStream("deflate-raw")));
}

/** The bundle text behind a share code, or `null` when it is not one. */
export async function fromShareCode(code: string): Promise<string | null> {
  const body = code.trim();
  if (!body.startsWith(CODE_PREFIX)) return null;
  try {
    const bytes = await pipe(fromBase64Url(body.slice(CODE_PREFIX.length)), new DecompressionStream("deflate-raw"));
    return new TextDecoder().decode(bytes);
  } catch {
    return null;
  }
}

/** What the import dialog may be given: a code, a bundle or a plain layout. */
export async function readImport(text: string): Promise<ParsedBundle | null> {
  const trimmed = text.trim();
  const bundle = trimmed.startsWith(CODE_PREFIX) ? await fromShareCode(trimmed) : trimmed;
  return bundle === null ? null : parseBundle(bundle);
}
