# Deploying

Two independent halves. Neither deploys itself — **nothing in this repo auto-deploys**: there is no
`.github/` directory, no workflow files, and (per memory) no Vercel git integration. A `git push`
ships nothing. Verified 2026-10-31.

## Step 0: Railway login (needed for anything on the service side)

As of 2026-10-31 the CLI is logged out — `railway whoami` → `Unauthorized. Please run `railway login` again.`

**`railway login` cannot be run from inside Claude Code.** Both the `!` prefix and `--browserless`
fail with `Cannot login in non-interactive mode`, because neither gets a TTY. It needs a real
terminal:

```sh
osascript -e 'tell application "Terminal" to activate' \
          -e 'tell application "Terminal" to do script "railway login"'
```

That opens a browser handshake; auth then persists for subsequent CLI calls. (Confirmed working
2026-10-02.) Note that even when logged in, `railway variable list --kv` is blocked by Claude Code's
permission classifier as `[Credential Materialization]` and needs explicit approval.

## The web app (Vercel)

```sh
cd web
npx vercel --prod --yes        # ~16s build; production is live within seconds
```

Linked project: `musica`, `projectId prj_XVpRoNxmDufK5A40UknIjwoXtEDC`,
`orgId team_ZrYcixuPjeHaEK1Jb0bfsQCh` → team scope **`hireal-projects`** (not the personal
`simonsaysgivemesmiles-projects` scope, despite the CLI login being `simonsaysgivemesmile`). This link
lives only in the gitignored `web/.vercel/project.json`; this document is the only tracked record of it.

### `NEXT_PUBLIC_AUDIO_API` is inlined at BUILD time

This is the single most important deploy fact. `web/src/lib/api.ts:1`:

```ts
export const AUDIO_API = (process.env.NEXT_PUBLIC_AUDIO_API ?? "http://localhost:8787").replace(/\/$/, "");
```

Changing the variable in Vercel does **nothing** until you rebuild. To change the backend:

```sh
cd web
npx vercel env rm NEXT_PUBLIC_AUDIO_API production --yes
printf '%s' 'https://musica-audio-production.up.railway.app' | npx vercel env add NEXT_PUBLIC_AUDIO_API production
npx vercel --prod --yes
```

Then verify from the deployed bundle (step 3 of the health check in [`README.md`](README.md)) — the
bundle, not the env list, is proof of what users hit.

Current state: the variable exists for **Production only**, type Secret, created ~2026-10-01.
`vercel env ls preview` and `vercel env ls development` both return "No Environment Variables found",
so **preview builds inline `http://localhost:8787`** and their audio features cannot work. Add the
variable to those targets if previews ever need to be usable.

To recover the production value if needed: `vercel env pull` (into a gitignored file) or the dashboard.
It is stored encrypted and `vercel env ls` shows it as Hidden.

### Verifying a web deploy

```sh
curl -s https://www.musicaa.site/sw.js | grep VERSION     # service worker version bumped?
curl -s -o /dev/null -w '%{http_code}\n' https://www.musicaa.site/
```

The newest production deployment is identified by URL (`vercel ls` does not print `dpl_` ids; use
`vercel inspect <url>` for that). Deployment URLs themselves return **302 to `vercel.com/sso-api`** —
deployment protection is on, so only the `www.musicaa.site` alias is readable unauthenticated.

### Rolling back the web app

Not yet exercised on this project — treat as untested. The mechanism is `vercel rollback`, or promoting
a previous deployment from the dashboard; older production deployments do exist (ages 30d/35d/43d as of
2026-10-31). Because `vercel --prod` ships the **working tree** rather than a commit, a rollback is the
only way back to exactly what was live — re-running a build from a given commit does not necessarily
reproduce it.

## The service (Railway)

```sh
cd service
railway up --ci               # builds from Dockerfile per railway.toml
```

The CLI is linked (per memory). `.venv` is gitignored, so `railway up` does not upload the 65 MB
virtualenv — `railway up` respects `.gitignore`.

After any deploy or variable change, expect **~30 seconds of edge 404** (`"Application not found"`)
while the container restarts. That is the restart window, not a failure. Re-check `/health` before
debugging.

```sh
railway status                # deployment id + status
railway logs                  # NOT yet exercised on this project
railway variable list --kv    # needs approval; see Step 0
railway volume list
```

Rolling back the service: entirely behind the logged-out CLI and **never exercised**. Railway keeps
prior deployments and supports redeploying one; confirm the exact command once logged in rather than
trusting this line.

## Local development

```sh
# web — port 3000 on this Mac is taken by an unrelated process (returns 426); use 3100
cd web && pnpm start -p 3100

# service
cd service && ALLOWED_ORIGINS=http://localhost:3000,http://localhost:3100 \
  uvicorn main:app --port 8787
```

`web/.env.local` is **byte-identical to `web/.env.example`** (both 138 bytes, same mtime) — it is the
untouched template, pointing `NEXT_PUBLIC_AUDIO_API` at `http://localhost:8787`. So local dev requires
something actually listening on 8787; nothing is, as of 2026-10-31. Point it at the Railway host
instead if you only want the frontend.

Both `.env.local` and `.env.example` are gitignored (`web/.gitignore:34` → `.env*`), so **a fresh clone
gets no env template at all**. The table in [`audio-service.md`](audio-service.md) plus this section are
the only tracked record of what to set.

## `service/run-local.sh` — do not use

The old stopgap: runs uvicorn on 8787 behind a Cloudflare **quick** tunnel whose hostname rotates. It
caused the 2026-09 outage and is now dead weight that can be run by mistake. Two latent bugs if you
ever do: its `trap 'kill $UV' EXIT` kills only uvicorn, leaving a stale `cloudflared` behind; and it
pipes cloudflared through `head -1`, so a reconnect's new hostname is never logged and cannot be
recovered without restarting the tunnel yourself.
