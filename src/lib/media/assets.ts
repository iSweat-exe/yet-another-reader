/**
 * Where the osu!lazer textures shipped in `public/Textures/` are, and which one stands for what. Pages ask
 * for them here so a path lives in one place. Everything is a plain URL: nothing is imported into the
 * bundle, and each image is only fetched when an element that shows it is rendered.
 */
const TEXTURES = "/Textures";

/** The app's mark (90×90). */
export const LOGO_URL = `${TEXTURES}/icons/Logo.png`;

/** Picture of an osu! user without an avatar. */
export const GUEST_AVATAR_URL = `${TEXTURES}/online/avatar-guest.png`;

const RULESET_ICONS: Record<string, string> = {
  osu: "RulesetOsu",
  taiko: "RulesetTaiko",
  fruits: "RulesetCatch",
  catch: "RulesetCatch",
  mania: "RulesetMania",
};

/** Icon of a ruleset (`osu`, `taiko`, `fruits`, `mania`), or `undefined` for a name that is not one. */
export function rulesetIconUrl(ruleset: string | null | undefined): string | undefined {
  const file = ruleset ? RULESET_ICONS[ruleset.toLowerCase()] : undefined;
  return file ? `${TEXTURES}/icons/${file}.png` : undefined;
}

/** The "unknown country" flag (`__.png`), used for any missing, malformed or unlisted code. */
export const UNKNOWN_FLAG_URL = `${TEXTURES}/flags/__.png`;

/** Flag of a country from its ISO 3166-1 code (`FR`); anything else gives the unknown flag. */
export function flagUrl(countryCode: string | null | undefined): string {
  return countryCode && /^[A-Za-z]{2}$/.test(countryCode) ? `${TEXTURES}/flags/${countryCode.toUpperCase()}.png` : UNKNOWN_FLAG_URL;
}

/** Number of `menu-background-N.webp` files (the jpg originals are kept out of the build, in `assets-src/menu/`). */
export const MENU_BACKGROUNDS = 8;

/** One of the menu backgrounds, 1-based (wraps). Small webp, meant to be darkened and blurred. */
export function menuBackgroundUrl(index: number): string {
  const n = ((Math.round(index) - 1) % MENU_BACKGROUNDS + MENU_BACKGROUNDS) % MENU_BACKGROUNDS + 1;
  return `${TEXTURES}/menu/menu-background-${n}.webp`;
}
