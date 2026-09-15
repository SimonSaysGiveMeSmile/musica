# Musica

Any song, in your hands. A mobile-first PWA that turns a YouTube link, Spotify link, search, or local audio file into a chord sheet with lyrics, key, tempo, and instrument diagrams. All music analysis runs on the phone (Essentia.js in a Web Worker). No accounts, no AI tokens, no database.

Read the product spec in [`docs/PRD.md`](docs/PRD.md).

**Live:** https://www.musicaa.site (Vercel project `musica`, also https://musica-mauve-pi.vercel.app). On a phone, open it in Safari or Chrome, then Share → Add to Home Screen.

> The audio service currently runs on the development Mac behind a Cloudflare quick tunnel (`service/run-local.sh`). That URL dies when the Mac sleeps and changes on every restart. Move it to Railway with the steps below, then point `NEXT_PUBLIC_AUDIO_API` at the Railway URL.

```
musica/
├─ web/       Next.js 16 PWA → Vercel
├─ service/   FastAPI + yt-dlp + ffmpeg → Railway (or any container host)
└─ docs/      PRD
```

## Run locally

Terminal 1, the audio service (needs `ffmpeg` on PATH):
```
cd service
python3 -m venv .venv && . .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --port 8787 --reload
```

Terminal 2, the web app:
```
cd web
pnpm install
pnpm dev
```
Open http://localhost:3000. `web/.env.local` points at `http://localhost:8787` by default.

To try it on your phone, run `pnpm dev -H 0.0.0.0` and open your Mac's LAN IP. The microphone (Live tab) needs HTTPS or localhost, so use the deployed build for that.

## Deploy

**Service → Railway**
1. New project → Deploy from GitHub, root directory `service`.
2. Add a volume mounted at `/data`.
3. Set `ALLOWED_ORIGINS=https://<your-app>.vercel.app`.
4. Note the public URL.

**Web → Vercel**
1. Import the repo, root directory `web`, framework Next.js.
2. Environment variable `NEXT_PUBLIC_AUDIO_API=https://<service>.up.railway.app`.
3. Deploy. On the phone, open the URL in Safari/Chrome → Share → Add to Home Screen.

## How the analysis works
- Audio is decoded by the browser, downmixed to mono at 44.1 kHz.
- Essentia.js (WASM) extracts key (`KeyExtractor`), tempo and beats (`RhythmExtractor2013`), and per-frame chroma (`HPCP`).
- Chroma is averaged per beat and decoded into major/minor chords with a Viterbi pass that penalises chord changes and favours diatonic chords.
- Lyrics come from LRCLIB (free, synced when available) and are aligned to chords by timestamp.
- Live mode streams microphone frames to the same worker for chord and pitch detection.
