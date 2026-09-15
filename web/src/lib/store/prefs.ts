"use client";
import { useSyncExternalStore } from "react";
import type { Instrument } from "@/lib/theory/coverage";

export type Theme = "system" | "light" | "dark";
export type Accent = "gold" | "copper" | "rose" | "sage" | "sky" | "silver" | "orchid" | "gliver" | "sunrise";
export const ACCENTS: { id: Accent; label: string; swatch: string }[] = [
  { id: "gold", label: "Gold", swatch: "#c9a45c" },
  { id: "copper", label: "Copper", swatch: "#c97c53" },
  { id: "rose", label: "Rose", swatch: "#d47684" },
  { id: "sage", label: "Sage", swatch: "#93b17b" },
  { id: "sky", label: "Sky", swatch: "#7fabd0" },
  { id: "silver", label: "Silver", swatch: "#bdb8ae" },
  { id: "orchid", label: "Orchid", swatch: "#c084d6" },
  { id: "gliver", label: "Gliver", swatch: "#d6c9a3" },
  { id: "sunrise", label: "Sunrise", swatch: "#f0824f" },
];

export interface Prefs {
  instrument: Instrument;
  known: Record<Instrument, string[]>;
  metronome: boolean;
  installDismissed: boolean;
  theme: Theme;
  accent: Accent;
  language: "auto" | "en" | "zh" | "de" | "fr" | "es" | "az";
}

const KEY = "musica.prefs.v1";
const DEFAULTS: Prefs = {
  instrument: "guitar",
  known: { guitar: ["G", "C", "D", "Em", "Am", "E", "A"], piano: ["C", "F", "G", "Am", "Dm", "Em"], ukulele: ["C", "F", "G", "Am"] },
  metronome: false,
  installDismissed: false,
  theme: "system",
  accent: "gold",
  language: "auto",
};

/** Push theme + accent onto <html>. The inline script in layout.tsx does the same before first paint. */
export function applyTheme(p: Prefs) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  if (p.theme === "system") root.removeAttribute("data-theme"); else root.setAttribute("data-theme", p.theme);
  if (p.accent === "gold") root.removeAttribute("data-accent"); else root.setAttribute("data-accent", p.accent);
  const dark = p.theme === "dark" || (p.theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.querySelectorAll('meta[name="theme-color"]').forEach((m) => { m.setAttribute("content", dark ? "#0b0a09" : "#f5f0e7"); m.removeAttribute("media"); });
}

let cache: Prefs | null = null;
const listeners = new Set<() => void>();

function load(): Prefs {
  if (cache) return cache;
  try {
    const raw = typeof localStorage !== "undefined" ? localStorage.getItem(KEY) : null;
    cache = raw ? { ...DEFAULTS, ...JSON.parse(raw), known: { ...DEFAULTS.known, ...(JSON.parse(raw).known ?? {}) } } : DEFAULTS;
  } catch { cache = DEFAULTS; }
  return cache!;
}

export function getPrefs(): Prefs { return load(); }
export function setPrefs(patch: Partial<Prefs> | ((p: Prefs) => Partial<Prefs>)) {
  const cur = load();
  const next = { ...cur, ...(typeof patch === "function" ? patch(cur) : patch) };
  cache = next;
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch {}
  if (next.theme !== cur.theme || next.accent !== cur.accent) applyTheme(next);
  listeners.forEach((l) => l());
}
function subscribe(l: () => void) { listeners.add(l); return () => { listeners.delete(l); }; }

export function usePrefs(): Prefs {
  return useSyncExternalStore(subscribe, load, () => DEFAULTS);
}

export function toggleKnown(instrument: Instrument, chord: string) {
  setPrefs((p) => {
    const list = p.known[instrument] ?? [];
    const has = list.includes(chord);
    return { known: { ...p.known, [instrument]: has ? list.filter((c) => c !== chord) : [...list, chord] } };
  });
}
