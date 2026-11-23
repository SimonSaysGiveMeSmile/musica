# Musica operations

Written 2026-10-31, updated 2026-11-11. Everything here was verified by probe on one of those dates
unless a line says otherwise.

> **\u26a0 THE BACKEND IS DOWN as of 2026-11-11** \u2014 every route returns Railway's edge 404. Search, link-paste
> ingest and playback of `yt:` songs are dead; the site itself still serves. Start at
> [`incident-2026-11-11-application-not-found.md`](incident-2026-11-11-application-not-found.md). Where a value could **not** be verified, it says so and names its only source —
do not promote those to fact without re-checking.

> **This folder supersedes `README.md:9`**, which still says the audio service "currently runs
> on the development Mac behind a Cloudflare quick tunnel". That has been false since
> 2026-10-02. The service runs on Railway. See [`audio-service.md`](audio-service.md).

## Contents

| File | What it covers |
|---|---|
| [`audio-service.md`](audio-service.md) | The FastAPI yt-dlp service: routes, all 8 env vars, caching, limits, security posture, Railway coordinates |
| [`deploying.md`](deploying.md) | How to deploy web and service, verify afterwards, and roll back |
| [`gotchas.md`](gotchas.md) | The non-obvious facts that cost hours to rediscover |
| [`incident-2026-11-11-application-not-found.md`](incident-2026-11-11-application-not-found.md) | **OPEN** — the backend is returning edge 404s; diagnosis, what is proven, and the repair matrix |
| [`incident-2026-09-26-search-outage.md`](incident-2026-09-26-search-outage.md) | Five days of silent search downtime: cause, fix, and what is still unmonitored |
| [`../../tools/e2e/`](../../tools/e2e/) | Playwright drivers for end-to-end checks (rescued from a temp dir 2026-10-31) |

## Topology as of 2026-10-31

```
browser ──> www.musicaa.site            Vercel, project "musica" in team scope hireal-projects
                 │                      (static export + service worker, PWA)
                 │ NEXT_PUBLIC_AUDIO_API is inlined at BUILD time
                 ▼
            musica-audio-production.up.railway.app     Railway, Docker from service/Dockerfile
                 │                      FastAPI + yt-dlp 2026.08.19 + ffmpeg
                 ▼
            /data volume                audio cache (<video id>.m4a, LRU by atime)
```

Public web hosts: `www.musicaa.site` (200), `musicaa.site` (308 → www), `musica-mauve-pi.vercel.app` (200).
**`musica.vercel.app` is NOT this project** — it serves a stranger's site. Do not send an operator there.

DNS: `musicaa.site` nameservers are Namecheap (`dns1/dns2.registrar-servers.com`); `www` is a CNAME
into Vercel DNS (`a0d462915e71d208.vercel-dns-017.com`).

## Health check (run this first, always)

```sh
# 1. is the backend alive?
curl -s https://musica-audio-production.up.railway.app/health
# expect: {"ok":true,"yt_dlp":"2026.08.19"}

# 2. does search work, with correct CORS?
curl -s -D- -o /dev/null -H 'Origin: https://www.musicaa.site' \
  'https://musica-audio-production.up.railway.app/search?q=creep+radiohead' | \
  grep -iE '^HTTP|access-control-allow-origin'
# expect: HTTP/2 200  +  access-control-allow-origin: https://www.musicaa.site

# 3. what backend does the DEPLOYED site actually call?  (the bundle is the source of truth)
curl -s https://www.musicaa.site/ -o /tmp/h.html
for f in $(grep -oE '/_next/static/immutable/chunks/[A-Za-z0-9._-]+\.js' /tmp/h.html | sort -u); do
  curl -s "https://www.musicaa.site$f" | grep -oE 'https://[a-z0-9.-]+\.(up\.railway\.app|trycloudflare\.com)'
done | sort -u
# expect exactly: https://musica-audio-production.up.railway.app

# 4. service worker version
curl -s https://www.musicaa.site/sw.js | grep VERSION      # expect musica-v13 (as of 2026-10-31)
```

**Checking the process is not checking the service.** The 2026-09 outage lasted five days
precisely because `pgrep` showed a healthy tunnel process whose hostname had stopped resolving.
Probe the URL.

## Verified on 2026-10-31

- Homepage 200, 18,263 bytes, `x-vercel-cache: HIT`, `age: 2566290` (~29.7 days — the HTML has not
  been regenerated in a month; nothing is wrong, but any change needs a redeploy to appear).
- Backend `/health` → 200 in ~0.44s, `{"ok":true,"yt_dlp":"2026.08.19"}`.
- `/search?q=creep+radiohead` with the production Origin → 200, 10 results, first is `XFkzRNyygfk`
  "Radiohead - Creep", `access-control-allow-origin` echoes the origin, `vary: Origin`.
- Same search from `https://evil.example.com` → 200 with **no** allow-origin header; its `OPTIONS`
  preflight is rejected with 400. The allowlist is genuinely enforced for browsers.
- `/audio/XFkzRNyygfk` range request → 206, `audio/mp4`, `accept-ranges: bytes`,
  `content-range: bytes 0-1024/3826697`, `cache-control: public, max-age=604800`.
- Deployed bundle references the Railway host in exactly one chunk (`1pr30aj7nxvf3.js`); no
  `trycloudflare.com` and no `localhost:8787` anywhere in the 9 chunks.
- Nothing from the old stopgap is running: no uvicorn, nothing on `:8787`, no cloudflared pointed at
  8787, and both dead quick-tunnel hostnames fail to resolve at DNS level. Nothing to clean up.
- Git: working tree clean, `HEAD == origin/main == cc969d7` (2026-09-19), 0 unpushed, no
  `.github/` workflows. **Nothing in this repo auto-deploys.**

## NOT verified — and why

| Claim | Status |
|---|---|
| Railway project id `e66785d1-73eb-4653-a18a-b46b4d2acd94` | memory-sourced only |
| Railway service id `3feaec5a-5e5e-428f-8c28-5740a2feb209` | memory-sourced only |
| Volume `musica-audio-volume` mounted at `/data` | memory-sourced only |
| `ALLOWED_ORIGINS` value on the service | memory-sourced only |
| Cutover date 2026-10-02, and whether anything redeployed since | memory-sourced only |

All five are unverifiable right now because **the Railway CLI is logged out again**:
`railway whoami` and `railway status` both print `Unauthorized. Please run `railway login` again.`
Fixing that is step 1 of [`deploying.md`](deploying.md) — and it cannot be done from inside
Claude Code (no TTY). The public service works regardless; this blocks only the control plane.

Separately, `railway variable list --kv` is refused by Claude Code's own permission classifier
(`[Credential Materialization]`) even when logged in, so reading the live env needs explicit approval.

## The open risks nobody has sized

Ranked by what would actually hurt:

1. **The service is wide open.** A ranged `GET /audio` with no `Origin` returns 206. CORS protects
   browsers only; any script can make the container run yt-dlp + ffmpeg, write to the volume, and
   serve multi-MB egress. There is no auth of any kind.
2. **The rate limit does not limit.** `service/main.py:49` keys the 30/min sliding window on the
   *first element of the client-supplied* `X-Forwarded-For`, so rotating that header bypasses it
   entirely. It is also an in-process dict: per-replica, reset on restart. `docs/PRD.md:230`
   presents this as a protection it is not.
3. **Cost exposure is unmeasured.** Railway plan, volume size, and spend are all behind the
   logged-out CLI; Vercel usage was never queried. Combined with 1 and 2 — an unauthenticated,
   effectively unthrottled endpoint doing downloads and egress on a metered container — this is the
   project's main financial risk.
4. **Nothing is monitoring anything.** No uptime check, alert, or cron exists. The stable Railway URL
   removes the *cause* of the 2026-09 outage but not the blind spot. Until something is added, the
   health check above is a manual ritual.
5. **`yt-dlp` is unpinned** (`yt-dlp>=2025.9.5`). A YouTube change breaks extraction, and the fix is a
   Railway rebuild — gated behind the login in 1. Conversely, *any* rebuild silently upgrades yt-dlp,
   so redeploying for an unrelated reason can change extraction behaviour with no code change.
6. **Preview and development Vercel targets have no `NEXT_PUBLIC_AUDIO_API`** (both report "No
   Environment Variables found"), so every preview build inlines the `http://localhost:8787`
   fallback from `web/src/lib/api.ts:1` and its audio features cannot work.
