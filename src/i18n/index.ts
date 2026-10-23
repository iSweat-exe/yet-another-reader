import { useCallback } from "react";
import { useReaderStore } from "../lib/store";
import { en, type Messages } from "./en";
import { fr } from "./fr";

export type MessageKey = keyof Messages;
export type Lang = "en" | "fr";
export type Vars = Record<string, string | number>;

const dictionaries: Record<Lang, Messages> = { en, fr };

/** `auto` follows the system language; anything but French falls back to English. */
export function resolveLanguage(setting: string | undefined): Lang {
  if (setting === "fr" || setting === "en") return setting;
  return typeof navigator !== "undefined" && navigator.language.toLowerCase().startsWith("fr") ? "fr" : "en";
}

/** Looks a key up and replaces `{name}` placeholders. */
export function translate(lang: Lang, key: MessageKey, vars?: Vars): string {
  const text = dictionaries[lang][key] ?? en[key];
  return vars ? text.replace(/\{(\w+)\}/g, (match, name: string) => (name in vars ? String(vars[name]) : match)) : text;
}

export type Translate = (key: MessageKey, vars?: Vars) => string;

/** Translator bound to the language chosen in the settings. */
export function useT(): Translate {
  const language = useReaderStore((s) => s.settings?.language);
  const lang = resolveLanguage(language);
  return useCallback((key, vars) => translate(lang, key, vars), [lang]);
}

export function useLang(): Lang {
  return resolveLanguage(useReaderStore((s) => s.settings?.language));
}
