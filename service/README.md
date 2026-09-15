# Musica audio service

Tiny FastAPI container that wraps `yt-dlp` + `ffmpeg`. No tokens, no database.

| Route | Purpose |
|-------|---------|
| `GET /search?q=` | YouTube search (10 results) |
| `GET /resolve?url=` | YouTube or Spotify link → `{id,title,artist,duration,thumbnail}` |
| `GET /audio/{id}` | AAC 128k `audio/mp4`, cached on disk |
| `GET /health` | liveness |

## Run locally
```
python3 -m venv .venv && . .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --port 8787 --reload
```

## Deploy to Railway
1. New project → Deploy from repo, set **Root Directory** to `service`.
2. Add a volume mounted at `/data` (audio cache).
3. Variables: `ALLOWED_ORIGINS=https://your-app.vercel.app`, optional `YTDLP_COOKIES`, `YTDLP_PROXY`, `CACHE_MAX_MB`.
4. Copy the public URL into the web app's `NEXT_PUBLIC_AUDIO_API`.
