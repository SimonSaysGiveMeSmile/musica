"use client";
import { en, type Key } from "./en";
import { zh } from "./zh";
import { de } from "./de";
import { fr } from "./fr";
import { es } from "./es";
import { az } from "./az";
import { ru } from "./ru";
import { usePrefs } from "@/lib/store/prefs";

export type Lang = "en" | "zh" | "de" | "fr" | "es" | "az" | "ru";
export const LANGS: { id: Lang; label: string; native: string }[] = [
  { id: "en", label: "English", native: "English" },
  { id: "zh", label: "Chinese", native: "中文" },
  { id: "de", label: "German", native: "Deutsch" },
  { id: "fr", label: "French", native: "Français" },
  { id: "es", label: "Spanish", native: "Español" },
  { id: "az", label: "Azerbaijani", native: "Azərbaycanca" },
  { id: "ru", label: "Russian", native: "Русский" },
];

const DICTS: Record<Lang, Record<Key, string>> = { en, zh, de, fr, es, az, ru };
const HTML_LANG: Record<Lang, string> = { en: "en", zh: "zh-Hans", de: "de", fr: "fr", es: "es", az: "az", ru: "ru" };

export type Vars = Record<string, string | number>;

export function detectLang(): Lang {
  if (typeof navigator === "undefined") return "en";
  // Inside WeChat's in-app browser, default to Chinese regardless of the phone's language.
  if (/MicroMessenger/i.test(navigator.userAgent)) return "zh";
  for (const raw of navigator.languages ?? [navigator.language]) {
    const l = raw.toLowerCase();
    if (l.startsWith("zh")) return "zh";
    if (l.startsWith("de")) return "de";
    if (l.startsWith("fr")) return "fr";
    if (l.startsWith("es")) return "es";
    if (l.startsWith("az")) return "az";
    if (l.startsWith("ru")) return "ru";
    if (l.startsWith("en")) return "en";
  }
  return "en";
}

export function translate(lang: Lang, key: Key, vars?: Vars): string {
  let s = DICTS[lang][key] ?? en[key] ?? key;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, String(v));
  return s;
}

export function resolveLang(pref: Lang | "auto" | undefined): Lang {
  return pref && pref !== "auto" ? pref : detectLang();
}

export function applyLang(lang: Lang) {
  if (typeof document !== "undefined") document.documentElement.lang = HTML_LANG[lang];
}

/** The translator hook. Server snapshot is English; the client re-renders in the chosen language after hydration. */
export function useT() {
  const prefs = usePrefs();
  const lang = resolveLang(prefs.language);
  const t = (key: Key, vars?: Vars) => translate(lang, key, vars);
  return { t, lang };
}
export type { Key };
