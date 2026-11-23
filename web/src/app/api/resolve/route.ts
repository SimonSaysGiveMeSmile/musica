import { NextRequest, NextResponse } from "next/server";
import { MAX_DURATION, SPOTIFY_TRACK, resolveSpotify, resolveYouTube, youtubeId } from "@/lib/server/youtube";

/** GET /api/resolve?url= : a YouTube or Spotify link → the YouTube video and its title, artist, cover. */
export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get("url")?.trim() ?? "";
  if (url.length < 5 || url.length > 500) return NextResponse.json({ detail: "Paste a YouTube or Spotify link" }, { status: 400 });
  try {
    const sp = url.match(SPOTIFY_TRACK);
    const id = sp ? null : youtubeId(url);
    if (!sp && !id) return NextResponse.json({ detail: "Paste a YouTube or Spotify link" }, { status: 400 });
    const r = sp ? await resolveSpotify(sp[1]) : await resolveYouTube(id!);
    if (!r) return NextResponse.json({ detail: sp ? "Spotify track not found" : "Could not read that link" }, { status: 404 });
    if (r.duration > MAX_DURATION) return NextResponse.json({ detail: `Track is longer than ${MAX_DURATION / 60} minutes` }, { status: 400 });
    return NextResponse.json(r, { headers: { "Cache-Control": "public, s-maxage=86400" } });
  } catch (e) {
    return NextResponse.json({ detail: (e as Error).message }, { status: 502 });
  }
}
