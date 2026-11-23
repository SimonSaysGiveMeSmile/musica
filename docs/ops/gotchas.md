# Gotchas

Non-obvious facts that cost hours to rediscover. Most are **recorded from prior working sessions**
(2026-09-14 → 2026-10-02) rather than re-verified on 2026-10-31; where something has since been
checked or invalidated, it says so. If one names a file or flag, confirm it still exists before
relying on it.

## Audio analysis / essentia

- `web/public/essentia/essentia-wasm.web.js` is **hand-patched** (the `ENVIRONMENT_IS_WEB` /
  `ENVIRONMENT_IS_WORKER` lines) so it runs inside a Web Worker. **Re-apply the patch if essentia.js is
  ever reinstalled or re-copied** — otherwise the worker silently fails.
- Essentia's HPCP **bin 0 is A, not C**. The worker's chord templates rotate by 9 to compensate.
- Chord decoding is a custom bar-aware Viterbi in `web/public/workers/analysis.js`, originally tuned on
  Radiohead "Creep" (expects G B C Cm).
- **Bump `ANALYSIS_VERSION`** in `web/src/lib/analysis/client.ts` *and* the `?v=` in
  `web/public/workers/analysis.js` *and* `web/public/sw.js` whenever worker or essentia files change.
  Skip this and the service worker serves stale scripts. (Deployed `sw.js` is `musica-v13`, essentia
  assets at `?v=11`, as of 2026-10-31.)
- Never call essentia `PitchYin` per hop (~25 ms a call). The worker's own `yinPitch` in the pure block
  is ~0.5 ms and more accurate.
- The instrument-recognition code in `analysis.js` sits between `/* @pure-start */` and
  `/* @pure-end */` markers and uses no essentia, so it can be sliced out and `new Function(...)`-ed in
  Node — far faster than driving a browser. `web/public/workers/pitch-processor.js` (the transpose phase
  vocoder) follows the same convention.
- **Live pipeline:** the worklet sends a 4096 window every 1024-sample hop; `sendLiveFrame(frame, sr, hop)`
  stamps `sentAt`; the worker appends only the hop's new samples to its rolling 16384 buffer, skips
  frames older than 60 ms, and echoes `age`/`took`/`dropped` on every live message. Expect ±60 ms
  run-to-run spread in latency measurements — repeat runs before concluding anything.

### The chord-decoder benchmark is gone

A benchmark harness (`cb/` — `gen.mjs`, `bench.mjs`, `explore.mjs`) recorded a decoder improvement from
**69.9% → 92.6%** (band preset off + `wThird` 1.0 + softmax temp 4). Confirmed 2026-10-31: **that harness
no longer exists anywhere on disk** — the scratchpads holding it were cleaned up. So:

> Treat 92.6% as *recorded history, not a measured baseline.* Before touching `decodeChords` or
> `hpcpFrame`, the harness has to be rewritten from this description: synthesise band songs with known
> truth, run the real worker in Node (essentia loaded with `wasmBinary`, `vocalActivity` stubbed), cache
> chroma per song, then score decoder/HPCP variants.

Same fate for `reco.mjs`, `latency.mjs`, `ps_test.mjs`, `shot.mjs`, the musica `cdp.mjs`, and
`tt2/t_simplify.ts`. All lost. The lesson is in [`../../tools/e2e/README.md`](../../tools/e2e/README.md):
scratchpad tooling that matters belongs in the repo.

## Browser / CDP testing

- **Port 3000 on this Mac is occupied** by an unrelated process (returns 426). Use 3100.
- `pkill -f next-server` (not `next start`) to stop the prod server before rebuilding, or the old server
  keeps serving broken chunks.
- Launch any headless test Chrome **detached** (`nohup … & disown`, in its own short command). Launched
  inside a command that later hits the Bash timeout, it dies with the shell.
- `element.click()` does **not** fire pointerdown/pointerup, so controls listening only for pointer
  events look dead. Use `Input.dispatchMouseEvent` for those. **The reverse also holds** (2026-09-19,
  Chrome 153): with touch emulation on, `Input.dispatchMouseEvent` presses did not reach React `onClick`
  buttons at all, while `element.click()` did. Try both before believing a control is broken.
- Screenshots at 1280x860 with `deviceScaleFactor: 2` hang `Page.captureScreenshot`. Use dsf 1 for
  desktop widths.
- The headless test Chrome **cannot decode AAC**, so `yt:` songs fail with `NotSupportedError`. Playback
  tests must use a WAV song — `web/public/__test/band.wav` (gitignored but present, 24 MB with
  `song.wav`).
- Live-mic testing without a real mic: `--no-sandbox --use-fake-device-for-media-stream
  --use-fake-ui-for-media-stream --use-file-for-fake-audio-capture=<16-bit PCM wav>` (make the wav with
  `ffmpeg -map_metadata -1 -fflags +bitexact`). **Without `--no-sandbox` the file silently fails to load
  and the mic delivers silence.**
- `lsof` is **not on `PATH`** on this Mac (it is at `/usr/sbin/lsof`, and `PATH` has no sbin entry). A
  bare `lsof … | grep …` exits 127 and the grep sees empty input — indistinguishable from "no listeners
  found". This produced a false negative during the 2026-10-31 audit. Use the absolute path.

## UI copy / i18n

- UI strings live in `web/src/lib/i18n/{en,zh,de,fr,es,az,ru}.ts`. `en.ts` defines the typed key set;
  every other file must cover every key. Use `useT()` in components — never hardcode UI copy.
- Homepage tagline is "Sing any song in just a minute" (user-specified).

## Infrastructure

- **Checking a process is not checking a service.** A `cloudflared` quick tunnel can keep its process
  alive while its hostname stops resolving — `pgrep` looks healthy, the site is dead. Probe URLs.
- `NEXT_PUBLIC_AUDIO_API` is a **build-time** inline. See [`deploying.md`](deploying.md).
- A `git push` deploys nothing — no git integration, no CI workflows.
- `railway login` cannot be performed from Claude Code at all. See [`deploying.md`](deploying.md) step 0.
- **`musica.vercel.app` is a stranger's site**, not this project. The real hosts are `www.musicaa.site`,
  `musicaa.site` (308 → www) and `musica-mauve-pi.vercel.app`.

## Documentation that is wrong

Flagged 2026-10-31, not yet corrected in place:

- `README.md:9` — says the audio service "currently runs on the development Mac behind a Cloudflare
  quick tunnel". False since 2026-10-02; it is on Railway.
- `README.md:43` — tells the operator to set `ALLOWED_ORIGINS` to a single origin, which would break
  `www.musicaa.site` and the apex.
- `docs/PRD.md:230` — presents "Rate limit: 30 requests/min/IP" as a protection. It is bypassable; see
  [`audio-service.md`](audio-service.md).
- `docs/PRD.md:227` — claims `/audio/{id}` "Supports `Range`". Range support comes from whatever Starlette
  provides via `FileResponse`; the service code implements none, and the repo verifies none. (It does
  work: verified 206 + `content-range` on 2026-10-31.)
- `docs/PRD.md:252` + `:275` — list "deploy docs" as a delivered M6 item. This folder is the first
  actual deploy documentation in the repo.
- `service/README.md:19-23` — documents 4 of the service's 8 env vars.
