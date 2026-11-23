# Incident: song search silently down for five days

**Window:** 2026-09-26 → 2026-10-01 (discovered 2026-10-01)
**Impact:** song search and audio playback returned nothing on `www.musicaa.site`. The site loaded;
only the backend-dependent features failed.
**Root cause:** the production bundle pointed at a Cloudflare **quick** tunnel hostname that had stopped
resolving, while the tunnel process stayed alive.
**Resolution:** migrated the service to Railway (stable hostname), 2026-10-02.

## Timeline

| Date | Event |
|---|---|
| 2026-09-14 | Service deployed as "runs on the dev Mac behind a Cloudflare quick tunnel", documented as temporary |
| 2026-09-26 | Tunnel `bernard-bill-promoting-transparency.trycloudflare.com` brought up; production env var pointed at it; verified working |
| 2026-09-26 → 10-01 | Hostname stops resolving. No alert. Service log records **no external requests** after the initial verification hits |
| 2026-10-01 | Reported as "is search working again?". Diagnosed: local uvicorn healthy on `:8787`, tunnel hostname dead, `cloudflared` process still alive |
| 2026-10-01 | Stopgap: new tunnel `catalogs-mason-mozilla-mariah…`, env var swapped, redeployed |
| 2026-10-02 | Permanent fix: Railway deploy, `/data` volume, `ALLOWED_ORIGINS`, env var repointed, tunnel killed |

## Why it stayed invisible for five days

Four things lined up, and all four are worth remembering independently:

1. **The process outlived the hostname.** `cloudflared` kept running — `pgrep` showed a healthy tunnel
   the whole time. Nothing in the process table indicated failure. *Only probing the URL reveals this
   class of failure.*
2. **The failure was downstream of the page.** The site itself is a static Vercel deploy and kept
   serving perfectly. Only features that call the backend broke, so casual loading looked fine.
3. **`NEXT_PUBLIC_AUDIO_API` is a build-time inline.** Even after the tunnel came back under a new name,
   the deployed bundle still held the old hostname — so "restart the tunnel" was never sufficient; it
   always required an env swap **plus** a redeploy.
4. **Nothing was watching.** No uptime check, no alert. The only signal was a human noticing.

## The second-order trap

`service/run-local.sh` pipes cloudflared's output through `grep -o … | head -1`. Once `head` exits, the
new hostname of any **reconnect** is never logged. So when the tunnel rotated, the current URL was not
merely stale — it was unrecoverable from the log, and the tunnel had to be restarted deliberately
(`cloudflared --metrics 127.0.0.1:20977`, full output to a file) just to learn its address.

Its `trap 'kill $UV' EXIT` also kills only uvicorn, so a stale `cloudflared` can survive the script.

## What the fix changed

| Before | After |
|---|---|
| Hostname rotates on every tunnel restart | Stable `musica-audio-production.up.railway.app` |
| Depends on the dev Mac being awake | Container, `restartPolicyType = ON_FAILURE` |
| Cache on ephemeral local disk | `/data` volume |
| Health invisible | `healthcheckPath = /health` enforced by the platform |

## What is still unfixed

- **No monitoring.** The stable URL removes this outage's *cause*, but not the blind spot. A Railway
  outage, a yt-dlp breakage, or an exhausted volume would still be discovered by a human noticing.
  The manual check is in [`README.md`](README.md); nothing automates it.
- **`yt-dlp` is unpinned**, so extraction can break from the outside at any time, and the fix path
  (a Railway rebuild) is gated behind a login that cannot be done from Claude Code.
- **Preview deployments still point at `localhost:8787`** (the variable exists for Production only), so
  a preview URL exhibits exactly the symptom of this incident, permanently.

## Lesson for the runbook

> Verify the thing users touch, from where they touch it. For this app that means grepping the
> **deployed bundle** for the backend host and curling that host with the production `Origin` — not
> checking a process, not reading an env var, not trusting that a restart propagated.
