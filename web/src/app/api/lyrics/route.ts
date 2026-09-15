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
  const strict = sp.get("strict") !== "0";
  const checkArtist = sp.get("artistCheck") === "1"; // Latin-script titles: refuse a different artist's song with the same name
  let cands: { title: string; artist?: string }[] = [];
  try { cands = JSON.parse(sp.get("cands") ?? "[]"); } catch { cands = []; }
  if (!cands.length && sp.get("title")) cands = [{ title: sp.get("title")!.trim(), artist: sp.get("artist")?.trim() || undefined }];
  cands = cands.filter((c) => c && typeof c.title === "string" && c.title.trim()).slice(0, 8);
  if (!cands.length) return NextResponse.json(null, { status: 400 });

  const headers = { "User-Agent": UA };
  // Rank: synced first, then the recording whose length is closest to ours. A file from a different
  // edit of the song (longer intro, extended outro) is what makes timing drift, so duration dominates.
  const rank = (h: Hit) => (h.syncedLyrics ? 0 : 1000) + (duration ? Math.min(Math.abs((h.duration ?? 0) - duration), 600) : 0);
  let best: Hit | null = null;
  let wantedArtist: string | undefined;
  const consider = (hits: Hit[]) => {
    for (const h of hits) {
      if (!h || (!h.syncedLyrics && !h.plainLyrics)) continue;
      if (!artistMatches(h, wantedArtist)) continue;
      // more than 25 s off is almost certainly a different recording; keep it only as a last resort
      if (strict && duration && h.duration && Math.abs(h.duration - duration) > 25) continue;
      if (!best || rank(h) < rank(best)) best = h;
    }
  };
  const norm = (x: string) => (x || "").toLowerCase().replace(/\(.*?\)|\[.*?\]/g, "").replace(/[^a-z0-9\u00c0-\u024f\u0400-\u04ff\u4e00-\u9fff]+/g, " ").trim();
  const artistMatches = (h: Hit, wanted?: string) => {
    if (!checkArtist || !wanted) return true;
    const a = norm(h.artistName ?? ""), w = norm(wanted);
    if (!a || !w) return true;
    if (a.includes(w) || w.includes(a)) return true;
    const aw = a.split(" "), ww = w.split(" ");
    return ww.some((t) => t.length > 2 && aw.includes(t));
  };
  const goodEnough = () => !!best && !!(best as Hit).syncedLyrics && (!duration || Math.abs(((best as Hit).duration ?? 0) - duration) <= 2);

  try {
    for (const c of cands) {
      wantedArtist = c.artist;
      if (c.artist) {
        const q = new URLSearchParams({ track_name: c.title, artist_name: c.artist });
        if (duration) q.set("duration", String(duration));
        const r = await fetch(`${LRCLIB}/get?${q}`, { headers, next: { revalidate: 86400 } });
        if (r.ok) consider([await r.json()]);
      }
      // always look at the search results too: several uploads of the same song exist, and the
      // closest-length one is the one whose timestamps fit this recording
      const s = await fetch(`${LRCLIB}/search?${new URLSearchParams({ q: c.artist ? `${c.artist} ${c.title}` : c.title })}`, { headers, next: { revalidate: 86400 } });
      if (s.ok) consider(await s.json());
      if (goodEnough()) return withCache(NextResponse.json(best));
      if (c.artist && strict) {
        const s2 = await fetch(`${LRCLIB}/search?${new URLSearchParams({ track_name: c.title })}`, { headers, next: { revalidate: 86400 } });
        if (s2.ok) consider(await s2.json());
        if (goodEnough()) return withCache(NextResponse.json(best));
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
