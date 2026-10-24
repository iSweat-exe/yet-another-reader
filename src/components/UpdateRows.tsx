import { useEffect, useState } from "react";
import { useT } from "../i18n";
import { useReaderStore } from "../lib/store";
import { appVersion, checkForUpdate, downloadPercent, installUpdate } from "../lib/updates";
import { Row } from "./controls";
import { Icon } from "./Icon";

const outlineButton =
  "min-h-10 rounded-lg px-3 text-sm text-ink shadow-[0_0_0_1px_oklch(from_var(--wash)_l_c_h/0.12)] outline-none transition-[scale,background-color,box-shadow] duration-150 ease-out hover:bg-wash/6 focus-visible:shadow-[0_0_0_2px_var(--color-accent)] active:scale-[0.96] disabled:opacity-40 disabled:active:scale-100";

const primaryButton =
  "flex min-h-10 items-center gap-2 rounded-lg bg-accent px-4 text-sm font-semibold text-surface outline-none transition-[scale,opacity,box-shadow] duration-150 ease-out focus-visible:shadow-[0_0_0_2px_var(--color-surface),0_0_0_4px_var(--color-accent)] active:scale-[0.96] disabled:opacity-40 disabled:active:scale-100";

/** The version that runs, where the update check stands, and what to do about it. */
export function UpdateRows() {
  const t = useT();
  const update = useReaderStore((s) => s.update);
  const [version, setVersion] = useState("");
  useEffect(() => void appVersion().then(setVersion), []);

  const busy = update.phase === "checking" || update.phase === "downloading" || update.phase === "installing";
  const percent = downloadPercent(update);

  const status = (() => {
    switch (update.phase) {
      case "idle":
        return { text: t("update.idle"), tone: "text-ink-dim" };
      case "checking":
        return { text: t("update.checking"), tone: "text-ink-dim" };
      case "upToDate":
        return { text: t("update.upToDate"), tone: "text-emerald-400" };
      case "available":
        return { text: t("update.available", { version: update.version }), tone: "text-ink" };
      case "downloading":
        return { text: percent === null ? t("update.downloadingUnknown") : t("update.downloading", { percent }), tone: "text-ink" };
      case "installing":
        return { text: t("update.installing"), tone: "text-ink" };
      case "error":
        return { text: t("update.error", { message: update.message }), tone: "text-red-400" };
    }
  })();

  return (
    <>
      <Row id="update-check" label={t("update.version")} hint={update.phase === "available" ? undefined : status.text} hintTone={status.tone}>
        <span className="text-sm text-ink-dim tabular-nums">{version}</span>
        <button id="update-check" type="button" disabled={busy} onClick={() => void checkForUpdate()} className={outlineButton}>
          {t("update.check")}
        </button>
      </Row>

      {update.phase === "available" && (
        <div className="space-y-3 py-3">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-sm font-medium">{t("update.available", { version: update.version })}</p>
              <p className="mt-0.5 text-xs text-ink-dim">
                {t("update.availableFrom", { current: update.current })} {t("update.installHint")}
              </p>
            </div>
            <button type="button" onClick={() => void installUpdate()} className={`${primaryButton} shrink-0`}>
              <Icon name="download" />
              {t("update.install")}
            </button>
          </div>
          {update.notes && (
            <div>
              <h3 className="mb-1 text-xs font-medium text-ink-dim">{t("update.notes")}</h3>
              <p className="max-h-40 overflow-y-auto text-sm leading-relaxed whitespace-pre-line">{update.notes}</p>
            </div>
          )}
        </div>
      )}

      {update.phase === "downloading" && (
        <div className="py-3">
          <div role="progressbar" aria-label={t("update.downloadingUnknown")} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent ?? undefined} className="h-1.5 overflow-hidden rounded-full bg-wash/10">
            <div className="h-full w-full origin-left rounded-full bg-accent transition-transform duration-200 ease-out motion-reduce:transition-none" style={{ transform: `scaleX(${(percent ?? 0) / 100})` }} />
          </div>
        </div>
      )}

      {update.phase === "error" && (
        <div className="flex justify-end py-3">
          <button type="button" onClick={() => void checkForUpdate()} className={outlineButton}>
            {t("update.retry")}
          </button>
        </div>
      )}
    </>
  );
}
