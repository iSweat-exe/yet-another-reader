import { useEffect, useMemo, useState } from "react";
import { useLang, useT } from "../../i18n";
import { type LayoutVersion, loadVersion, listVersions } from "../../lib/layouts/layoutApi";
import { type Layout } from "../../overlay/model/layout";
import { LayoutScene } from "../../overlay/OverlayCanvas";
import { backgroundStyle } from "../model/backgrounds";
import { ActionButton } from "../fields";
import { Modal } from "./dialogs";
import { ASPECTS, useEditor } from "../useEditor";

const PREVIEW_W = 400;

/** "10 minutes ago" in the language of the app, from a timestamp in milliseconds. */
export function ago(ms: number, now: number, lang: string): string {
  const seconds = Math.round((ms - now) / 1000);
  const rtf = new Intl.RelativeTimeFormat(lang, { numeric: "auto" });
  const abs = Math.abs(seconds);
  if (abs < 60) return rtf.format(seconds, "second");
  if (abs < 3600) return rtf.format(Math.round(seconds / 60), "minute");
  if (abs < 86_400) return rtf.format(Math.round(seconds / 3600), "hour");
  return rtf.format(Math.round(seconds / 86_400), "day");
}

/**
 * The older versions of the open layout. The editor saves on every change, so this is the way back from a bad
 * hour of edits: pick a version, see it, restore it. Restoring is an edit like any other (one undo step, then saved).
 */
export function HistoryDialog({ onClose }: { onClose: () => void }) {
  const t = useT();
  const lang = useLang();
  const name = useEditor((s) => s.name);
  const doc = useEditor((s) => s.doc);
  const aspect = useEditor((s) => s.aspect);
  const background = useEditor((s) => s.background);
  const [versions, setVersions] = useState<LayoutVersion[] | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [layout, setLayout] = useState<Layout | null>(null);
  const [now] = useState(() => Date.now());

  useEffect(() => {
    let alive = true;
    void listVersions(name).then((list) => {
      if (!alive) return;
      setVersions(list);
      setSelected(list[0]?.id ?? null);
    });
    return () => {
      alive = false;
    };
  }, [name]);

  useEffect(() => {
    if (selected === null) return setLayout(null);
    let alive = true;
    void loadVersion(name, selected).then((l) => alive && setLayout(l));
    return () => {
      alive = false;
    };
  }, [name, selected]);

  const viewWidth = Math.round(doc.referenceHeight * ASPECTS[aspect]);
  const scale = PREVIEW_W / viewWidth;
  const frame = useMemo(() => ({ width: PREVIEW_W, height: doc.referenceHeight * scale }), [doc.referenceHeight, scale]);
  const restore = () => {
    if (!layout) return;
    useEditor.getState().commit({ ...layout, name });
    useEditor.getState().select([]);
    onClose();
  };

  return (
    <Modal title={t("history.title", { name })} onClose={onClose} wide>
      {versions === null ? null : versions.length === 0 ? (
        <p className="py-4 text-sm text-ink-dim">{t("history.empty")}</p>
      ) : (
        <div className="flex gap-4">
          <ul role="listbox" aria-label={t("history.title", { name })} className="max-h-[50vh] w-56 shrink-0 space-y-1 overflow-y-auto pr-1">
            {versions.map((v) => {
              const delta = v.widgets - doc.widgets.length;
              return (
                <li key={v.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={v.id === selected}
                    onClick={() => setSelected(v.id)}
                    className={`flex min-h-11 w-full flex-col items-start justify-center rounded-md px-2.5 text-left outline-none transition-[background-color,scale] duration-150 active:scale-[0.98] focus-visible:shadow-[0_0_0_2px_var(--color-accent)] ${v.id === selected ? "bg-accent/16" : "hover:bg-wash/6"}`}
                  >
                    <span className="text-sm">{ago(v.id, now, lang)}</span>
                    <span className="text-xs text-ink-dim tabular-nums">
                      {new Date(v.id).toLocaleString(lang, { dateStyle: "short", timeStyle: "short" })} · {t("history.widgets", { n: v.widgets })}
                      {delta !== 0 && ` (${delta > 0 ? "+" : "−"}${Math.abs(delta)})`}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          <div className="min-w-0 flex-1 space-y-3">
            <div className="relative overflow-hidden rounded-lg shadow-[0_0_0_1px_oklch(from_var(--wash)_l_c_h/0.12)]" style={{ ...frame, ...backgroundStyle(background) }} aria-hidden>
              {layout && (
                <div className="pointer-events-none origin-top-left" style={{ transform: `scale(${scale})`, width: viewWidth, height: doc.referenceHeight }}>
                  <LayoutScene layout={layout} viewWidth={viewWidth} ignoreVisibility />
                </div>
              )}
            </div>
            <p className="text-xs leading-snug text-ink-dim">{t("history.hint")}</p>
            <div className="flex justify-end gap-2">
              <ActionButton onClick={onClose}>{t("common.cancel")}</ActionButton>
              <ActionButton variant="primary" icon="undo" disabled={!layout} onClick={restore}>
                {t("history.restore")}
              </ActionButton>
            </div>
          </div>
        </div>
      )}
      {versions !== null && versions.length === 0 && (
        <div className="flex justify-end">
          <ActionButton onClick={onClose}>{t("common.close")}</ActionButton>
        </div>
      )}
    </Modal>
  );
}
