import { NextRequest, NextResponse } from "next/server";

const LRCLIB = "https://lrclib.net/api";
const UA = "Musica/1.0 (https://github.com/SimonSaysGiveMeSmile/musica)";
type Hit = { duration: number; syncedLyrics?: string; plainLyrics?: string; trackName?: string; artistName?: string };

/** GET /api/lyrics?duration=&cands=[{title,artist?},…]
 *  Tries each candidate (any language) with an exact lookup then a search; prefers synced lyrics
 *  whose duration matches. Legacy title/artist params still work. */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const duration = Number(sp.get("duration") ?? 0);
  let cands: { title: string; artist?: string }[] = [];
  try { cands = JSON.parse(sp.get("cands") ?? "[]"); } catch { cands = []; }
  if (!cands.length && sp.get("title")) cands = [{ title: sp.get("title")!.trim(), artist: sp.get("artist")?.trim() || undefined }];
  cands = cands.filter((c) => c && typeof c.title === "string" && c.title.trim()).slice(0, 8);
  if (!cands.length) return NextResponse.json(null, { status: 400 });

  const headers = { "User-Agent": UA };
  const rank = (h: Hit) => (h.syncedLyrics ? 0 : 1000) + (duration ? Math.min(Math.abs((h.duration ?? 0) - duration), 600) : 0);
  let best: Hit | null = null;
  const consider = (hits: Hit[]) => {
    for (const h of hits) {
      if (!h || (!h.syncedLyrics && !h.plainLyrics)) continue;
      // a duration more than 25 s off is almost certainly a different recording
      if (duration && h.duration && Math.abs(h.duration - duration) > 25) continue;
      if (!best || rank(h) < rank(best)) best = h;
    }
  };

  try {
    for (const c of cands) {
      if (c.artist) {
        const q = new URLSearchParams({ track_name: c.title, artist_name: c.artist });
        if (duration) q.set("duration", String(duration));
        const r = await fetch(`${LRCLIB}/get?${q}`, { headers, next: { revalidate: 86400 } });
        if (r.ok) { consider([await r.json()]); if (best && (best as Hit).syncedLyrics) return withCache(NextResponse.json(best)); }
      }
      const s = await fetch(`${LRCLIB}/search?${new URLSearchParams({ q: c.artist ? `${c.artist} ${c.title}` : c.title })}`, { headers, next: { revalidate: 86400 } });
      if (s.ok) { consider(await s.json()); if (best && (best as Hit).syncedLyrics) return withCache(NextResponse.json(best)); }
      if (c.artist) {
        // title-only search catches databases that spell the artist differently (transliteration, CJK vs latin)
        const s2 = await fetch(`${LRCLIB}/search?${new URLSearchParams({ track_name: c.title })}`, { headers, next: { revalidate: 86400 } });
        if (s2.ok) { consider(await s2.json()); if (best && (best as Hit).syncedLyrics) return withCache(NextResponse.json(best)); }
      }
    }
    return withCache(NextResponse.json(best));
  } catch {
    return NextResponse.json(null, { status: 502 });
  }
}

function withCache(res: NextResponse) {
  res.headers.set("Cache-Control", "public, s-maxage=86400, stale-while-revalidate=604800");
  return res;
}
