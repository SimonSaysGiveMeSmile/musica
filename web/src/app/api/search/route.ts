import { NextRequest, NextResponse } from "next/server";
import { ytSearch } from "@/lib/server/youtube";

/** GET /api/search?q=&n= : YouTube search, cached at the CDN for an hour per query. */
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  const n = Math.min(Math.max(Number(req.nextUrl.searchParams.get("n") ?? 10) || 10, 1), 15);
  if (!q || q.length > 200) return NextResponse.json({ detail: "Query must be 1-200 characters" }, { status: 400 });
  try {
    const results = await ytSearch(q, n);
    return NextResponse.json({ results }, { headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" } });
  } catch (e) {
    return NextResponse.json({ detail: (e as Error).message }, { status: 502 });
  }
}
