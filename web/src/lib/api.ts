export const AUDIO_API = (process.env.NEXT_PUBLIC_AUDIO_API ?? "http://localhost:8787").replace(/\/$/, "");

export interface SearchResult { id: string; title: string; channel: string; duration: number; thumbnail?: string }
export interface Resolved { id: string; title: string; artist?: string; duration: number; thumbnail?: string; source: "youtube" | "spotify" }

export async function searchSongs(q: string, signal?: AbortSignal): Promise<SearchResult[]> {
  const r = await fetch(`${AUDIO_API}/search?q=${encodeURIComponent(q)}`, { signal });
  if (!r.ok) throw new Error(`Search failed (${r.status})`);
  return (await r.json()).results;
}
export async function resolveUrl(url: string): Promise<Resolved> {
  const r = await fetch(`${AUDIO_API}/resolve?url=${encodeURIComponent(url)}`);
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).detail ?? `Could not resolve link (${r.status})`);
  return r.json();
}
export function audioUrl(id: string) { return `${AUDIO_API}/audio/${encodeURIComponent(id)}`; }

export function detectLink(input: string): "youtube" | "spotify" | null {
  const s = input.trim();
  if (/^(https?:\/\/)?(www\.|m\.|music\.)?(youtube\.com|youtu\.be)\//i.test(s)) return "youtube";
  if (/^(https?:\/\/)?open\.spotify\.com\//i.test(s) || /^spotify:track:/i.test(s)) return "spotify";
  return null;
}

/** Split "Artist - Title" / "Title (Official Video)" style YouTube titles. */
export function splitTitle(title: string, channel?: string): { title: string; artist?: string } {
  const t = title.replace(/\s*[\(\[][^\)\]]*(official|video|audio|lyrics?|hd|4k|visualizer|live|remaster(ed)?)[^\)\]]*[\)\]]/gi, "").trim();
  const m = t.match(/^(.+?)\s+[-–—]\s+(.+)$/);
  if (m) return { artist: m[1].trim(), title: m[2].trim() };
  const artist = channel?.replace(/\s*-\s*topic$/i, "").replace(/VEVO$/i, "").trim();
  return { title: t, artist: artist || undefined };
}
