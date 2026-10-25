const nf = new Intl.NumberFormat("en-US");

export const formatScore = (n: number) => nf.format(n);

/**
 * The part of the song a timer counts: from the first to the last hit object, so intro, outro and
 * skips never shift it. Falls back to the whole song until the beatmap file has been read.
 */
export function playSpan(difficulty: { firstObjectMs: number; lastObjectMs: number } | null | undefined, lengthMs: number): { start: number; length: number } {
  if (difficulty && difficulty.lastObjectMs > difficulty.firstObjectMs) return { start: difficulty.firstObjectMs, length: difficulty.lastObjectMs - difficulty.firstObjectMs };
  return { start: 0, length: lengthMs };
}

export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}
