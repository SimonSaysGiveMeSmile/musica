export interface LyricLine { time: number; text: string }
export interface Lyrics { synced: boolean; lines: LyricLine[]; source: "lrclib" | "user" }

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

export async function fetchLyrics(title: string, artist: string | undefined, duration: number): Promise<Lyrics | null> {
  const q = new URLSearchParams({ title, artist: artist ?? "", duration: String(Math.round(duration)) });
  const res = await fetch(`/api/lyrics?${q}`);
  if (!res.ok) return null;
  const data = await res.json();
  if (!data) return null;
  if (data.syncedLyrics) return { synced: true, lines: parseLrc(data.syncedLyrics), source: "lrclib" };
  if (data.plainLyrics) return { synced: false, lines: plainToLines(data.plainLyrics), source: "lrclib" };
  return null;
}
