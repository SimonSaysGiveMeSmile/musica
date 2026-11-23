/** Optional YouTube audio services (service/), comma-separated and tried in order, e.g. the home Mac then
 *  Railway. Search and links work without any; when all fail, the song asks for a recording instead.
 *  Unset in production means "no service". */
export const AUDIO_APIS = (process.env.NEXT_PUBLIC_AUDIO_API ?? (process.env.NODE_ENV === "development" ? "http://localhost:8787" : ""))
  .split(",").map((s) => s.trim().replace(/\/$/, "")).filter(Boolean);

export interface SearchResult { id: string; title: string; channel: string; duration: number; thumbnail?: string }
export interface Resolved { id: string; title: string; artist?: string; channel?: string; duration: number; thumbnail?: string; source: "youtube" | "spotify" }

export async function searchSongs(q: string, signal?: AbortSignal): Promise<SearchResult[]> {
  const r = await fetch(`/api/search?q=${encodeURIComponent(q)}`, { signal });
  if (!r.ok) throw new Error(`Search failed (${r.status})`);
  return (await r.json()).results;
}
export async function resolveUrl(url: string): Promise<Resolved> {
  const r = await fetch(`/api/resolve?url=${encodeURIComponent(url)}`);
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).detail ?? `Could not resolve link (${r.status})`);
  return r.json();
}
export function audioUrls(id: string): string[] { return AUDIO_APIS.map((base) => `${base}/audio/${encodeURIComponent(id)}`); }

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
