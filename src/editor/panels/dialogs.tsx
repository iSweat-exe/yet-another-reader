import { invoke } from "@tauri-apps/api/core";
import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { Icon } from "../../components/icons/Icon";
import { useT } from "../../i18n";
import { Select } from "../../components/select/Select";
import { buildBundle, ShareError } from "../../lib/layouts/layoutShare";
import { MAX_CODE_CHARS, toShareCode } from "../../lib/layouts/layoutBundle";
import { useReaderStore } from "../../lib/state/store";
import { type Layout, PRESETS, type PresetId } from "../../overlay/model/layout";
import { controlClass } from "../fields";

const EXIT_MS = 120;
const FOCUSABLE = 'button:not(:disabled), [href], input:not(:disabled), textarea:not(:disabled), select:not(:disabled), [tabindex]:not([tabindex="-1"])';

/**
 * A dialog over a dimmed page. Focus moves into it, stays in it (Tab cycles) and goes back to the
 * control that opened it. Esc, the close button and a click outside leave through a short fade;
 * `guard` keeps a click outside from closing it (something typed in it would be lost).
 */
export function Modal({ title, onClose, guard, wide, children }: { title: string; onClose: () => void; guard?: boolean; /** A roomier panel, for a dialog with a list and a preview. */ wide?: boolean; children: ReactNode }) {
  const t = useT();
  const panel = useRef<HTMLDivElement>(null);
  const [closing, setClosing] = useState(false);
  const leave = useCallback(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) return onClose();
    setClosing(true);
    window.setTimeout(onClose, EXIT_MS);
  }, [onClose]);

  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    // A field that took the focus itself (a name to type) keeps it; otherwise the first control gets it.
    if (!panel.current?.contains(document.activeElement)) panel.current?.querySelector<HTMLElement>(FOCUSABLE)?.focus();
    return () => opener?.focus();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") return leave();
      if (e.key !== "Tab" || !panel.current) return;
      const items = [...panel.current.querySelectorAll<HTMLElement>(FOCUSABLE)];
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (!panel.current.contains(document.activeElement) || (e.shiftKey && document.activeElement === first)) {
        e.preventDefault();
        (e.shiftKey ? last : first).focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [leave]);

  return (
    <div data-closing={closing} className="modal-scrim fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4" onPointerDown={() => !guard && leave()}>
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onPointerDown={(e) => e.stopPropagation()}
        className={`modal-panel w-full ${wide ? "max-w-3xl" : "max-w-md"} rounded-2xl bg-surface-raised p-5 shadow-[0_0_0_1px_oklch(from_var(--wash)_l_c_h/0.1),0_20px_60px_oklch(0_0_0/0.6)]`}
      >
        <header className="mb-4 flex items-start justify-between gap-3">
          <h2 className="text-base font-semibold">{title}</h2>
          <button
            type="button"
            aria-label={t("common.close")}
            onClick={leave}
            className="-mt-1 -mr-1 flex size-10 items-center justify-center rounded-lg text-ink-dim outline-none transition-[color,background-color,scale] duration-150 hover:bg-wash/8 hover:text-ink focus-visible:shadow-[0_0_0_2px_var(--color-accent)] active:scale-[0.96]"
          >
            <Icon name="close" />
          </button>
        </header>
        {children}
      </div>
    </div>
  );
}

export const primaryButton = "min-h-10 rounded-lg bg-accent px-4 text-sm font-semibold text-surface outline-none transition-[scale,opacity,box-shadow,filter] duration-150 hover:brightness-110 focus-visible:shadow-[0_0_0_2px_var(--color-surface-raised),0_0_0_4px_var(--color-accent)] active:scale-[0.96] disabled:opacity-40 disabled:hover:brightness-100 disabled:active:scale-100";
export const quietButton = "min-h-10 rounded-lg px-3 text-sm text-ink-dim outline-none transition-[color,background-color,scale,box-shadow] duration-150 hover:bg-wash/8 hover:text-ink focus-visible:shadow-[0_0_0_2px_var(--color-accent)] active:scale-[0.96]";

/** Maps an error from the store (`Error: nameTaken`, ...) to a translated message. */
export function useErrorText(): (message: string | null) => string | null {
  const t = useT();
  return (message) => {
    if (!message) return null;
    if (message.includes("invalidName")) return t("editor.error.invalidName");
    if (message.includes("nameTaken")) return t("editor.error.nameTaken");
    if (message.includes("invalidLayout")) return t("editor.error.invalidLayout");
    if (message.includes("invalidAsset")) return t("editor.error.invalidAsset");
    return message;
  };
}

interface NameDialogProps {
  title: string;
  initial: string;
  confirmLabel: string;
  /** Show a template picker (for a new layout). */
  templates?: boolean;
  onSubmit: (name: string, preset: PresetId) => Promise<string | null>;
  onClose: () => void;
}

export function NameDialog({ title, initial, confirmLabel, templates, onSubmit, onClose }: NameDialogProps) {
  const t = useT();
  const errorText = useErrorText();
  const [name, setName] = useState(initial);
  const [preset, setPreset] = useState<PresetId>("classic");
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => input.current?.select(), []);

  const submit = async () => {
    const failure = await onSubmit(name.trim(), preset);
    if (failure) setError(failure);
    else onClose();
  };

  return (
    <Modal title={title} onClose={onClose} guard={name !== initial}>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <label className="block text-sm">
          <span className="mb-1 block text-xs text-ink-dim">{t("editor.layoutName")}</span>
          <input ref={input} value={name} onChange={(e) => setName(e.target.value)} maxLength={40} className={`${controlClass} w-full text-left`} />
        </label>
        {templates && (
          <div className="text-sm">
            <span className="mb-1 block text-xs text-ink-dim">{t("editor.template")}</span>
            <Select
              label={t("editor.template")}
              value={preset}
              onChange={setPreset}
              options={PRESETS.map((p) => ({ value: p, label: t(`editor.preset.${p}`) }))}
            />
          </div>
        )}
        {error && (
          <p role="alert" className="text-sm text-red-400 transition-opacity duration-150 ease-out starting:opacity-0 motion-reduce:transition-none">
            {errorText(error)}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className={quietButton}>
            {t("common.cancel")}
          </button>
          <button type="submit" disabled={name.trim() === ""} className={primaryButton}>
            {confirmLabel}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export function ConfirmDialog({ title, message, confirmLabel, onConfirm, onClose }: { title: string; message: string; confirmLabel: string; onConfirm: () => void; onClose: () => void }) {
  const t = useT();
  return (
    <Modal title={title} onClose={onClose}>
      <p className="mb-5 text-sm text-ink-dim">{message}</p>
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onClose} className={quietButton}>
          {t("common.cancel")}
        </button>
        <button
          type="button"
          onClick={() => {
            onConfirm();
            onClose();
          }}
          className="min-h-10 rounded-lg bg-red-700 px-4 text-sm font-semibold text-white outline-none transition-[scale,box-shadow,background-color] duration-150 hover:bg-red-600 focus-visible:shadow-[0_0_0_2px_var(--color-surface-raised),0_0_0_4px_var(--color-accent)] active:scale-[0.96]"
        >
          {confirmLabel}
        </button>
      </div>
    </Modal>
  );
}

export function ImportDialog({ onSubmit, onClose }: { onSubmit: (text: string, name: string) => Promise<string | null>; onClose: () => void }) {
  const t = useT();
  const errorText = useErrorText();
  const [text, setText] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  const loadFile = async (file: File | undefined) => {
    if (!file) return;
    setText(await file.text());
    if (!name) setName(file.name.replace(/\.(json|yarlayout)$/i, "").replace(/[^\p{L}\p{N} _-]/gu, "").slice(0, 40));
  };

  const submit = async () => {
    const failure = await onSubmit(text, name.trim());
    if (failure) setError(failure);
    else onClose();
  };

  return (
    <Modal title={t("editor.importTitle")} onClose={onClose} guard={text !== "" || name !== ""}>
      <div className="space-y-3">
        <p className="text-sm text-ink-dim">{t("editor.importHint")}</p>
        <textarea value={text} onChange={(e) => setText(e.target.value)} spellCheck={false} rows={7} className={`${controlClass} w-full resize-none font-mono text-xs`} aria-label={t("editor.importTextLabel")} />
        <label className={`${quietButton} inline-flex cursor-pointer items-center`}>
          {t("editor.importFile")}
          <input type="file" accept=".yarlayout,.json,application/json" className="hidden" onChange={(e) => void loadFile(e.target.files?.[0])} />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-xs text-ink-dim">{t("editor.layoutName")}</span>
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} className={`${controlClass} w-full text-left`} />
        </label>
        {error && (
          <p role="alert" className="text-sm text-red-400 transition-opacity duration-150 ease-out starting:opacity-0 motion-reduce:transition-none">
            {errorText(error)}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className={quietButton}>
            {t("common.cancel")}
          </button>
          <button type="button" disabled={!text.trim() || !name.trim()} onClick={() => void submit()} className={primaryButton}>
            {t("common.import")}
          </button>
        </div>
      </div>
    </Modal>
  );
}

export function ExportDialog({ layout, onClose }: { layout: Layout; onClose: () => void }) {
  const t = useT();
  const api = useReaderStore((s) => s.api);
  // The layout as it was when the dialog opened: the bundle is built once.
  const [snapshot] = useState(layout);
  const [bundle, setBundle] = useState<{ text: string; code: string | null; assets: number; bytes: number } | { error: string } | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let current = true;
    buildBundle(snapshot, api)
      .then(async (b) => {
        const code = await toShareCode(b.text);
        if (current) setBundle({ ...b, code: code.length <= MAX_CODE_CHARS ? code : null });
      })
      .catch((e: unknown) => current && setBundle({ error: e instanceof ShareError ? e.reason : "failed" }));
    return () => {
      current = false;
    };
  }, [snapshot, api]);

  const copy = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard unavailable: the code stays selectable in the box.
    }
  };

  const download = (text: string) => {
    const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `${snapshot.name}.yarlayout`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const ready = bundle && "text" in bundle ? bundle : null;
  return (
    <Modal title={t("editor.exportTitle", { name: snapshot.name })} onClose={onClose}>
      <div className="space-y-3 text-sm">
        {!bundle && <p className="text-ink-dim">{t("editor.exportBuilding")}</p>}
        {bundle && "error" in bundle && (
          <p role="alert" className="text-red-400">
            {bundle.error === "missingAsset" ? t("editor.exportMissing") : bundle.error === "tooLarge" ? t("editor.exportTooLarge") : t("editor.exportFailed")}
          </p>
        )}
        {ready && (
          <>
            <p className="text-ink-dim">{t("editor.exportSummary", { widgets: snapshot.widgets.length, files: ready.assets, size: formatBytes(ready.bytes) })}</p>
            {ready.code ? (
              <textarea readOnly value={ready.code} rows={4} spellCheck={false} aria-label={t("editor.exportCode")} onFocus={(e) => e.currentTarget.select()} className={`${controlClass} w-full resize-none font-mono text-xs break-all`} />
            ) : (
              <p className="text-xs text-ink-dim">{t("editor.exportCodeTooLarge")}</p>
            )}
          </>
        )}
        <div className="flex justify-end gap-2">
          <button type="button" disabled={!ready?.code} onClick={() => ready?.code && void copy(ready.code)} className={`${quietButton} min-w-28 disabled:opacity-40`}>
            {copied ? t("common.copied") : t("editor.exportCopyCode")}
          </button>
          <button type="button" disabled={!ready} onClick={() => ready && download(ready.text)} className={primaryButton}>
            {t("editor.exportDownload")}
          </button>
        </div>
      </div>
    </Modal>
  );
}

/** `1.4 MB`, `820 KB`, `0 KB`. */
function formatBytes(bytes: number): string {
  return bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.round(bytes / 1024)} KB`;
}

/** Creates a community widget from the template, then says where to edit it (the overlay reloads it on save). */
export function NewWidgetDialog({ onClose }: { onClose: () => void }) {
  const t = useT();
  const errorText = useErrorText();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ id: string; dir: string } | null>(null);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => input.current?.focus(), []);

  const submit = async () => {
    try {
      const id = await invoke<string>("create_widget", { name: name.trim() });
      const dir = await invoke<string>("get_widgets_dir");
      setCreated({ id, dir });
    } catch (e) {
      setError(String(e));
    }
  };

  if (created) {
    return (
      <Modal title={t("editor.newWidgetDoneTitle")} onClose={onClose}>
        <div className="space-y-4 text-sm">
          <p>{t("editor.newWidgetDone", { id: created.id })}</p>
          <p className="rounded-md bg-wash/6 px-3 py-2 font-mono text-xs break-all text-ink-dim">{`${created.dir}\\${created.id}`}</p>
          <p className="text-ink-dim">{t("editor.newWidgetEdit")}</p>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => void invoke("open_widgets_folder")} className={quietButton}>
              {t("editor.openFolder")}
            </button>
            <button type="button" onClick={onClose} className={primaryButton}>
              {t("common.close")}
            </button>
          </div>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title={t("editor.newWidgetTitle")} onClose={onClose} guard={name !== ""}>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <p className="text-sm text-ink-dim">{t("editor.newWidgetHint")}</p>
        <label className="block text-sm">
          <span className="mb-1 block text-xs text-ink-dim">{t("editor.newWidgetName")}</span>
          <input ref={input} value={name} onChange={(e) => setName(e.target.value)} maxLength={40} className={`${controlClass} w-full text-left`} />
        </label>
        {error && (
          <p role="alert" className="text-sm text-red-400 transition-opacity duration-150 ease-out starting:opacity-0 motion-reduce:transition-none">
            {errorText(error)}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className={quietButton}>
            {t("common.cancel")}
          </button>
          <button type="submit" disabled={name.trim() === ""} className={primaryButton}>
            {t("common.create")}
          </button>
        </div>
      </form>
    </Modal>
  );
}
