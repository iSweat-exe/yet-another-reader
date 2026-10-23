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
  writeLocal({ ...readLocal(), [name]: { ...layout, name } });
}

export async function deleteLayout(name: string): Promise<void> {
  if (isTauri) return invoke("delete_layout", { name });
  const all = readLocal();
  delete all[name];
  writeLocal(all);
}
