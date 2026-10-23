import { useEffect, useMemo, useRef } from "react";
import { useReaderStore } from "../lib/store";
import { optionValues, webWidgetUrl } from "../widgets/web";
import type { WidgetInstance } from "./layout";

/**
 * A community widget: a page from the widgets folder shown in an isolated iframe.
 *
 * `sandbox="allow-scripts"` (no `allow-same-origin`) gives the page an opaque origin: it runs
 * its own script but cannot reach this app, the Tauri bridge or any storage. All it can do is
 * read the local API, exactly like an OBS browser source.
 */
export function WebWidget({ instance }: { instance: WidgetInstance }) {
  const manifest = useReaderStore((s) => s.widgets.find((w) => w.id === instance.widget));
  const apiPort = useReaderStore((s) => s.settings?.apiPort);
  const apiEnabled = useReaderStore((s) => s.settings?.apiEnabled ?? true);
  const frame = useRef<HTMLIFrameElement>(null);

  const options = useMemo(() => optionValues(manifest, instance.options), [manifest, instance.options]);

  // The URL (hence the page) is fixed once loaded; later option edits are posted to it instead,
  // so changing a colour in the editor does not reload the widget.
  const optionsAtLoad = useRef(options);
  const src = useMemo(
    () => (manifest && apiPort ? webWidgetUrl(apiPort, manifest, optionsAtLoad.current) : null),
    [manifest, apiPort],
  );

  useEffect(() => {
    frame.current?.contentWindow?.postMessage({ type: "yar:options", options }, "*");
  }, [options]);

  if (!manifest || !src || !apiEnabled) {
    return (
      <div className="flex size-full items-center justify-center rounded border border-dashed border-white/40 p-2 text-center text-xs text-white/70">
        {!manifest ? `? ${instance.widget ?? "web"}` : "API off"}
      </div>
    );
  }
  return (
    <iframe
      ref={frame}
      title={manifest.name}
      src={src}
      sandbox="allow-scripts"
      referrerPolicy="no-referrer"
      className="size-full border-0"
      style={{ background: "transparent", colorScheme: "normal" }}
    />
  );
}
