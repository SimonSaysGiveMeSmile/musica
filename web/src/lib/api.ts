/** Audio comes from this site's /audio/<id>, which src/proxy.ts forwards to the YouTube audio service
 *  (service/) on the server. The service's address and key never reach the browser. When no service is
 *  configured the route answers 404 and the song asks for a recording instead. */
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
export function audioUrls(id: string): string[] { return [`/audio/${encodeURIComponent(id)}`]; }

export function detectLink(input: string): "youtube" | "spotify" | null {
  const s = input.trim();
  if (/^(https?:\/\/)?(www\.|m\.|music\.)?(youtube\.com|youtu\.be)\//i.test(s)) return "youtube";
  if (/^(https?:\/\/)?open\.spotify\.com\//i.test(s) || /^spotify:track:/i.test(s)) return "spotify";
  return null;
}

/** Split "Artist - Title" / "Title (Official Video)" style YouTube titles. */
export function splitTitle(title: string, channel?: string): { title: string; artist?: string } {
  const t = title.replace(/\s*[\(\[][^\)\]]*(official|video|audio|lyrics?|hd|4k|visualizer|live|remaster(ed)?)[^\)\]]*[\)\]]/gi, "")
    .replace(/\s+(official\s+)?(m\/?v|music\s+video|video|audio)\s*$/i, "").trim();
  const bare = (a: string) => a.replace(/\s*[\(\[][^\)\]]*[\)\]]\s*/g, " ").trim(); // "IU(아이유)" -> "IU"
  const m = t.match(/^(.+?)\s+[-–—_]\s+(.+)$/);
  if (m) return { artist: bare(m[1]) || m[1].trim(), title: m[2].trim() };
  // CJK quotes: YOASOBI「アイドル」, 周杰倫《晴天》
  const cj = t.match(/^(.*?)\s*[《「『【]([^》」』】]+)[》」』】]/);
  if (cj) return { artist: bare(cj[1]) || channel?.replace(/\s*-\s*topic$/i, "").trim() || undefined, title: cj[2].trim() };
  // K-pop / J-pop: "BTS (방탄소년단) 'Dynamite' Official MV" from a label's channel
  const q = t.match(/^(.+?)\s+['‘"“]([^'’"”]+)['’"”](?=\s|$)/);
  if (q) {
    const artist = bare(q[1]);
    if (artist) return { artist, title: q[2].trim() };
  }
  const artist = channel?.replace(/\s*-\s*topic$/i, "").replace(/VEVO$/i, "").trim();
  return { title: t, artist: artist || undefined };
}
