/** Pure keyboard-navigation helpers of the {@link Select} dropdown, kept apart so they can be tested. */

interface Selectable {
  disabled?: boolean;
}

/** The enabled option after (`step` = 1) or before (`step` = -1) `from`; `from` if there is none. */
export function moveIndex(options: readonly Selectable[], from: number, step: 1 | -1): number {
  for (let i = from + step; i >= 0 && i < options.length; i += step) {
    if (!options[i].disabled) return i;
  }
  return from;
}

export function firstEnabled(options: readonly Selectable[]): number {
  return options.findIndex((o) => !o.disabled);
}

export function lastEnabled(options: readonly Selectable[]): number {
  for (let i = options.length - 1; i >= 0; i--) if (!options[i].disabled) return i;
  return -1;
}

/**
 * Index of the next enabled option whose label starts with `typed` (case-insensitive), searching
 * after `from` and wrapping around. A repeated single letter cycles through the options starting
 * with it. `-1` if nothing matches.
 */
export function typeaheadIndex(labels: readonly string[], disabled: readonly boolean[], typed: string, from: number): number {
  const needle = typed.toLowerCase();
  if (needle === "") return -1;
  const cycling = needle.length > 1 && [...needle].every((c) => c === needle[0]);
  const query = cycling ? needle[0] : needle;
  for (let step = 1; step <= labels.length; step++) {
    // With a multi-letter query the current option counts too (it may still match).
    const i = (from + (query.length > 1 ? step - 1 : step) + labels.length) % labels.length;
    if (!disabled[i] && labels[i].toLowerCase().startsWith(query)) return i;
  }
  return -1;
}
