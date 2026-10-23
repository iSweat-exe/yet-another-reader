import { invoke } from "@tauri-apps/api/core";
import { getVersion } from "@tauri-apps/api/app";
import { isTauri } from "./mock";
import { useReaderStore } from "./store";
import type { UpdateStatus } from "./types";

const set = (update: UpdateStatus) => useReaderStore.setState({ update });

/** The version of the running app (the mock one in a plain browser). */
export async function appVersion(): Promise<string> {
  return isTauri ? getVersion() : "0.1.0";
}

/** Looks for a new version now. The result also arrives as an `update-status` event. */
export async function checkForUpdate(): Promise<void> {
  if (!isTauri) {
    set({ phase: "checking" });
    await new Promise((r) => setTimeout(r, 700));
    return set({ phase: "upToDate" });
  }
  set(await invoke<UpdateStatus>("check_for_update"));
}

/** Downloads, verifies and installs the update found by the last check, then the app restarts. */
export async function installUpdate(): Promise<void> {
  if (!isTauri) {
    // Design preview: a fake download.
    for (let downloaded = 0; downloaded <= 100; downloaded += 5) {
      set({ phase: "downloading", downloaded, total: 100 });
      await new Promise((r) => setTimeout(r, 120));
    }
    return set({ phase: "installing" });
  }
  try {
    await invoke("install_update");
  } catch {
    // The failure is also sent as an `update-status` event with its message.
  }
}

/** Download progress as a whole percentage, or `null` when the size is not known. */
export function downloadPercent(update: UpdateStatus): number | null {
  if (update.phase !== "downloading" || !update.total) return null;
  return Math.min(100, Math.round((update.downloaded * 100) / update.total));
}
