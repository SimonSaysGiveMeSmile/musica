#!/bin/sh
# Runs the audio service on this Mac and publishes it at a permanent Tailscale Funnel address.
# YouTube blocks audio extraction from cloud servers (Railway, Vercel) but not from a home connection.
# Kept alive by the LaunchAgent service/mac/site.musicaa.audio.plist; see docs/ops/audio-service.md.
#
# Tailscale runs as this user in userspace mode (no root, no system extension). Its state, and the
# Funnel config (`tailscale funnel --bg 8787`, set once), live in $TS_DIR and survive restarts.
set -e
cd "$(dirname "$0")"
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/sbin:/sbin:/usr/bin:/bin"
PORT="${PORT:-8787}"
TS_DIR="$HOME/Library/Application Support/musica-tailscale"
TS="tailscale --socket=$TS_DIR/tailscaled.sock"

if ! $TS status >/dev/null 2>&1 && ! pgrep -f "tailscaled.*musica-tailscale" >/dev/null; then
  mkdir -p "$TS_DIR"
  tailscaled --tun=userspace-networking --statedir="$TS_DIR" --socket="$TS_DIR/tailscaled.sock" --port=0 >>"$TS_DIR/tailscaled.log" 2>&1 &
  sleep 3
fi

[ -d .venv ] || (python3 -m venv .venv && .venv/bin/pip install -q -r requirements.txt)
.venv/bin/pip install -q -U yt-dlp || true # YouTube changes often; a stale yt-dlp is the usual breakage

export CACHE_DIR="${CACHE_DIR:-$HOME/Library/Caches/musica-audio}"
export ALLOWED_ORIGINS="${ALLOWED_ORIGINS:-http://localhost:3000,http://localhost:3100,https://www.musicaa.site,https://musicaa.site,https://musica-mauve-pi.vercel.app}"
exec .venv/bin/uvicorn main:app --host 127.0.0.1 --port "$PORT"
