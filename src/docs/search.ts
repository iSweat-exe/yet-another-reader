import { plainText } from "./markdown";
import type { DocPage } from "./pages";

export interface SearchHit {
  page: DocPage;
  /** A line of the page around the first match, to tell the results apart. */
  snippet: string;
  /** Whether the title itself matches: those come first. */
  inTitle: boolean;
}

const SNIPPET_RADIUS = 48;

/**
 * Finds the pages whose title or text contains every word of `query` (case-insensitive).
 * `titleOf` gives the displayed title of a page, which is what the title match is made on.
 */
export function searchDocs(pages: readonly DocPage[], query: string, titleOf: (page: DocPage) => string): SearchHit[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  const hits: SearchHit[] = [];
  for (const page of pages) {
    const title = titleOf(page).toLowerCase();
    // Table pipes, heading marks and rules are layout, not words: they would pollute the snippet.
    const text = plainText(page.source.replace(/^> \[!SCREENSHOT\][^\n]*(?:\n> [^\n]*)*/gm, "")).replace(/[|#>]/g, " ").replace(/(?:\s-+){2,}/g, " ").replace(/\s+/g, " ");
    const haystack = text.toLowerCase();
    if (!words.every((w) => title.includes(w) || haystack.includes(w))) continue;
    const at = words.map((w) => haystack.indexOf(w)).filter((i) => i >= 0)[0] ?? 0;
    const from = Math.max(0, at - SNIPPET_RADIUS);
    const snippet = `${from > 0 ? "…" : ""}${text.slice(from, at + SNIPPET_RADIUS * 2).trim()}…`;
    hits.push({ page, snippet, inTitle: words.every((w) => title.includes(w)) });
  }
  return hits.sort((a, b) => Number(b.inTitle) - Number(a.inTitle));
}
