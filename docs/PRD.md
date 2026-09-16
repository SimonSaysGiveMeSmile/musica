# Musica — Product Requirements Document

**Version:** 1.0 · **Date:** 2026-09-14 · **Status:** Approved for build

---

## 1. Summary

Musica is a mobile-first Progressive Web App (PWA) that turns any song into a playable chord sheet. A user pastes a YouTube or Spotify link, searches by title, or picks an audio file on their phone. Musica pulls the audio, analyzes it **entirely on the device** (key, tempo, beats, chords), fetches synced lyrics, and renders chords over lyrics with diagrams for guitar, piano, and ukulele. Users record which chords they already know; Musica recommends the capo or transposition that makes the song playable with those chords and highlights what is left to learn. A Live mode listens through the microphone and shows the chord and pitch being played in real time.

There is **no generative AI, no LLM tokens, and no per-request compute cost**. All music analysis uses Essentia, a standard open-source music-information-retrieval library compiled to WebAssembly and run in a Web Worker in the browser.

## 2. Goals and non-goals

### Goals
1. Paste a link → chords with lyrics in under 30 seconds on a modern phone.
2. Zero recurring cost beyond hosting: no AI tokens, no paid APIs, no database service.
3. Works as an installed home-screen app on iOS and Android, offline for already-analyzed songs.
4. Feels like a premium instrument, not a utility: piano-black lacquer, walnut, brushed gold, Apple iOS 26/27 "Liquid Glass" interaction language.

### Non-goals (v1)
- Accounts, sync between devices, social features.
- Full note-level transcription (tabs, melody). Chords only.
- Stem separation, pitch-shifted playback of the original audio (transposition affects the chord sheet, not the audio).
- Streaming from Spotify. Spotify links are resolved to metadata only and the audio is sourced from YouTube.

## 3. Users and core scenarios

**Primary user:** hobbyist guitarist or pianist, beginner to intermediate, learning songs by ear on their phone.

| # | Scenario | Outcome |
|---|----------|---------|
| S1 | "I found a song on YouTube." Paste link. | Audio pulled, analyzed, chord sheet with lyrics, key, BPM, capo suggestion. |
| S2 | "I have the song as a file." Pick from Files/Music. | Same as S1, fully offline, nothing uploaded. |
| S3 | "What is this song?" Type a title. | YouTube search results, tap one → S1. |
| S4 | "I know G, C, D, Em." Mark known chords per instrument. | Every song shows a match percentage and the capo/transpose that maximizes it. |
| S5 | "Am I playing it right?" Open Live. | Detected chord and note update in real time from the mic. |
| S6 | "Slow this bit down." Set loop points, drop speed to 75%. | Loop plays with pitch preserved, chord and lyric highlight follow. |

## 4. Functional requirements

### 4.1 Song intake
- **F1.1** Accept YouTube URLs (watch, youtu.be, shorts, music.youtube.com).
- **F1.2** Accept Spotify track URLs. Resolve title and artist via Spotify's public oEmbed endpoint (no token), then find the best YouTube match.
- **F1.3** Free-text search returning up to 10 YouTube results with title, channel, duration, thumbnail.
- **F1.4** Local audio files (mp3, m4a, wav, flac, ogg) via file picker. Files never leave the device.
- **F1.5** Audio is delivered to the client as a single downloadable stream (m4a or opus) at ≤128 kbps so a 4-minute song is under 4 MB.

### 4.2 Analysis (on-device, Essentia.js in a Web Worker)
- **F2.1** Key and scale with confidence (Essentia `KeyExtractor`, `edma` profile).
- **F2.2** Tempo (BPM) and beat positions (Essentia `RhythmExtractor2013`).
- **F2.3** Chord per beat: HPCP chroma frames are averaged per beat and decoded into major/minor triads with a Viterbi pass. Chord changes are cheap on estimated downbeats and expensive mid-bar, and diatonic chords get a small prior. Consecutive identical beats merge into segments. (Essentia's own `ChordsDetectionBeats` was evaluated and rejected: too noisy without smoothing.)
- **F2.4** Downbeat phase (which beat of four starts a bar) is estimated from where chroma changes most, and drives the bar grid and metronome accent.
- **F2.5** Progress reporting: decode → key → tempo → chords, each stage surfaced to the UI.
- **F2.6** Target: ≤ 15 s for a 4-minute track on an iPhone 14-class device. Audio is downmixed to mono and resampled to 22.05 kHz before analysis.

### 4.3 Lyrics
- **F3.1** Fetch synced lyrics from LRCLIB (free, no key) in any language. The video title's language is detected from its script (Han, Kana, Hangul, Cyrillic, Latin with diacritics), uploader noise for that language is stripped ("官方MV", "Официальное видео", "Video Oficial", …), and up to six readings of the title are tried in order: "Artist – Title", "Title – Artist", quoted CJK titles like Artist《Title》, and title-only. Results more than 25 s off the recording's duration are rejected; synced lyrics win over plain. The lyrics' own language is detected from the text and tagged on the sheet for correct typography.
- **F3.3b** Vocal activity: a per-half-second "sung melody" curve (Essentia `PredominantPitchMelodia` at 22.05 kHz, 80–1000 Hz) is stored with the analysis. Gaps in the lyrics are labelled "Instrumental" only when that curve is quiet; where singing is detected but no lyric line exists, the row says so instead of claiming an instrumental. Older analyses without the curve show a neutral chord row.
- **F3.4** Lyric sync: a per-song offset (nudged in 0.2 s steps) long-press on any line to snap it to the current playhead, and automatic alignment: the starts of sung phrases are matched against detected vocal onsets within ±12 s and a confident match is applied at analysis time (also available as the Auto button). Files without timestamps are laid out across the track and can be corrected by pinning lines while listening.
- **F7.4** Install guide: a dismissible card on the home page for phones that have not installed the app, and a permanent row in Me, with platform-specific steps (Safari on iPhone, Chrome on Android, WeChat hand-off to Safari), in all interface languages. Playback time is interpolated between the browser's coarse time updates so highlighting stays on the beat on iOS.
- **F3.2** Align chord segments to lyric lines by timestamp. A chord whose onset falls inside a line is placed above the word at the proportional position; chords between lines become standalone chord rows.
- **F3.3** Users can edit or paste their own lyrics; alignment is recomputed.

### 4.4 Chord sheet and diagrams
- **F4.1** Views: **Sheet** (chords over lyrics, auto-scroll with playback), **Timeline** (chord blocks on a beat grid), **Diagrams** (unique chords in the song).
- **F4.2** Instruments: guitar (6-string, fret diagrams with fingers), piano (keyboard with highlighted keys, root labeled), ukulele (4-string diagrams).
- **F4.3** Transpose ±11 semitones and capo 0–7 (guitar/ukulele). Display updates instantly; enharmonic spelling follows the key.
- **F4.4** Chord vocabulary from analysis is major/minor triads. User-entered chords support maj, min, 7, maj7, m7, sus2, sus4, dim, aug, add9, and slash bass.
- **F4.5** Tap any chord in the sheet to see its diagram in a bottom sheet.

### 4.5 Learning
- **F5.1** "My chords": a grid per instrument where the user marks chords they can play. Stored locally.
- **F5.2** Per song: coverage = known chords ÷ distinct chords. Computed for every capo/transpose option; the best option is recommended with a one-line reason ("Capo 2 turns F and Bb into D and G").
- **F5.3** Unknown chords are listed with the nearest simplification (Cmaj7 → C, F → Fmaj7 easy voicing, barre → capo alternative).
- **F5.4** Practice tools: A–B loop, speed 50–100% with pitch preserved, count-in and metronome click synced to the detected BPM, tap-to-seek on any chord or lyric line.

### 4.6 Live mode (real-time)
- **F6.1** Microphone input through Web Audio; frames sent to the analysis worker every ~90 ms.
- **F6.2** Displays the current chord, the notes it can hear by name, the dominant pitch and cents offset, and a 12-bin chroma. All of it comes from the instrument recogniser in §4.10 rather than from generic chroma matching, so the vocabulary covers sevenths, sus, add9, sixths, diminished and power chords, not just major and minor.
- **F6.4** Built-in tuner (Live → Tuner, the default Live mode, laid out to fit one phone screen): a VU-style arc dial (±50 cents), and instrument guides that double as controls: a headstock whose tuning pegs play and lock each string (3+3 for guitar, 2+2 for ukulele) and a two-octave keyboard whose keys play their reference tone, with the detected string or key lit. Details: string targets for guitar (standard, drop D, half-step down, DADGAD) and ukulele (re-entrant, low G, baritone), chromatic mode for piano, cents needle with in-tune hold, median-smoothed pitch, adjustable A4 reference (415–466 Hz), and reference tones per string.
- **F6.3** *(v1.1)* "Follow the song" mode: compare the detected chord to the expected chord at the current playback time. Deferred because playing the track through the speaker while listening on the mic needs echo handling.

### 4.7 Library and offline
- **F7.1** Every analyzed song is saved locally (IndexedDB): metadata, analysis, lyrics, user edits, and optionally the audio blob for offline playback.
- **F7.2** The app shell, fonts, and the Essentia WASM are precached by a service worker. Analyzed songs open with no network.
- **F7.3** Installable: web manifest, iOS meta tags, standalone display, safe-area-aware layout.

### 4.8 Languages
- **F8.1** The whole interface is available in English, Chinese (Simplified), German, French, Spanish, Azerbaijani and Russian. The language follows the device by default and can be set in Me → Appearance → Language. Chord and note names stay in international notation.

### 4.9 Tutorial (falling notes)
A full-screen practice mode at `/song/[id]/tutorial`, reached from a button on the song screen.

**Piano.** Notes fall onto a drawn keyboard and land on a hit line as they sound. The right hand is the accent
colour, the left hand ivory, and every block carries the finger to use (1 = thumb). Three ways to get the notes:
- **Melody and chords** (default): the sung line from `PredominantPitchMelodia` becomes the right hand, close
  triads under the detected chords become the left. Works on any recording, including full-band ones.
- **Straight from the recording**: iterative harmonic-comb pitch estimation over an 8192-point spectrum with
  sub-octave rejection and per-note re-attack detection. Best on solo piano. ~19 s for a four-minute song.
- **Open a score**: MIDI (formats 0/1, tempo map, running status) or MusicXML, including zipped `.mxl`.

**Guitar and ukulele.** One lane per string, in two modes the player switches between:
- **Chords**: one shape per lane from the chord track, open strings hollow, muted strings crossed, the
  chord's name on its own pill. Needs no extra analysis.
- **Notes**: real tablature. Every note carries the fret to press as the big number and the finger to use in
  a circle above it. Built by a fretboard layout pass (§4.11) from the melody, the recording, or a score.

**Playability.** Every generated piano tutorial goes through a pass that makes it playable by two human hands:
hands never cross — not even on a note held over from an earlier chord — a hand holds at most five notes at
once, and a hand never spans more than an octave. Held notes are released early before any note is dropped;
when a chord still does not fit, the weakest inner voices go and the count is reported. Fingers come from a
dynamic program scored on stretch between finger pairs, repeated fingers, hand travel, thumbs landing on
black keys, and thumb-under in stepwise passages, followed by a repair pass: because the program only sees
the chord before this one, it can ask a finger to take a new key while it is still holding an old one, so the
repair walks the result, re-fingers what it can and releases a held note only when nothing else will do.

**Pause when I stop.** The microphone (with echo cancellation, so it does not hear the backing track) tracks
a floor that follows the room; playing has to rise clearly above it. After ~1.6 s of silence the song pauses
and shows "Waiting for you"; it carries on by itself when playing resumes. Sensitivity is adjustable, and the
feature can be switched off.

**Transport.** Rewind by a fixed 3/5/10 s (default 5), and a back-a-section control that jumps to the top of
the current four-bar phrase, or the previous one if you just got there. Sections are snapped to nearby chord
changes and drawn on the scrubber. **Repeat this phrase** loops the section you are in until you turn it off.
**Count me in** gives a bar of clicks at the song's tempo before the music starts, so your hands are ready;
an automatic resume after a pause skips it, because you are already playing. Falling speed is adjustable, and
either hand can be shown alone. The transport pulls down out of the way with its grab handle (tap, drag, or
keyboard), leaving a slim bar with play, progress and the clock.

### 4.10 Instrument recognition (piano, guitar, ukulele)
Everything the app hears through the microphone goes through one recogniser, separate from the song analysis
in §4.2, which is unchanged.

- **One comb per playable note.** A note is believed only when its own fundamental is present, never from a
  stack of partials belonging to something an octave down. Real strings are stiff, so each instrument carries
  its own stiffness and the comb looks for partials where they actually sit rather than at exact multiples.
- **Instrument-aware.** Note range, how many notes can sound at once, the pitch search range and the string
  stiffness all come from which instrument the player picked.
- **Octave correction.** A plucked or struck string reads an octave high often enough that the raw pitch
  cannot be trusted, so the answer is checked an octave either side and the octave with a real fundamental
  wins. Measured on synthesised guitar, piano and ukulele notes across their whole ranges: every note
  identified, every simulated octave error corrected, and every correct reading left alone.
- **Chords by the notes that are sounding**, matched against the chord vocabulary the app can draw. Verified
  through the app with a simulated microphone playing ten open-position guitar chords: 10 of 10 named
  correctly, including A7, Cadd9, Em7 and Dsus4, which the old major/minor matching could not name at all.
- **Spectral subtraction that knows its limits.** Removing a detected note takes only as much of each
  harmonic as that note can account for. Flattening the band instead erased a note an octave up that was also
  being held, which is why octave-doubled chords used to come back as bare fifths.

### 4.11 Fretboard layout
Turning notes into tablature the way a teacher would: keep the hand in one position, take the open string
when it is there, never ask for two notes on one string at once, and lift a finger off a ringing note rather
than demand a stretch nobody has. The reach allowed grows up the neck, because the frets crowd together
there. A note below the lowest string or above the top fret is played an octave over instead of being lost.
The index finger sits at the bottom of the shape and the others follow it, and the hand only shifts when the
music leaves the position it is already in.

## 5. Non-functional requirements

| Area | Requirement |
|------|-------------|
| Performance | First load ≤ 200 KB JS on the critical path; Essentia WASM (~2 MB) loaded lazily in the worker and cached. Lighthouse mobile performance ≥ 90. |
| Privacy | Local files never leave the device. No accounts, no tracking, no third-party analytics. |
| Cost | Vercel Hobby/Pro for the web app; one small always-on container (Railway) for YouTube audio extraction. No database service. |
| Reliability | Audio service caches extracted audio on disk (LRU, 2 GB) so repeat requests for the same video are instant. |
| Accessibility | All controls reachable by touch with ≥ 44 pt targets; chord colors are never the only signal; respects `prefers-reduced-motion`. |
| Compatibility | iOS Safari 17+, Chrome Android 120+, desktop Chrome/Safari/Firefox current. |

## 6. Architecture

```
┌──────────────── Phone (PWA, Next.js on Vercel) ────────────────┐
│  UI (React, Tailwind, Motion)                                    │
│  ├─ Web Audio: decode, playback, mic capture, metronome          │
│  ├─ Analysis Worker: Essentia.js WASM (key, beats, chords, pitch)│
│  ├─ Theory: chord parsing, transposition, voicings, coverage     │
│  └─ Storage: IndexedDB (songs, audio blobs), localStorage (prefs)│
│        │ /api/lyrics (Next route, cached)     │ audio + search   │
└────────┼──────────────────────────────────────┼──────────────────┘
         ▼                                      ▼
   LRCLIB (public)                    Audio Service (Railway, Docker)
                                      FastAPI + yt-dlp + ffmpeg
                                      /search  /resolve  /audio/{id}
                                      disk LRU cache, CORS-locked
```

**Why a small container instead of serverless for audio:** yt-dlp needs a persistent runtime with ffmpeg, several seconds of wall time, and a stable outbound IP. Vercel functions are a poor fit for that. Everything else is serverless or client-side, so the container stays tiny and stateless apart from its cache.

**Why no database:** all user data is personal and device-local. IndexedDB gives offline access for free and removes an entire cost and privacy surface.

### 6.1 Stack
- **Web:** Next.js 16 (App Router, TypeScript), Tailwind CSS 4, Motion, `idb-keyval`, Essentia.js 0.1.3 (Web Worker), custom service worker.
- **Audio service:** Python 3.12, FastAPI, yt-dlp, ffmpeg. Dockerfile for Railway (or Fly.io / any container host).
- **Fonts:** none loaded; the system font stack (SF Pro on Apple platforms).

### 6.2 Data model (client)
```ts
Song {
  id: string;                 // yt:<videoId> | file:<sha1>
  source: 'youtube' | 'spotify' | 'file';
  title: string; artist?: string; durationSec: number;
  thumbnail?: string; sourceUrl?: string;
  audioBlobKey?: string;      // IndexedDB key of cached audio
  analysis?: Analysis; lyrics?: Lyrics; userLyrics?: string;
  tutorial?: Tutorial;   // notes with hand + finger, sections, source
  transpose: number; capo: number; instrument: Instrument;
  createdAt: number; updatedAt: number;
}
Analysis { key: string; scale: 'major'|'minor'; keyStrength: number;
           bpm: number; beats: number[]; chords: ChordSegment[]; version: 1 }
ChordSegment { chord: string; start: number; end: number; beatIndex: number }
Lyrics { synced: boolean; lines: { time: number; text: string }[] }
KnownChords { guitar: string[]; piano: string[]; ukulele: string[] }
```

### 6.3 Audio service API
| Method | Path | Notes |
|--------|------|-------|
| GET | `/search?q=` | yt-dlp `ytsearch10`, flat extraction, returns `[{id,title,channel,duration,thumbnail}]` |
| GET | `/resolve?url=` | YouTube or Spotify URL → `{id,title,artist,duration,thumbnail}`. Spotify goes through oEmbed then search. |
| GET | `/audio/{id}` | Streams `audio/mp4` (AAC 128k). Cached on disk. Supports `Range`. |
| GET | `/health` | Liveness. |

Rate limit: 30 requests/min/IP. CORS: only the deployed web origin plus localhost.

## 7. Design language

**Concept: "the closed lid of a concert grand."** A deep piano-black lacquer field with soft specular reflections, a band of walnut grain for warmth, and hairline brushed-gold accents used sparingly for the active state. Text is ivory. Glass surfaces (iOS 26 Liquid Glass) float over the lacquer: translucent, blurred, with a bright top edge and concentric corner radii.

- **Typography:** the system font only (SF Pro on Apple devices, with SF Pro Rounded for chord names), set on the iOS text-style scale: Large Title 34/700, Title 1 28, Title 2 22, Headline 17/600, Body 17, Subheadline 15, Footnote 13, Caption 12/11. No web fonts are loaded.
- **Surfaces (iOS 26/27 Liquid Glass):** translucent lenses with a specular top-left edge over a blurred, saturated backdrop. A raised "lens" marks the selected segment or tab. Lists are inset grouped cards with hairline separators and chevrons; icon actions are 44 pt glass circles; the tab bar is a glass capsule with Search as its own detached circle.
- **Color tokens:** `--lacquer #0B0A09`, `--lacquer-2 #161412`, `--ivory #F3EDE2`, `--walnut #4A3222`, `--walnut-hi #8A5A3A`, `--gold #C9A45C`, `--gold-hi #E8C77E`, `--felt #7A1F2B` (accent for record/live).
- **Motion:** one orchestrated page reveal (staggered 40 ms); chord blocks slide with spring physics; playhead is a continuous transform, never a re-render; all motion disabled under reduced-motion.
- **Layout:** on phones, a large title, a floating glass tab bar (Search, Library, Live, Me) and a persistent glass player above it. On screens 1024 px and wider, a left navigation rail, a wide sheet column (max 64 characters), and the player docked as a sticky side panel with the current chord's diagram beneath it.
- **Themes:** dark is the brand default; a full light palette (warm ivory ground, lacquer text) follows the system setting or an explicit System / Light / Dark choice in Me → Appearance. Nine accents (Gold, Copper, Rose, Sage, Sky, Silver, Orchid, Gliver, Sunrise) each carry tuned dark and light values so contrast holds in both themes. Every surface is token-driven; the piano keyboard on the Me page keeps its own black-key palette in both themes on purpose.

## 8. Milestones

| M | Deliverable |
|---|-------------|
| M1 | Repo, design system, PWA shell, tab navigation, Essentia worker proving key/BPM/chords on a local file. |
| M2 | Audio service (search, resolve, audio), YouTube/Spotify intake, library persistence. |
| M3 | Lyrics fetch and alignment, Sheet/Timeline/Diagram views, transposition and capo, guitar/piano/ukulele diagrams. |
| M4 | My chords, coverage and recommendation, practice tools (loop, speed, metronome). |
| M5 | Live mode (chord, tuner). |
| M6 | Offline caching, install prompts, performance pass, deploy docs. |

## 9. Success metrics
- Link-to-chords median time < 30 s (measured in-app, stored locally only).
- Chord accuracy ≥ 75% on a 20-song pop/rock reference set versus published chord sheets.
- ≥ 60% of sessions on an installed PWA after week 2 (self-reported, no telemetry).

## 10. Risks and mitigations
| Risk | Mitigation |
|------|------------|
| YouTube blocks datacenter extraction | Service supports a cookie file and proxy env vars; local-file path always works. |
| Essentia chord vocabulary is triads only | Sufficient for learning; users can edit chords; roadmap item for 7th templates. |
| iOS Safari memory limits on long tracks | Analyze at 22.05 kHz mono, chunk decoding, cap at 12 minutes. |
| Lyrics missing for niche songs | Paste-your-own lyrics; chords-only timeline remains fully usable. |

## 11. Interpretation notes
Some words in the brief were ambiguous in transcription. Assumptions made:
- "does dad" library → **Essentia** (standard MIR library, WASM build).
- "Valentin" → **ukulele** as the third instrument alongside guitar and piano.
- "auto control of Wi-Fi and this message function" → **audio controls with waveform, loop, speed, and metronome**.
- "radish" → **Railway** for the one long-running service.

## 12. Build notes (2026-09-14)
- All milestones M1–M6 implemented in `web/` and `service/`. See the root README for run and deploy steps.
- Verified end to end in a browser against a real track: link → chords with synced lyrics in ~8 s on a laptop, key and BPM correct, four-chord progression recovered in clean 8-beat sections.
- Essentia's `essentia-wasm.web.js` was patched to run inside a Web Worker (it hard-codes a window environment). The patch is two one-line environment checks; see `web/public/essentia/`.

## 13. Build notes (2026-09-16)
- Tutorial mode added (§4.9). Transcription, arrangement and the playability pass were checked against a
  synthesised ground-truth piece (15 of 18 notes, 2 false positives) and on 400 random dense notes, where the
  playability limits held exactly.
- Verified end to end in a headless browser on a real four-minute recording: upload to analysis to
  arrangement (6 s) to falling notes; transcription (2209 notes, 10% left out for reach); MIDI import; and
  auto-pause, driven by a synthetic microphone that plays for four seconds and rests for four, which produced
  three pauses and three resumes with the clock advancing only while playing.

## 14. Build notes (2026-09-16, later)
- Instrument recognition rewritten (§4.10). Song, key, tempo, chord and vocal analysis were deliberately left
  untouched. Measured: guitar 30/30, ukulele 9/9 and piano 10/10 synthesised chords named correctly against
  10/30 for the major/minor matching it replaces; every note across each instrument's range identified with
  no phantom octaves; through the app with a simulated microphone, 10/10 chords and 12/12 tuner readings, the
  six open strings within a tenth of a hertz.
- Fretted tutorials (§4.11): guitar and ukulele now get note-by-note tablature beside the chord lane. On 879
  notes of deliberately dense random material and on the real recording, nothing unreachable, no two notes on
  one string at once, and no stretch beyond what the hand covers at that position.
- Piano playability gained a repair pass and a cross-hand check. On a 2722-note transcription of a real
  four-minute song: at most five notes per hand, at most an octave, zero hand crossings, zero finger-order
  breaks and zero cases of one finger being asked for two keys (427 and 18 respectively before the pass).
- Auto-pause now needs pitched sound, not just level, so a noisy room no longer counts as playing.
- The player and the tutorial transport retract to a slim bar. The page reserves exactly the height the card
  measures, which also fixed the expanded player covering the last lines of the chord sheet.
