/**
 * The languages of the interface. English is the reference set and French the one the docs are written in; the others
 * are loaded the first time they are chosen (see `index.ts`), so they cost nothing for people who do not use them.
 */
export const LANGUAGES = [
  { code: "en", name: "English" },
  { code: "fr", name: "Français" },
  { code: "es", name: "Español" },
  { code: "de", name: "Deutsch" },
  { code: "pt", name: "Português" },
  { code: "ru", name: "Русский" },
  { code: "zh", name: "简体中文" },
  { code: "ko", name: "한국어" },
  { code: "ja", name: "日本語" },
] as const;

export type Lang = (typeof LANGUAGES)[number]["code"];

export const isLang = (value: unknown): value is Lang => LANGUAGES.some((l) => l.code === value);

/** The language of a locale tag (`pt-BR` → `pt`, `zh-Hans-CN` → `zh`), or `null` when the app is not translated into it. */
export function langOfLocale(tag: string | undefined): Lang | null {
  const code = tag?.toLowerCase().split(/[-_]/)[0];
  return isLang(code) ? code : null;
}
