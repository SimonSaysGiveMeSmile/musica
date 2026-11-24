import { NextResponse, type NextRequest } from "next/server";

// The browser only ever asks this site for /audio/<id>. The audio service's
// real address (AUDIO_API, server-only) and its shared secret
// (MUSICA_SERVICE_KEY) are added here on the server, so neither reaches the
// client bundle and the service refuses anyone who calls it directly.

const YT_ID = /^[A-Za-z0-9_-]{11}$/;

export function proxy(request: NextRequest) {
  const id = request.nextUrl.pathname.slice("/audio/".length);
  const base = (process.env.AUDIO_API ?? (process.env.NODE_ENV === "development" ? "http://localhost:8787" : ""))
    .split(",")[0]
    ?.trim()
    .replace(/\/$/, "");
  const key = process.env.MUSICA_SERVICE_KEY ?? (process.env.NODE_ENV === "development" ? "dev" : "");
  if (!YT_ID.test(id) || !base || !key) {
    return NextResponse.json({ detail: "No audio service" }, { status: 404 });
  }

  const headers = new Headers(request.headers);
  headers.set("x-musica-key", key);
  headers.delete("cookie");
  return NextResponse.rewrite(new URL(`${base}/audio/${id}`), { request: { headers } });
}

export const config = {
  matcher: ["/audio/:id"],
};
