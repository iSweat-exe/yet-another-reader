import { getCurrentWindow } from "@tauri-apps/api/window";
import { useEffect, useState } from "react";
import { useT } from "../i18n";
import { isTauri } from "../lib/state/mock";

/** 10×10 glyphs drawn on the pixel grid, 1px strokes, like the caption buttons they replace. */
const GLYPHS = {
  minimize: <path d="M1 5.5h8" />,
  maximize: <rect x="1.5" y="1.5" width="7" height="7" />,
  restore: <path d="M3 3V1.5h5.5V7H7M1.5 3h5.5v5.5H1.5z" />,
  close: <path d="M1 1l8 8M9 1L1 9" />,
} as const;

function Glyph({ name }: { name: keyof typeof GLYPHS }) {
  return (
    <svg aria-hidden width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="square">
      {GLYPHS[name]}
    </svg>
  );
}

const button =
  "flex h-full w-12 items-center justify-center text-ink-dim outline-none transition-colors duration-100 hover:bg-wash/8 hover:text-ink focus-visible:shadow-[inset_0_0_0_2px_var(--color-accent)] active:bg-wash/12";

/**
 * The window's own caption buttons, drawn in the app's style: the system title bar is turned off (`decorations: false`)
 * and the app header is the drag area. Nothing is drawn in a plain browser, which has no window of its own to control.
 */
export function WindowControls() {
  const t = useT();
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    if (!isTauri) return;
    const win = getCurrentWindow();
    let alive = true;
    const sync = () => void win.isMaximized().then((m) => alive && setMaximized(m));
    sync();
    // Maximizing, restoring and snapping all resize the window.
    const unlisten = win.onResized(sync);
    return () => {
      alive = false;
      void unlisten.then((off) => off());
    };
  }, []);

  if (!isTauri) return null;
  const win = getCurrentWindow();
  return (
    <div className="-mr-4 ml-2 flex h-full self-stretch">
      <button type="button" className={button} title={t("window.minimize")} aria-label={t("window.minimize")} onClick={() => void win.minimize()}>
        <Glyph name="minimize" />
      </button>
      <button type="button" className={button} title={maximized ? t("window.restore") : t("window.maximize")} aria-label={maximized ? t("window.restore") : t("window.maximize")} onClick={() => void win.toggleMaximize()}>
        <Glyph name={maximized ? "restore" : "maximize"} />
      </button>
      <button type="button" className={`${button} hover:!bg-[#e5484d] hover:!text-white active:!bg-[#c93a3f]`} title={t("window.close")} aria-label={t("window.close")} onClick={() => void win.close()}>
        <Glyph name="close" />
      </button>
    </div>
  );
}
