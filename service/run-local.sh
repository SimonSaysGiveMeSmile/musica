#!/bin/sh
# Runs the audio service on this machine and exposes it through a Cloudflare quick tunnel.
# Temporary alternative to Railway: the tunnel URL changes every run, so after it prints,
# set it as the server-only AUDIO_API in Vercel (and MUSICA_SERVICE_KEY to this run's key), then redeploy.
set -e
cd "$(dirname "$0")"
[ -d .venv ] || (python3 -m venv .venv && . .venv/bin/activate && pip install -q -r requirements.txt)
. .venv/bin/activate
export ALLOWED_ORIGINS="${ALLOWED_ORIGINS:-http://localhost:3000,http://localhost:3100,https://musica-mauve-pi.vercel.app,https://www.musicaa.site,https://musicaa.site}"
export MUSICA_SERVICE_KEY="${MUSICA_SERVICE_KEY:-dev}"  # web dev uses the same default
uvicorn main:app --port 8787 &
UV=$!
trap 'kill $UV' EXIT
sleep 2
cloudflared tunnel --url http://localhost:8787 --no-autoupdate 2>&1 | grep --line-buffered -o "https://[a-z0-9-]*\.trycloudflare\.com" | head -1 &
wait $UV
