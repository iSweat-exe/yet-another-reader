import { invoke } from "@tauri-apps/api/core";
import { type Layout, classicLayout, migrateLayout } from "../overlay/layout";
import { isTauri } from "./mock";

/**
 * Persistence of layouts. In the app they live in the config folder (Rust side); in a plain
 * browser (design preview) they fall back to localStorage so the editor can still be tried.
 */

const STORAGE_KEY = "yar.layouts";

function readLocal(): Record<string, unknown> {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}") as Record<string, unknown>;
  } catch {
    return {};
  }
}

function writeLocal(all: Record<string, unknown>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  } catch {
    // Storage unavailable: nothing to persist to.
  }
}

export async function listLayouts(active: string): Promise<string[]> {
  if (isTauri) return invoke<string[]>("list_layouts");
  return [...new Set([active, ...Object.keys(readLocal())])].sort((a, b) => a.localeCompare(b));
}

/** A stored layout, migrated to the current format; the built-in classic layout if none exists. */
export async function loadLayout(name: string): Promise<Layout> {
  const raw = isTauri ? await invoke<unknown>("get_layout", { name }) : readLocal()[name];
  return migrateLayout(raw, name) ?? classicLayout(name);
}

export async function saveLayout(name: string, layout: Layout): Promise<void> {
  if (isTauri) return invoke("save_layout", { name, layout: { ...layout, name } });
  const all = readLocal();
  recordLocalVersion(name, all[name]);
  writeLocal({ ...all, [name]: { ...layout, name } });
}

/** An older version of a layout kept by the app (see `layout::record_version` in the Rust side). */
export interface LayoutVersion {
  /** When the layout was in that state, in milliseconds since the Unix epoch. */
  id: number;
  widgets: number;
  bytes: number;
}

// The preview in a plain browser keeps the same rule as the app: a version at most every two minutes, the newest 40.
const VERSIONS_KEY = "yar.layoutVersions";
const VERSION_EVERY_MS = 120_000;
const VERSION_KEEP = 40;

type LocalVersions = Record<string, { id: number; layout: unknown }[]>;

function readVersions(): LocalVersions {
  try {
    return JSON.parse(localStorage.getItem(VERSIONS_KEY) ?? "{}") as LocalVersions;
  } catch {
    return {};
  }
}

function recordLocalVersion(name: string, previous: unknown): void {
  if (previous === undefined) return;
  const all = readVersions();
  const list = all[name] ?? [];
  const now = Date.now();
  if (list[0] && (now - list[0].id < VERSION_EVERY_MS || JSON.stringify(list[0].layout) === JSON.stringify(previous))) return;
  all[name] = [{ id: now, layout: previous }, ...list].slice(0, VERSION_KEEP);
  try {
    localStorage.setItem(VERSIONS_KEY, JSON.stringify(all));
  } catch {
    // Storage full or unavailable: no history, the layout itself is still saved.
  }
}

/** The older versions of a layout, newest first. */
export async function listVersions(name: string): Promise<LayoutVersion[]> {
  if (isTauri) return invoke<LayoutVersion[]>("list_layout_versions", { name });
  return (readVersions()[name] ?? []).map((v) => ({ id: v.id, widgets: Array.isArray((v.layout as { widgets?: unknown })?.widgets) ? (v.layout as { widgets: unknown[] }).widgets.length : 0, bytes: JSON.stringify(v.layout).length }));
}

/** One of those versions, migrated to the current format; `null` when it is gone. */
export async function loadVersion(name: string, id: number): Promise<Layout | null> {
  const raw = isTauri ? await invoke<unknown>("get_layout_version", { name, id }) : readVersions()[name]?.find((v) => v.id === id)?.layout;
  return raw ? migrateLayout(raw, name) : null;
}

export async function deleteLayout(name: string): Promise<void> {
  if (isTauri) return invoke("delete_layout", { name });
  const all = readLocal();
  delete all[name];
  writeLocal(all);
  const versions = readVersions();
  delete versions[name];
  try {
    localStorage.setItem(VERSIONS_KEY, JSON.stringify(versions));
  } catch {
    // Nothing to clean up if storage is unavailable.
  }
}
