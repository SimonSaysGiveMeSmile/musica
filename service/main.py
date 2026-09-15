"""Musica audio service: YouTube search / link resolution / audio extraction.

Small, stateless (apart from a disk LRU cache), no tokens. Runs anywhere a
container runs (Railway, Fly.io, a VPS). See README.md.
"""
from __future__ import annotations

import asyncio
import os
import re
import time
from collections import defaultdict, deque
from pathlib import Path
from typing import Any

import httpx
import yt_dlp
from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse

CACHE_DIR = Path(os.environ.get("CACHE_DIR", "/tmp/musica-cache"))
CACHE_DIR.mkdir(parents=True, exist_ok=True)
CACHE_MAX_BYTES = int(os.environ.get("CACHE_MAX_MB", "2048")) * 1024 * 1024
ALLOWED_ORIGINS = [o.strip() for o in os.environ.get("ALLOWED_ORIGINS", "http://localhost:3000").split(",") if o.strip()]
RATE_PER_MIN = int(os.environ.get("RATE_PER_MIN", "30"))
MAX_DURATION = int(os.environ.get("MAX_DURATION_SEC", "900"))
COOKIES_FILE = os.environ.get("YTDLP_COOKIES")  # optional path to a Netscape cookie file
PROXY = os.environ.get("YTDLP_PROXY")            # optional proxy url

app = FastAPI(title="Musica audio service", docs_url=None, redoc_url=None)
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_origin_regex=r"https://.*\.vercel\.app" if os.environ.get("ALLOW_VERCEL_PREVIEWS", "1") == "1" else None,
    allow_methods=["GET"],
    allow_headers=["*"],
    expose_headers=["Content-Length", "Content-Range", "Accept-Ranges"],
)

# ------------------------------------------------------------------ rate limit
_hits: dict[str, deque[float]] = defaultdict(deque)


@app.middleware("http")
async def rate_limit(request: Request, call_next):
    if request.url.path == "/health":
        return await call_next(request)
    ip = request.headers.get("x-forwarded-for", request.client.host if request.client else "?").split(",")[0].strip()
    now = time.time()
    q = _hits[ip]
    while q and now - q[0] > 60:
        q.popleft()
    if len(q) >= RATE_PER_MIN:
        return JSONResponse({"detail": "Too many requests, slow down"}, status_code=429)
    q.append(now)
    return await call_next(request)


# ------------------------------------------------------------------ yt-dlp
YT_ID = re.compile(r"^[A-Za-z0-9_-]{11}$")


def base_opts(**extra: Any) -> dict[str, Any]:
    opts: dict[str, Any] = {
        "quiet": True,
        "no_warnings": True,
        "noplaylist": True,
        "skip_download": True,
        "socket_timeout": 20,
        "extractor_args": {"youtube": {"player_client": ["android", "web"]}},
    }
    if COOKIES_FILE:
        opts["cookiefile"] = COOKIES_FILE
    if PROXY:
        opts["proxy"] = PROXY
    opts.update(extra)
    return opts


def _thumb(entry: dict[str, Any]) -> str | None:
    if entry.get("thumbnail"):
        return entry["thumbnail"]
    thumbs = entry.get("thumbnails") or []
    if thumbs:
        return thumbs[-1].get("url")
    vid = entry.get("id")
    return f"https://i.ytimg.com/vi/{vid}/hqdefault.jpg" if vid else None


def _search_sync(q: str, n: int) -> list[dict[str, Any]]:
    with yt_dlp.YoutubeDL(base_opts(extract_flat="in_playlist")) as ydl:
        info = ydl.extract_info(f"ytsearch{n}:{q}", download=False)
    out = []
    for e in info.get("entries") or []:
        if not e or e.get("duration") and e["duration"] > MAX_DURATION:
            continue
        out.append({
            "id": e.get("id"),
            "title": e.get("title"),
            "channel": e.get("channel") or e.get("uploader") or "",
            "duration": int(e.get("duration") or 0),
            "thumbnail": _thumb(e),
        })
    return out


def _info_sync(url: str) -> dict[str, Any]:
    with yt_dlp.YoutubeDL(base_opts()) as ydl:
        info = ydl.extract_info(url, download=False, process=False)
    if info.get("_type") == "playlist":
        raise HTTPException(400, "Playlists are not supported, paste a single video link")
    return info


def _download_sync(video_id: str, target: Path) -> None:
    tmp_base = CACHE_DIR / f"{video_id}.tmp"
    opts = base_opts(
        skip_download=False,
        format="bestaudio[ext=m4a]/bestaudio/best",
        outtmpl=str(tmp_base) + ".%(ext)s",
        postprocessors=[{"key": "FFmpegExtractAudio", "preferredcodec": "m4a", "preferredquality": "128"}],
        postprocessor_args={"ffmpegextractaudio": ["-ac", "2", "-ar", "44100"]},
        match_filter=yt_dlp.utils.match_filter_func(f"duration <= {MAX_DURATION}"),
    )
    with yt_dlp.YoutubeDL(opts) as ydl:
        ydl.download([f"https://www.youtube.com/watch?v={video_id}"])
    produced = tmp_base.with_suffix(".m4a")
    if not produced.exists():
        cands = list(CACHE_DIR.glob(f"{video_id}.tmp.*"))
        if not cands:
            raise HTTPException(502, "Audio extraction failed")
        produced = cands[0]
    produced.rename(target)
    for leftover in CACHE_DIR.glob(f"{video_id}.tmp*"):
        leftover.unlink(missing_ok=True)


def _evict() -> None:
    files = sorted(CACHE_DIR.glob("*.m4a"), key=lambda p: p.stat().st_atime)
    total = sum(p.stat().st_size for p in files)
    while total > CACHE_MAX_BYTES and files:
        p = files.pop(0)
        total -= p.stat().st_size
        p.unlink(missing_ok=True)


_locks: dict[str, asyncio.Lock] = defaultdict(asyncio.Lock)


# ------------------------------------------------------------------ routes
@app.get("/health")
async def health():
    return {"ok": True, "yt_dlp": yt_dlp.version.__version__}


@app.get("/search")
async def search(q: str = Query(min_length=1, max_length=200), n: int = Query(10, ge=1, le=15)):
    try:
        results = await asyncio.to_thread(_search_sync, q, n)
    except yt_dlp.utils.DownloadError as e:
        raise HTTPException(502, f"Search failed: {e}") from e
    return {"results": results}


SPOTIFY_RE = re.compile(r"(?:open\.spotify\.com/(?:intl-\w+/)?track/|spotify:track:)([A-Za-z0-9]+)")


@app.get("/resolve")
async def resolve(url: str = Query(min_length=5, max_length=500)):
    url = url.strip()
    m = SPOTIFY_RE.search(url)
    if m:
        # Spotify oEmbed is public and token-free: gives "Title" and the artist in the iframe title
        async with httpx.AsyncClient(timeout=10) as client:
            r = await client.get("https://open.spotify.com/oembed", params={"url": f"https://open.spotify.com/track/{m.group(1)}"})
        if r.status_code != 200:
            raise HTTPException(404, "Spotify track not found")
        data = r.json()
        title = data.get("title", "")
        # oEmbed html title is like "Spotify Embed: Creep"; the page <title> has "Creep - song by Radiohead"
        artist = ""
        try:
            async with httpx.AsyncClient(timeout=10, follow_redirects=True, headers={"User-Agent": "Mozilla/5.0"}) as client:
                page = await client.get(f"https://open.spotify.com/track/{m.group(1)}")
            og = re.search(r'<meta property="og:description" content="([^"]*)"', page.text)
            if og:
                artist = re.split(r"\s*[·•]\s*", og.group(1))[0].strip()
        except Exception:
            pass
        q = f"{artist} {title}".strip()
        results = await asyncio.to_thread(_search_sync, q, 3)
        if not results:
            raise HTTPException(404, "No audio match found for this Spotify track")
        best = results[0]
        return {"id": best["id"], "title": title or best["title"], "artist": artist or None,
                "duration": best["duration"], "thumbnail": data.get("thumbnail_url") or best["thumbnail"], "source": "spotify"}

    if not re.search(r"(youtube\.com|youtu\.be)", url):
        raise HTTPException(400, "Paste a YouTube or Spotify link")
    try:
        info = await asyncio.to_thread(_info_sync, url)
    except yt_dlp.utils.DownloadError as e:
        raise HTTPException(404, f"Could not read that link: {e}") from e
    dur = int(info.get("duration") or 0)
    if dur > MAX_DURATION:
        raise HTTPException(400, f"Track is longer than {MAX_DURATION // 60} minutes")
    artist = info.get("artist") or info.get("creator") or None
    return {"id": info["id"], "title": info.get("track") or info.get("title"), "artist": artist,
            "duration": dur, "thumbnail": _thumb(info), "source": "youtube", "channel": info.get("channel") or info.get("uploader")}


@app.get("/audio/{video_id}")
async def audio(video_id: str, request: Request):
    if not YT_ID.match(video_id):
        raise HTTPException(400, "Bad video id")
    target = CACHE_DIR / f"{video_id}.m4a"
    if not target.exists():
        async with _locks[video_id]:
            if not target.exists():
                try:
                    await asyncio.to_thread(_download_sync, video_id, target)
                except yt_dlp.utils.DownloadError as e:
                    raise HTTPException(502, f"Could not fetch audio: {e}") from e
                await asyncio.to_thread(_evict)
    os.utime(target, None)
    return FileResponse(target, media_type="audio/mp4", headers={"Cache-Control": "public, max-age=604800"})
