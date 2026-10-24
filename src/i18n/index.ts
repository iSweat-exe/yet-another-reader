import { useCallback, useEffect, useSyncExternalStore } from "react";
import { useReaderStore } from "../lib/state/store";
import { en, type Messages } from "./en";
import { fr } from "./fr";
import { type Lang, isLang, langOfLocale } from "./languages";

export type MessageKey = keyof Messages;
export type { Lang } from "./languages";
export type Vars = Record<string, string | number>;

/** English and French ship with the app; the others are fetched on first use. */
const dictionaries: Partial<Record<Lang, Messages>> = { en, fr };

const loaders: Partial<Record<Lang, () => Promise<Messages>>> = {
  es: () => import("./es").then((m) => m.es),
  de: () => import("./de").then((m) => m.de),
  pt: () => import("./pt").then((m) => m.pt),
  ru: () => import("./ru").then((m) => m.ru),
  zh: () => import("./zh").then((m) => m.zh),
  ko: () => import("./ko").then((m) => m.ko),
  ja: () => import("./ja").then((m) => m.ja),
};

const listeners = new Set<() => void>();
let loaded = 0;
const pending = new Set<Lang>();

/** Fetches a language's strings (once); the interface shows English until they arrive. */
export function loadLanguage(lang: Lang): void {
  if (dictionaries[lang] || pending.has(lang)) return;
  const load = loaders[lang];
  if (!load) return;
  pending.add(lang);
  void load()
    .then((messages) => {
      dictionaries[lang] = messages;
      loaded += 1;
      listeners.forEach((l) => l());
    })
    .finally(() => pending.delete(lang));
}

/** Re-renders whoever translates when a language has just arrived. */
function useLoadedLanguages(): number {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => loaded,
  );
}

/** `auto` follows the system language (the first of the browser's languages we are translated into); the fallback is English. */
export function resolveLanguage(setting: string | undefined): Lang {
  if (isLang(setting)) return setting;
  if (typeof navigator === "undefined") return "en";
  for (const tag of navigator.languages?.length ? navigator.languages : [navigator.language]) {
    const lang = langOfLocale(tag);
    if (lang) return lang;
  }
  return "en";
}

/** Looks a key up and replaces `{name}` placeholders. A language that is not loaded yet, or a key it lacks, shows English. */
export function translate(lang: Lang, key: MessageKey, vars?: Vars): string {
  const text = dictionaries[lang]?.[key] ?? en[key];
  return vars ? text.replace(/\{(\w+)\}/g, (match, name: string) => (name in vars ? String(vars[name]) : match)) : text;
}

export type Translate = (key: MessageKey, vars?: Vars) => string;

/** Translator bound to the language chosen in the settings. */
export function useT(): Translate {
  const language = useReaderStore((s) => s.settings?.language);
  const lang = resolveLanguage(language);
  const ready = useLoadedLanguages();
  useEffect(() => loadLanguage(lang), [lang]);
  // `ready` changes when a dictionary arrives, which gives the translator a new identity and re-renders its users.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useCallback((key, vars) => translate(lang, key, vars), [lang, ready]);
}

export function useLang(): Lang {
  return resolveLanguage(useReaderStore((s) => s.settings?.language));
}
