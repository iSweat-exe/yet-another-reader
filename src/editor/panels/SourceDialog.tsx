import { useEffect, useRef, useState } from "react";
import { CopyButton } from "../../components/controls";
import { highlight } from "../../docs/highlight";
import { useT } from "../../i18n";
import { loadWidgetSource, type WidgetSource } from "../../widgets/sources";
import { Modal } from "./dialogs";

/**
 * A read-only view of the source file that defines a built-in widget, scrolled to the widget itself.
 * The text comes from the build (nothing is fetched from the network).
 */
export function SourceDialog({ type, name, onClose }: { type: string; name: string; onClose: () => void }) {
  const t = useT();
  /** `undefined` while it loads, `null` when the widget has no file. */
  const [source, setSource] = useState<WidgetSource | null | undefined>(undefined);
  const code = useRef<HTMLPreElement>(null);

  useEffect(() => {
    let cancelled = false;
    loadWidgetSource(type).then(
      (loaded) => !cancelled && setSource(loaded),
      () => !cancelled && setSource(null),
    );
    return () => {
      cancelled = true;
    };
  }, [type]);

  useEffect(() => {
    const el = code.current;
    if (!source || !el) return;
    const lineHeight = parseFloat(getComputedStyle(el).lineHeight) || 20;
    el.scrollTop = Math.max(0, (source.line - 3) * lineHeight);
  }, [source]);

  return (
    <Modal title={t("editor.sourceTitle", { name })} onClose={onClose} wide>
      {source === null && <p className="text-sm text-ink-dim">{t("editor.sourceMissing")}</p>}
      {source && (
        <>
          <div className="mb-2 flex items-center justify-between gap-3">
            <code className="min-w-0 truncate text-xs text-ink-dim">{source.path}</code>
            <CopyButton text={source.code} />
          </div>
          <pre ref={code} tabIndex={0} aria-label={source.path} className="max-h-[60vh] overflow-auto rounded-lg bg-surface p-3 font-mono text-xs leading-5 whitespace-pre outline-none focus-visible:shadow-[0_0_0_2px_var(--color-accent)]">
            <code dangerouslySetInnerHTML={{ __html: highlight(source.code, "ts") }} />
          </pre>
          <p className="mt-2 text-xs text-ink-dim">{t("editor.sourceHint")}</p>
        </>
      )}
    </Modal>
  );
}
