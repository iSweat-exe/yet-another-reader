import { invoke } from "@tauri-apps/api/core";
import { useEffect } from "react";
import { isTauri } from "./mock";

/**
 * Tells the backend that this window needs the held keys and mouse buttons (`label` is the
 * window's label: `overlay` or `main`). They are only read from the game while somebody asks.
 */
export function useInputWindow(label: string, wanted: boolean): void {
  useEffect(() => {
    if (!isTauri || !wanted) return;
    void invoke("set_input_window", { label, wanted: true });
    return () => void invoke("set_input_window", { label, wanted: false });
  }, [label, wanted]);
}
