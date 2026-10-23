import { listen } from "@tauri-apps/api/event";
import { useEffect, useState } from "react";
import { loadLayout } from "../lib/layoutApi";
import { isTauri } from "../lib/mock";
import { useReaderStore } from "../lib/store";
import { type Layout, classicLayout, migrateLayout } from "./layout";

/** The active layout, kept in sync with edits made in the editor and with the active choice. */
export function useLayout(): Layout {
  const active = useReaderStore((s) => s.settings?.activeLayout ?? "default");
  const [layout, setLayout] = useState<Layout>(() => classicLayout(active));

  // Load whenever the active layout changes.
  useEffect(() => {
    let cancelled = false;
    void loadLayout(active)
      .then((l) => !cancelled && setLayout(l))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [active]);

  // Live edits of the active layout.
  useEffect(() => {
    if (!isTauri) return;
    const unlisten = listen<{ name: string; layout: unknown }>("layout-changed", (e) => {
      const next = migrateLayout(e.payload.layout, e.payload.name);
      if (next && e.payload.name === active) setLayout(next);
    });
    return () => void unlisten.then((fn) => fn());
  }, [active]);

  return layout;
}
