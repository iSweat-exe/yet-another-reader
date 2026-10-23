import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { Icon } from "../components/Icon";
import { useT } from "../i18n";
import { Select } from "../components/Select";
import type { PresetId } from "../overlay/layout";
import { controlClass } from "./fields";

const EXIT_MS = 120;
const FOCUSABLE = 'button:not(:disabled), [href], input:not(:disabled), textarea:not(:disabled), select:not(:disabled), [tabindex]:not([tabindex="-1"])';

/**
 * A dialog over a dimmed page. Focus moves into it, stays in it (Tab cycles) and goes back to the
 * control that opened it. Esc, the close button and a click outside leave through a short fade;
 * `guard` keeps a click outside from closing it (something typed in it would be lost).
 */
export function Modal({ title, onClose, guard, children }: { title: string; onClose: () => void; guard?: boolean; children: ReactNode }) {
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
        className="modal-panel w-full max-w-md rounded-2xl bg-surface-raised p-5 shadow-[0_0_0_1px_oklch(1_0_0/0.1),0_20px_60px_oklch(0_0_0/0.6)]"
      >
        <header className="mb-4 flex items-start justify-between gap-3">
          <h2 className="text-base font-semibold">{title}</h2>
          <button
            type="button"
            aria-label={t("common.close")}
            onClick={leave}
            className="-mt-1 -mr-1 flex size-10 items-center justify-center rounded-lg text-ink-dim outline-none transition-[color,background-color,scale] duration-150 hover:bg-white/8 hover:text-ink focus-visible:shadow-[0_0_0_2px_var(--color-accent)] active:scale-[0.96]"
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
export const quietButton = "min-h-10 rounded-lg px-3 text-sm text-ink-dim outline-none transition-[color,background-color,scale,box-shadow] duration-150 hover:bg-white/8 hover:text-ink focus-visible:shadow-[0_0_0_2px_var(--color-accent)] active:scale-[0.96]";

/** Maps an error from the store (`Error: nameTaken`, ...) to a translated message. */
export function useErrorText(): (message: string | null) => string | null {
  const t = useT();
  return (message) => {
    if (!message) return null;
    if (message.includes("invalidName")) return t("editor.error.invalidName");
    if (message.includes("nameTaken")) return t("editor.error.nameTaken");
    if (message.includes("invalidLayout")) return t("editor.error.invalidLayout");
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
              options={[
                { value: "classic", label: t("editor.preset.classic") },
                { value: "minimal", label: t("editor.preset.minimal") },
                { value: "empty", label: t("editor.preset.empty") },
              ]}
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
    if (!name) setName(file.name.replace(/\.json$/i, "").replace(/[^\p{L}\p{N} _-]/gu, "").slice(0, 40));
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
        <textarea value={text} onChange={(e) => setText(e.target.value)} spellCheck={false} rows={7} className={`${controlClass} w-full resize-none font-mono text-xs`} aria-label="JSON" />
        <label className={`${quietButton} inline-flex cursor-pointer items-center`}>
          {t("editor.importFile")}
          <input type="file" accept=".json,application/json" className="hidden" onChange={(e) => void loadFile(e.target.files?.[0])} />
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

export function ExportDialog({ name, json, onClose }: { name: string; json: string; onClose: () => void }) {
  const t = useT();
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(json);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard unavailable: the text stays selectable in the box.
    }
  };

  const download = () => {
    const url = URL.createObjectURL(new Blob([json], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `${name}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Modal title={t("editor.exportTitle", { name })} onClose={onClose}>
      <textarea readOnly value={json} rows={10} spellCheck={false} aria-label="JSON" onFocus={(e) => e.currentTarget.select()} className={`${controlClass} w-full resize-none font-mono text-xs`} />
      <div className="mt-4 flex justify-end gap-2">
        <button type="button" onClick={download} className={quietButton}>
          {t("editor.exportDownload")}
        </button>
        <button type="button" onClick={() => void copy()} className={`${primaryButton} min-w-28`}>
          {copied ? t("common.copied") : t("editor.exportCopy")}
        </button>
      </div>
    </Modal>
  );
}
