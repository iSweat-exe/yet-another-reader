import { widgetSourceFile } from "./registry";

/** The text of every built-in widget file, each fetched only when asked for (a chunk of its own). */
const FILES = import.meta.glob<string>("./builtin/*.tsx", { query: "?raw", import: "default" });

export interface WidgetSource {
  /** Path from the root of the repository. */
  path: string;
  code: string;
  /** 1-based line where the widget itself is defined in `code` (`1` when it is not found). */
  line: number;
}

/** The source of the file that defines a built-in widget, or `null` for a type that has none. */
export async function loadWidgetSource(type: string): Promise<WidgetSource | null> {
  const file = widgetSourceFile(type);
  const load = file ? FILES[`./${file}`] : undefined;
  if (!file || !load) return null;
  const code = await load();
  const at = code.indexOf(`type: "${type}"`);
  return { path: `src/widgets/${file}`, code, line: at < 0 ? 1 : code.slice(0, at).split("\n").length };
}
