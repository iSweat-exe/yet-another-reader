/** Lower-cases and drops accents, so "etoiles" finds "Étoiles". */
export const fold = (text: string) => text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

/**
 * How well `query` matches `label`, `0` meaning not at all. Every word of the query must be found; a label that
 * starts with it beats one with a word that starts with it, which beats one that merely contains it.
 */
export function matchScore(label: string, query: string): number {
  const words = fold(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return 1;
  const text = fold(label);
  let score = 0;
  for (const word of words) {
    const at = text.indexOf(word);
    if (at < 0) return 0;
    if (at === 0) score += 3;
    else if (/[\s:/(-]/.test(text[at - 1])) score += 2;
    else score += 1;
  }
  return score;
}

/** The items that match `query`, best first; the original order breaks ties (and is kept for an empty query). */
export function rank<T>(items: readonly T[], query: string, labelOf: (item: T) => string): T[] {
  if (!query.trim()) return [...items];
  return items
    .map((item, order) => ({ item, order, score: matchScore(labelOf(item), query) }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score || a.order - b.order)
    .map((r) => r.item);
}
