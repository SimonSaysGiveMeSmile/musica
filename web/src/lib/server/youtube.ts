/** YouTube search and link metadata without an audio server. Search goes through YouTube's own web
 *  search endpoint (InnerTube), and links resolve through the public oEmbed endpoints. Neither needs
 *  a key, and neither is blocked from cloud IPs the way audio extraction is. */

export interface YtHit { id: string; title: string; channel: string; duration: number; thumbnail?: string }
export interface YtResolved extends YtHit { artist?: string; source: "youtube" | "spotify" }

export const MAX_DURATION = 12 * 60;
export const YT_ID = /^[A-Za-z0-9_-]{11}$/;
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
// Spotify only puts the artist in its page metadata for link-preview fetchers, not browsers.
const PREVIEW_UA = "Musica/1.0 (+https://www.musicaa.site)";
const CLIENT = { clientName: "WEB", clientVersion: "2.20251101.00.00", hl: "en", gl: "US" };

type Json = Record<string, unknown>;
const text = (v: unknown): string => {
  const o = v as { simpleText?: string; runs?: { text: string }[] } | undefined;
  return o?.simpleText ?? o?.runs?.map((r) => r.text).join("") ?? "";
};
const seconds = (s: string) => s.split(":").reduce((acc, p) => acc * 60 + Number(p || 0), 0);

/** Every `videoRenderer` in an InnerTube response, wherever the layout nests it. */
function videoRenderers(node: unknown, out: Json[] = []): Json[] {
  if (Array.isArray(node)) { for (const n of node) videoRenderers(n, out); return out; }
  if (node && typeof node === "object") {
    for (const [k, v] of Object.entries(node as Json)) {
      if (k === "videoRenderer" && v && typeof v === "object") out.push(v as Json);
      else videoRenderers(v, out);
    }
  }
  return out;
}

function toHit(v: Json): YtHit | null {
  const id = v.videoId as string | undefined;
  const len = text(v.lengthText);
  if (!id || !YT_ID.test(id) || !len) return null; // no length: a live stream or a premiere
  const thumbs = (v.thumbnail as { thumbnails?: { url: string }[] } | undefined)?.thumbnails ?? [];
  return {
    id,
    title: text(v.title),
    channel: text(v.ownerText) || text(v.longBylineText),
    duration: seconds(len),
    thumbnail: thumbs.at(-1)?.url?.split("?")[0] || `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
  };
}

export async function ytSearch(q: string, n = 10): Promise<YtHit[]> {
  const r = await fetch("https://www.youtube.com/youtubei/v1/search?prettyPrint=false", {
    method: "POST",
    headers: { "Content-Type": "application/json", "User-Agent": UA, "Accept-Language": "en-US,en;q=0.9" },
    // params "EgIQAQ==" = filter: videos only
    body: JSON.stringify({ context: { client: CLIENT }, query: q, params: "EgIQAQ==" }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!r.ok) throw new Error(`YouTube search failed (${r.status})`);
  const seen = new Set<string>();
  const hits: YtHit[] = [];
  for (const v of videoRenderers(await r.json())) {
    const h = toHit(v);
    if (!h || h.duration > MAX_DURATION || seen.has(h.id)) continue;
    seen.add(h.id); hits.push(h);
    if (hits.length >= n) break;
  }
  return hits;
}

export function youtubeId(url: string): string | null {
  const s = url.trim();
  if (YT_ID.test(s)) return s;
  try {
    const u = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`);
    if (/(^|\.)youtu\.be$/i.test(u.hostname)) { const id = u.pathname.slice(1, 12); return YT_ID.test(id) ? id : null; }
    if (!/(^|\.)youtube\.com$/i.test(u.hostname)) return null;
    const v = u.searchParams.get("v");
    if (v && YT_ID.test(v)) return v;
    const m = u.pathname.match(/^\/(?:shorts|embed|live|v)\/([A-Za-z0-9_-]{11})/);
    return m ? m[1] : null;
  } catch { return null; }
}

async function oembed(url: string): Promise<{ title?: string; author_name?: string; thumbnail_url?: string } | null> {
  const r = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(8_000) });
  return r.ok ? r.json() : null;
}

export async function resolveYouTube(id: string): Promise<YtResolved | null> {
  const meta = await oembed(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(`https://www.youtube.com/watch?v=${id}`)}`);
  if (!meta) return null;
  // oEmbed has no duration. Searching by the id almost always returns the video itself first.
  const hit = (await ytSearch(id, 5).catch(() => [])).find((h) => h.id === id);
  return {
    id, title: meta.title ?? hit?.title ?? "", channel: meta.author_name ?? hit?.channel ?? "",
    duration: hit?.duration ?? 0, thumbnail: hit?.thumbnail ?? meta.thumbnail_url, source: "youtube",
  };
}

export const SPOTIFY_TRACK = /(?:open\.spotify\.com\/(?:intl-[\w-]+\/)?track\/|spotify:track:)([A-Za-z0-9]+)/;

/** A Spotify track has no audio we can use: read its title and artist, then match it on YouTube. */
export async function resolveSpotify(trackId: string): Promise<YtResolved | null> {
  const page = `https://open.spotify.com/track/${trackId}`;
  const meta = await oembed(`https://open.spotify.com/oembed?url=${encodeURIComponent(page)}`);
  if (!meta) return null;
  let artist = "";
  try {
    const html = await (await fetch(page, { headers: { "User-Agent": PREVIEW_UA }, signal: AbortSignal.timeout(8_000) })).text();
    const og = html.match(/<meta property="og:description" content="([^"]*)"/);
    if (og) artist = og[1].split(/\s*[·•]\s*/)[0].trim();
  } catch { /* the title alone usually still finds it */ }
  const title = meta.title ?? "";
  const best = (await ytSearch(`${artist} ${title}`.trim(), 3))[0];
  if (!best) return null;
  return { ...best, title: title || best.title, artist: artist || undefined, thumbnail: meta.thumbnail_url ?? best.thumbnail, source: "spotify" };
}
