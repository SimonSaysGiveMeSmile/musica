"use client";

/** Apple's 30-second song previews, as a fallback audio source. Both the search API and the preview
 *  files send `Access-Control-Allow-Origin: *`, so this runs in the browser with no server. Previews are
 *  Apple's official, publicly offered clips, which is what makes them safe to use here. */

export interface Preview { trackId: number; url: string; title: string; artist: string; artwork?: string }

interface Hit { trackId: number; trackName: string; artistName: string; previewUrl?: string; artworkUrl100?: string; kind?: string }

const norm = (s: string) => s.toLowerCase()
  .replace(/\s*[\(\[][^\)\]]*[\)\]]/g, "") // (Remastered 2009), [Live]
  .replace(/\s+-\s+.*$/, "")               // "Song - Single Version"
  .normalize("NFKD").replace(/[̀-ͯ]/g, "")
  .replace(/[^\p{L}\p{N}]+/gu, " ").trim();

const VARIANT = /\b(acoustic|live|remix|demo|instrumental|karaoke|cover|unplugged|edit|mix|version|session)\b/g;

const same = (a: string, b: string) => { const x = norm(a), y = norm(b); return !!x && !!y && (x === y || x.includes(y) || y.includes(x)); };

/** The preview of this exact song (same title and, when known, the same artist), or null. */
export async function findPreview(title: string, artist?: string): Promise<Preview | null> {
  const term = `${artist ?? ""} ${title}`.trim();
  const r = await fetch(`https://itunes.apple.com/search?media=music&entity=song&limit=15&term=${encodeURIComponent(term)}`, { signal: AbortSignal.timeout(8_000) });
  if (!r.ok) return null;
  const hits: Hit[] = (await r.json()).results ?? [];
  // A live, acoustic or remixed take has different chords and tempo: only take one if the title asks for it.
  const variant = (name: string) => (name.toLowerCase().match(VARIANT) ?? []).filter((w) => !title.toLowerCase().includes(w)).length;
  const h = hits
    .filter((h) => h.previewUrl && h.kind === "song" && same(h.trackName, title) && (!artist || same(h.artistName, artist)))
    .sort((a, b) => variant(a.trackName) - variant(b.trackName))[0];
  if (!h) return null;
  return { trackId: h.trackId, url: h.previewUrl!, title: h.trackName, artist: h.artistName, artwork: h.artworkUrl100?.replace("100x100", "600x600") };
}
