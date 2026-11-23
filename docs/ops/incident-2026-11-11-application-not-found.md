# Incident (OPEN): backend returns "Application not found"

> ## ROOT CAUSE CONFIRMED 2026-11-12: the Railway free trial expired
>
> Read from the Railway dashboard (project `musica-audio`, environment `production`):
>
> - Header badge: **"Trial expired"**
> - Service card: **"musica-audio — Service is offline"**
> - Service panel: **"Limited Access — Your trial has expired. Please select a plan to continue
>   using Railway. Upgrade your plan to continue deploying."**
> - **"There is no active deployment for this service."** Every history entry is **REMOVED**
>   (`railway up`, "1 month ago via CLI").
> - Region **EU West**, 1 replica. `musica-audio-volume` is **still attached** (the audio cache survives).
>
> Chain: trial expired → Railway removed the running deployment → nothing bound to the hostname →
> edge 404 `Application not found` with `x-railway-fallback: true`. Nothing was deleted, and no code,
> config or key was at fault.
>
> **Fix:** pick a paid plan (a billing decision only the account owner can make), then redeploy.
> Redeploying keeps the hostname, so no Vercel rebuild should be needed. Confirm the domain is still
> attached by probing `/health` after the redeploy: still getting the edge 404 means the domain was
> detached and must be re-added under Settings → Networking.

**Detected:** 2026-11-11, by the user asking whether search still worked — not by any monitor.
**Last known healthy:** 2026-10-31 (`/health` → `{"ok":true,"yt_dlp":"2026.08.19"}`).
**Outage start:** unknown. The window is up to 12 days.
**Status:** unresolved — the cause lives in the Railway dashboard, which is not reachable from this machine.

## Symptom

Every route on `https://musica-audio-production.up.railway.app` — `/health`, `/search`, `/resolve`,
`/audio/{id}`, `/`, `/docs`, `/openapi.json` — returns:

```
HTTP/2 404
server: railway-hikari
x-railway-fallback: true
x-railway-edge: sjc1
content-length: 101

{"status":"error","code":404,"message":"Application not found","request_id":"..."}
```

## What is proven

- **Nothing is bound to the hostname at Railway's edge.** An invented hostname
  (`definitely-no-such-app-musica-zz99.up.railway.app`) returns a byte-identical response including
  `x-railway-fallback: true`, while `railway.com` and an unrelated live Railway app return 200 from the
  same `sjc1` edge with no fallback header.
- **Not a crash loop.** 12 consecutive `/health` probes over ~52s (and 15/15 across all routes) were 404
  at 0.23–0.94s with zero 502s, 503s or timeouts. A failing container gives intermittent 502/503.
- **Not the redeploy window.** Nothing deployed: GitHub `pushed_at` 2026-09-19, `HEAD == origin/main == cc969d7`,
  newest Vercel production deployment 41 days old.
- **Not DNS or TLS.** The host resolves (A record, 60s TTL) and the TLS handshake validates against
  `CN=*.up.railway.app`, Let's Encrypt, verify code 0.
- **Not the frontend, and not a key.** The deployed bundle still inlines the correct host (chunk
  `1pr30aj7nxvf3.js`), `sw.js` is `musica-v13`, the site serves 200. See "The keys question" below.
- **User-visible symptom confirmed in a real browser:** searching "radiohead creep" shows the in-page
  error *"Search is unavailable right now. Check the audio service is running."*; the console shows the
  fetch blocked by CORS with `net::ERR_FAILED`, because an edge 404 carries no `Access-Control-Allow-Origin`.

## The keys question — settled: there are none

There is no API key anywhere in this system, so no key can be misconfigured:

- `/search` runs **yt-dlp** (`service/main.py:93`, `ytsearch{n}:{q}`) — scraping, not the YouTube Data API.
- `/resolve`'s Spotify path uses Spotify's **public, token-free oEmbed** endpoint (`main.py:174-176`).
- Lyrics come from **lrclib.net** with only a `User-Agent` (`web/src/app/api/lyrics/route.ts:3-4,21`) — and
  that path is healthy: `https://www.musicaa.site/api/lyrics` → 200 with real lyrics.
- The service reads 8 env vars, **none a credential**. Vercel holds exactly one variable,
  `NEXT_PUBLIC_AUDIO_API`, which is a public URL inlined into the browser bundle by design — and it is correct.

Decisively: an edge 404 means **no Python executed**. An auth or config fault inside the app would surface
as a 5xx with the app's own `{"detail":...}` body, not as Railway's "Application not found".

## What is NOT known

The edge emits this identical response for at least five states, and they are externally
indistinguishable: hostname never registered · service stopped · service deleted · project or environment
deleted · public domain detached or renamed. A **billing suspension presents as one of these.**

Also unknown until someone logs in: the latest deployment id and status, whether the `/data` volume is
still attached or full, the live env values, and the workspace's plan and spend.

**The CLI logout is not the cause and not a signal.** `railway whoami` was already `Unauthorized` on
2026-10-31 while the service was serving 200s. An expired token and a suspended account both present as
`Unauthorized`.

## Next step (requires the user — cannot be done from Claude Code)

Open the Railway dashboard in a normal logged-in browser:
<https://railway.com/project/e66785d1-73eb-4653-a18a-b46b4d2acd94>

Check in this order and report back:

1. a billing / usage / suspension banner on the **Simon's Projects** workspace?
2. does project `musica-audio` still exist?
3. latest deployment status — **Active, Removed, Crashed or Stopped**?
4. Settings → Networking → Public Networking: is `musica-audio-production.up.railway.app` still attached,
   or is a **different** hostname listed?
5. deployment logs and the project activity feed between 2026-10-31 and now.

Cheaper parallel check needing no login: grant Gmail read scope and search
`from:railway.app OR subject:Railway newer_than:60d` — a suspension notice would settle it. (Attempted
during diagnosis; failed with `Insufficient scope`.)

## Repair, once the dashboard says which state it is in

| Finding | Fix | Needs a Vercel rebuild? |
|---|---|---|
| Deployment stopped/removed, domain still attached | Redeploy the last **SUCCESS** build (`b6d11779`) from the dashboard — reuses the build, so it does **not** pull a newer unpinned yt-dlp | **No** — hostname unchanged |
| Billing / usage limit | Settle billing, then redeploy. **Read the usage page first** — the endpoint is unauthenticated with a bypassable rate limit, so confirm the spend is legitimate | No |
| Alive on a different hostname | Reattach the original domain if offered; otherwise `vercel env rm/add` + `vercel --prod --yes` | **Yes**, if the host changes |
| Project/service genuinely gone | Rehost from `service/Dockerfile` (new Railway project, Fly, Render, Cloud Run). Re-set all 8 env vars; the cache volume is lost so songs re-download once | **Yes** |

Avoid the local-uvicorn-plus-tunnel route except as an hours-long bridge — that is precisely the
architecture that caused [the September outage](incident-2026-09-26-search-outage.md), and a quick
tunnel's rotating hostname forces a full Vercel rebuild every time it changes.

## The real defect

**Two silent outages, two unrelated causes, same root failure: nothing is watching.** September was five
days from a rotating tunnel hostname; this one is up to twelve days from the container vanishing. Open
risk #4 in [`README.md`](README.md) has been open since 2026-10-31.

`/health` is an ideal probe — unauthenticated, rate-limit-exempt (`main.py:45-46`), and it returns the
running yt-dlp version, so extractor changes are visible too. One external check every few minutes,
alerting on two consecutive failures, to somewhere actually read.

## Update 2026-11-22: back up, but YouTube now blocks Railway

- The Hobby subscription had lapsed after a payment-method failure (last charge 2026-10-15; the 2026-10-31 bill was $0) and the workspace fell back to Trial. The user re-subscribed to Hobby, then `railway up --ci` deployed yt-dlp 2026.10.26.
- `/health` returns 200 and `/search` works, with CORS for https://www.musicaa.site.
- `/audio` works only for the 18 songs already cached in `/data/cache` (56 MB). Every new song returns 502 "Sign in to confirm you're not a bot". All player_clients were tested over `railway ssh` (default, web_safari, mweb, tv, tv_embedded, web_embedded, ios, android_vr, web_creator) and every one fails, so the block is on the IP address.
- The same video extracts fine from the Mac's home connection. Vercel functions are blocked the same way, while search works from there (probe project `musica-yt-probe`).
- Fix paths: set `YTDLP_PROXY` to a residential proxy (no code change), set `YTDLP_COOKIES` (fragile and puts a Google account at risk), or serve audio from the Mac.
