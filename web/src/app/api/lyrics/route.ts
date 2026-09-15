import { NextRequest, NextResponse } from "next/server";

const LRCLIB = "https://lrclib.net/api";
const UA = "Musica/1.0 (https://github.com/musica-app)";

export async function GET(req: NextRequest) {
  const title = req.nextUrl.searchParams.get("title")?.trim() ?? "";
  const artist = req.nextUrl.searchParams.get("artist")?.trim() ?? "";
  const duration = Number(req.nextUrl.searchParams.get("duration") ?? 0);
  if (!title) return NextResponse.json(null, { status: 400 });

  const headers = { "User-Agent": UA };
  try {
    if (artist) {
      const q = new URLSearchParams({ track_name: title, artist_name: artist });
      if (duration) q.set("duration", String(duration));
      const r = await fetch(`${LRCLIB}/get?${q}`, { headers, next: { revalidate: 86400 } });
      if (r.ok) return withCache(NextResponse.json(await r.json()));
    }
    const s = await fetch(`${LRCLIB}/search?${new URLSearchParams({ q: artist ? `${artist} ${title}` : title })}`, { headers, next: { revalidate: 86400 } });
    if (!s.ok) return NextResponse.json(null);
    const list: { duration: number; syncedLyrics?: string; plainLyrics?: string }[] = await s.json();
    if (!list.length) return withCache(NextResponse.json(null));
    // prefer synced + closest duration
    list.sort((a, b) => {
      const sa = (a.syncedLyrics ? 0 : 1000) + (duration ? Math.abs(a.duration - duration) : 0);
      const sb = (b.syncedLyrics ? 0 : 1000) + (duration ? Math.abs(b.duration - duration) : 0);
      return sa - sb;
    });
    return withCache(NextResponse.json(list[0]));
  } catch {
    return NextResponse.json(null, { status: 502 });
  }
}

function withCache(res: NextResponse) {
  res.headers.set("Cache-Control", "public, s-maxage=86400, stale-while-revalidate=604800");
  return res;
}
