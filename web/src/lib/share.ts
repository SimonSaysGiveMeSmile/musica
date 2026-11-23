"use client";

/** Files shared to Musica from another app arrive as a POST to /share (manifest share_target). The
 *  service worker parks the file in this cache and redirects to /?shared=1. Keep both in sync with sw.js. */
export const SHARE_CACHE = "musica-share";
export const SHARE_KEY = "/__shared-audio";

export async function takeSharedFile(): Promise<File | null> {
  if (typeof window === "undefined" || !("caches" in window)) return null;
  const url = new URL(window.location.href);
  if (!url.searchParams.has("shared")) return null;
  url.searchParams.delete("shared");
  window.history.replaceState(null, "", url.pathname + url.search + url.hash);
  const cache = await caches.open(SHARE_CACHE);
  const res = await cache.match(SHARE_KEY);
  if (!res) return null;
  await cache.delete(SHARE_KEY);
  const name = decodeURIComponent(res.headers.get("X-File-Name") ?? "Shared audio");
  return new File([await res.blob()], name, { type: res.headers.get("Content-Type") ?? "" });
}
