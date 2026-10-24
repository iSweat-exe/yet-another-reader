import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { useEffect } from "react";
import { setTickerFps } from "./ticker";
import { isTauri, mockInput, mockState, startMock } from "../lib/state/mock";
import { connectReaderStore, setGame, setInput, useReaderStore } from "../lib/state/store";
import type { GameState } from "../lib/state/types";
import { useInputWindow } from "../lib/state/useInputWindow";
import { INPUT_WIDGET_TYPES } from "../widgets/registry";
import { OverlayCanvas } from "./OverlayCanvas";
import { useLayout } from "./useLayout";

/** Root of the in-game overlay window: transparent, widgets only. */
export default function OverlayApp() {
  const layout = useLayout();
  const fps = useReaderStore((s) => s.settings?.overlayFps);
  // The keys are only read from the game while this layout has a widget that shows them.
  useInputWindow("overlay", layout.widgets.some((w) => INPUT_WIDGET_TYPES.has(w.type)));

  useEffect(() => {
    if (fps) setTickerFps(fps);
  }, [fps]);

  useEffect(() => {
    document.documentElement.classList.add("overlay");
    if (!isTauri) return startMock();
    const ready = connectReaderStore({ lite: true });
    return () => void ready.then((unlisten) => unlisten());
  }, []);

  // Preview: fake gameplay for a few seconds so the overlay can be checked outside a play.
  useEffect(() => {
    if (!isTauri) return;
    let timer: ReturnType<typeof setInterval> | undefined;
    const stop = () => {
      clearInterval(timer);
      timer = undefined;
      // Back to the real state (the backend only emits on change, so fetch it).
      void invoke<GameState>("get_game_state").then((game) => useReaderStore.setState({ game }));
    };
    const unlisten = listen<boolean>("overlay-preview", (e) => {
      if (!e.payload) return stop();
      const started = performance.now();
      timer = setInterval(() => {
        const t = (performance.now() - started) / 1000;
        setGame(mockState(t));
        setInput(mockInput(t));
      }, 50);
    });
    return () => {
      clearInterval(timer);
      void unlisten.then((fn) => fn());
    };
  }, []);

  // `?bg=1` paints a stand-in game background when previewing in a browser.
  const preview = !isTauri && new URLSearchParams(location.search).has("bg");
  return (
    <div className="fixed inset-0 overflow-hidden" style={preview ? { background: "linear-gradient(135deg, #1e1b4b, #831843 60%, #0f172a)" } : undefined}>
      <OverlayCanvas layout={layout} />
    </div>
  );
}
