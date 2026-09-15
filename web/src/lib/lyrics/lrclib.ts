import { detectLang, titleVariants, type SongLang } from "./lang";

export interface LyricLine { time: number; text: string }
export interface Lyrics { synced: boolean; lines: LyricLine[]; source: "lrclib" | "user"; lang?: SongLang }

export function parseLrc(lrc: string): LyricLine[] {
  const lines: LyricLine[] = [];
  for (const raw of lrc.split(/\r?\n/)) {
    const m = raw.match(/^\s*\[(\d+):(\d+(?:\.\d+)?)\]\s?(.*)$/);
    if (!m) continue;
    lines.push({ time: parseInt(m[1]) * 60 + parseFloat(m[2]), text: m[3].trim() });
  }
  return lines.sort((a, b) => a.time - b.time);
}

export function plainToLines(plain: string): LyricLine[] {
  return plain.split(/\r?\n/).map((text) => ({ time: -1, text: text.trim() }));
}

/** English titles use the original direct lookup (one title/artist query). Other languages try
 *  every plausible reading of the title ("Artist - Title", "Title - Artist", 《Title》, script splits). */
export async function fetchLyrics(title: string, artist: string | undefined, duration: number, channel?: string, rawTitle?: string): Promise<Lyrics | null> {
  const titleLang = detectLang(rawTitle ?? title);
  const english = titleLang === "en" || titleLang === "und";
  const cands = english ? [{ title, artist }] : titleVariants(rawTitle ?? title, artist, channel);
  if (!english && !cands.some((c) => c.title === title && (c.artist ?? "") === (artist ?? ""))) cands.unshift({ title, artist });
  const q = new URLSearchParams({ duration: String(Math.round(duration)), cands: JSON.stringify(cands.slice(0, 8)), strict: english ? "0" : "1" });
  const res = await fetch(`/api/lyrics?${q}`);
  if (!res.ok) return null;
  const data = await res.json();
  if (!data) return null;
  const text: string = data.syncedLyrics || data.plainLyrics || "";
  const lang = detectLang(text.replace(/\[[^\]]*\]/g, " "));
  if (data.syncedLyrics) return { synced: true, lines: parseLrc(data.syncedLyrics), source: "lrclib", lang };
  if (data.plainLyrics) return { synced: false, lines: plainToLines(data.plainLyrics), source: "lrclib", lang };
  return null;
}

export function userLyrics(text: string): Lyrics {
  return { synced: false, lines: plainToLines(text), source: "user", lang: detectLang(text) };
}
