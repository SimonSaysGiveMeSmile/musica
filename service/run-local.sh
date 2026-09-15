#!/bin/sh
# Runs the audio service on this machine and exposes it through a Cloudflare quick tunnel.
# Temporary alternative to Railway: the tunnel URL changes every run, so after it prints,
# update NEXT_PUBLIC_AUDIO_API in Vercel and redeploy:
#   cd ../web && vercel env rm NEXT_PUBLIC_AUDIO_API production --yes; printf "<url>" | vercel env add NEXT_PUBLIC_AUDIO_API production; vercel --prod --yes
set -e
cd "$(dirname "$0")"
[ -d .venv ] || (python3 -m venv .venv && . .venv/bin/activate && pip install -q -r requirements.txt)
. .venv/bin/activate
export ALLOWED_ORIGINS="${ALLOWED_ORIGINS:-http://localhost:3000,http://localhost:3100,https://musica-mauve-pi.vercel.app,https://www.musicaa.site,https://musicaa.site}"
uvicorn main:app --port 8787 &
UV=$!
trap 'kill $UV' EXIT
sleep 2
cloudflared tunnel --url http://localhost:8787 --no-autoupdate 2>&1 | grep --line-buffered -o "https://[a-z0-9-]*\.trycloudflare\.com" | head -1 &
wait $UV
