import { invoke } from "@tauri-apps/api/core";
import type { Layout } from "../../overlay/model/layout";
import { checkFont } from "../media/fonts";
import { checkImage, type ImageInfo, localAsset, rememberLocalAsset } from "../media/images";
import { assetIdsIn, type BundleAsset, encodeBundle, MAX_ASSET_BYTES, MAX_ASSETS, type ParsedBundle, remapAssetIds } from "./layoutBundle";
import { isTauri } from "../state/mock";

type Api = { running: boolean; url: string | null } | null;

/** Where a file is read from: the local API, or (browser preview) the copy kept in memory. */
function assetUrl(id: string, api: Api): string | null {
  return localAsset(id) ?? (api?.running && api.url ? `${api.url}/api/v1/images/${id}` : null);
}

export class ShareError extends Error {
  constructor(readonly reason: "missingAsset" | "tooLarge" | "invalidAsset") {
    super(reason);
  }
}

/** The text of the bundle of a layout, with every picture and font it uses read from the app. */
export async function buildBundle(layout: Layout, api: Api): Promise<{ text: string; assets: number; bytes: number }> {
  const ids = assetIdsIn(layout);
  if (ids.length > MAX_ASSETS) throw new ShareError("tooLarge");
  const assets: BundleAsset[] = [];
  let bytes = 0;
  for (const id of ids) {
    const url = assetUrl(id, api);
    if (!url) throw new ShareError("missingAsset");
    const response = await fetch(url).catch(() => null);
    if (!response?.ok) throw new ShareError("missingAsset");
    const data = new Uint8Array(await response.arrayBuffer());
    bytes += data.length;
    if (bytes > MAX_ASSET_BYTES) throw new ShareError("tooLarge");
    assets.push({ id, bytes: data });
  }
  return { text: encodeBundle(layout, assets), assets: assets.length, bytes };
}

/** Imports a file of a bundle (checked first, like any file the user picks); resolves to the id it now has. */
async function importAsset(asset: BundleAsset): Promise<string> {
  const check = asset.id.match(/\.(ttf|otf|woff2?)$/) ? checkFont(asset.bytes) : checkImage(asset.bytes);
  if (!check.ok) throw new ShareError("invalidAsset");
  if (!isTauri) return rememberLocalAsset(asset.bytes, check.extension, "application/octet-stream");
  try {
    return (await invoke<ImageInfo>("import_image", asset.bytes)).id;
  } catch {
    throw new ShareError("invalidAsset");
  }
}

/** Imports the files of a bundle and returns its layout with their (possibly new) ids. */
export async function importBundle(parsed: ParsedBundle): Promise<unknown> {
  const renamed = new Map<string, string>();
  for (const asset of parsed.assets) renamed.set(asset.id, await importAsset(asset));
  return remapAssetIds(parsed.layout, renamed);
}
