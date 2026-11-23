# The audio service

`service/` — a single FastAPI app (`main.py`, 227 lines) wrapping `yt-dlp` + `ffmpeg`.
No database, no tokens, no auth.

Deployed on **Railway** since 2026-10-02 at **https://musica-audio-production.up.railway.app**
(stable hostname — this replaced a Cloudflare quick tunnel whose hostname rotated; see
[`incident-2026-09-26-search-outage.md`](incident-2026-09-26-search-outage.md)).

## Routes

Verified from `service/main.py` on 2026-10-31. Four GET routes, nothing else — `/` returns 404,
and that is normal.

| Route | Purpose | Notes |
|---|---|---|
| `GET /health` | liveness | returns `{"ok":true,"yt_dlp":"<version>"}` — the version is useful |
| `GET /search?q=` | YouTube search | 10 results: `{id,title,channel,duration,thumbnail}` |
| `GET /resolve?url=` | YouTube/Spotify link → metadata | `{id,title,artist,duration,thumbnail}` |
| `GET /audio/{video_id}` | AAC 128k `audio/mp4`, disk-cached | range-capable via Starlette's `FileResponse` |

### Triaging a 404 — three different failures wear the same status code

1. **A bare `404` at `/` with a `{"detail":...}` body is the app.** Only four routes exist; `/` is not one.
   This is normal.
2. **`{"status":"error","code":404,"message":"Application not found","request_id":"..."}` plus the header
   `x-railway-fallback: true` is Railway's EDGE** — nothing is bound to the hostname, so no Python ran.
3. The same edge 404 appears for ~30s after a redeploy while the container restarts. **Do not assume that
   explanation** — check whether anything actually deployed (`git log -1`, `vercel ls`) before believing it.

**The control probe that tells case 2 from case 3** — invent a hostname that cannot exist and compare:

```sh
curl -s -D- https://musica-audio-production.up.railway.app/health | grep -iE '^HTTP|x-railway'
curl -s -D- https://definitely-no-such-app-zz99.up.railway.app/health | grep -iE '^HTTP|x-railway'
```

Byte-identical responses (same status, same `x-railway-fallback: true`, same 101-byte body) mean your
hostname is **externally indistinguishable from one that was never registered**. A live Railway host
returns 200 and carries **no** `x-railway-fallback` header. Also probe `/health` ~10 times over a minute:
uniformly 404 is a stopped/unbound service, while intermittent 502/503 is a crash-looping container.

Used on 2026-11-11 this distinguished a real outage from the restart window in about thirty seconds; see
[`incident-2026-11-11-application-not-found.md`](incident-2026-11-11-application-not-found.md).

## Environment variables

All eight that `main.py` actually reads, with real defaults. `service/README.md` documents only
four of these — this table is the complete one.

| Variable | Default | Effect |
|---|---|---|
| `CACHE_DIR` | `/tmp/musica-cache` | where `<id>.m4a` files land. **The Dockerfile overrides this to `/data/cache`** |
| `CACHE_MAX_MB` | `2048` (2 GiB) | LRU eviction budget |
| `ALLOWED_ORIGINS` | `http://localhost:3000` | comma-separated CORS allowlist |
| `ALLOW_VERCEL_PREVIEWS` | `1` (on) | when on, **any** `https://*.vercel.app` origin is allowed via regex |
| `RATE_PER_MIN` | `30` | sliding window per "IP" — see the caveat below |
| `MAX_DURATION_SEC` | `900` | silently rejects anything over 15 minutes |
| `YTDLP_COOKIES` | unset | optional path to a Netscape cookie file |
| `YTDLP_PROXY` | unset | optional proxy URL |

Production values live only on the Railway service (not in the repo). Recorded from memory, **unverified
as of 2026-10-31** because the CLI is logged out:
`ALLOWED_ORIGINS=http://localhost:3000,http://localhost:3100,https://musica-mauve-pi.vercel.app,https://www.musicaa.site,https://musicaa.site`

Note `README.md:43` tells an operator to set `ALLOWED_ORIGINS` to a *single* origin. Doing that would
break both `www.musicaa.site` and the apex. Set all the hosts.

## Caching and eviction

- One object per video: `CACHE_DIR/<video_id>.m4a`. In the container that is `/data/cache/`, on the
  mounted volume, so it survives restarts.
- `os.utime(target)` on every hit (`main.py:226`) is what makes the LRU atime ordering work. It also
  changes the ETag and `Last-Modified` on every request, so conditional requests always miss. Harmless
  but it means ETag revalidation buys nothing here.
- `_evict()` (`main.py:139-146`) deletes least-recently-touched `*.m4a` until the total fits
  `CACHE_MAX_MB`. Three real limitations:
  1. it runs **only after a successful download** (`main.py:225`), never on a timer — so it reclaims
     nothing while downloads are failing;
  2. it counts **only `*.m4a`**, ignoring `<id>.tmp*` partials, which are cleaned only on a later
     attempt at the same id (`main.py:135`) — abandoned partials accumulate uncounted;
  3. **the volume's actual size is unverified.** If the volume is smaller than `CACHE_MAX_MB`, the disk
     hits `ENOSPC` before eviction ever triggers. Check the volume size before trusting the 2 GiB default.

## Security posture — read this before exposing anything else

- **No authentication.** Verified 2026-10-31: `curl -r 0-99` on `/audio/<id>` with no `Origin` header
  returns 206. CORS is browser-side decoration; it stops a web page, not a script.
- **The rate limit is bypassable.** `main.py:49`:
  `ip = request.headers.get("x-forwarded-for", ...).split(",")[0].strip()` — the key comes from a
  client-supplied header, so rotating `X-Forwarded-For` defeats it. A spoofed-XFF `/search` returned 200.
  The counter is a per-process dict: per-replica, and reset by every restart.
- **`ALLOW_VERCEL_PREVIEWS` defaults to on**, so `https://*.vercel.app` is CORS-allowed by default
  (`main.py:35`). Undocumented in both READMEs. Whether it is on in production is unverified.

If this service ever gets abused, these three are the reason, in that order.

## Build and deploy config

- `service/railway.toml` sets only: `builder = "DOCKERFILE"`, `dockerfilePath = "Dockerfile"`,
  `healthcheckPath = "/health"`, `restartPolicyType = "ON_FAILURE"`. **No volume declaration** — the
  `/data` mount is dashboard-only state that no repo file records. If the volume is ever lost, the
  container still boots and silently caches to ephemeral disk.
- `service/Dockerfile`: `python:3.12-slim` + `ffmpeg`, `ENV CACHE_DIR=/data/cache PORT=8787`,
  `CMD uvicorn main:app --host 0.0.0.0 --port ${PORT}`. No `startCommand` in `railway.toml`, so the
  deploy depends entirely on this CMD and on Railway injecting `PORT` (8787 is only the fallback).
- `requirements.txt` pins `fastapi==0.118.0` etc. but **`yt-dlp>=2025.9.5` floats**. Running build has
  2026.08.19. Every rebuild can pull a newer yt-dlp — desirable for YouTube extraction, bad for
  reproducibility.
- **Runtime drift:** the image is Python 3.12 while `service/.venv` is Python 3.14. Local runs do not
  reproduce the deployed runtime.

## Railway coordinates

Recorded 2026-10-02. **Every value below is memory-sourced and unverified** — `railway status` returns
`Unauthorized` as of 2026-10-31.

| | |
|---|---|
| Workspace | Simon's Projects |
| Project | `musica-audio` — `e66785d1-73eb-4653-a18a-b46b4d2acd94` |
| Service | `musica-audio` — `3feaec5a-5e5e-428f-8c28-5740a2feb209` |
| Environment | `production` — `19766507-5a78-49b7-bcaf-1e4b6601fc85` |
| Volume | `musica-audio-volume` at `/data` |
| Domain | `musica-audio-production.up.railway.app` |
| Deployments | `08e347a9` (first), `b6d11779` (after volume + vars) — both SUCCESS |

Also unknown and worth checking once logged in: **whether a GitHub source is connected to the service.**
`README.md:40-44` describes deploying from GitHub; memory says the CLI is linked and to use
`railway up --ci`. If a GitHub source *is* connected, any future push rebuilds the image and pulls a
newer unpinned yt-dlp.
