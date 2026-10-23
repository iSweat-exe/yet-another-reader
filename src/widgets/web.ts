import type { WidgetManifest, WidgetOption } from "../lib/types";

/** Option values to use: the manifest's defaults overridden by what the layout saved. */
export function optionValues(manifest: { options?: WidgetOption[] } | undefined, saved: Record<string, unknown> | undefined): Record<string, unknown> {
  const values: Record<string, unknown> = {};
  for (const option of manifest?.options ?? []) {
    if (option.default !== undefined) values[option.key] = option.default;
  }
  return { ...values, ...saved };
}

/**
 * URL of a community widget's page. The API address and the options are passed in the query
 * string so the widget can render correctly on its very first paint.
 */
export function webWidgetUrl(apiPort: number, manifest: Pick<WidgetManifest, "id" | "entry">, options: Record<string, unknown>): string {
  const base = `http://127.0.0.1:${apiPort}`;
  const path = manifest.entry.split("/").map(encodeURIComponent).join("/");
  const query = new URLSearchParams({ api: base, options: JSON.stringify(options) });
  return `${base}/widgets/${encodeURIComponent(manifest.id)}/${path}?${query.toString()}`;
}
