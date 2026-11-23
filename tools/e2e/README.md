# End-to-end browser drivers

Nine small Playwright scripts that drive the real PWA — ingest a song, open the views, play a lyric
line, build a tutorial, screenshot each step. They emulate an iPhone (393x852, dsf 2, touch, dark) and
keep a persistent profile so the IndexedDB song library survives between runs.

## Why they are in the repo

**Rescued 2026-10-31 from `/private/tmp/.../-Users-test--soa-web/.../scratchpad/musica-shots/`** — a
temp scratchpad belonging to an *unrelated* project, where a cleanup pass keyed on this project would
never have found them. They were the only surviving browser tooling for Musica: an earlier generation
(`shot.mjs`, `cdp.mjs`, `reco.mjs`, `latency.mjs`, `ps_test.mjs`, the `cb/` chord-decoder benchmark,
`tt2/t_simplify.ts`) had already been deleted by tmp cleanup and is **unrecoverable**.

If you build tooling worth keeping, put it here, not in a scratchpad.

## Setup

Playwright is deliberately **not** a dependency of this repo. `common.mjs` resolves it in order:

1. `$PLAYWRIGHT_DIR` — a `node_modules/` directory that has it
2. `web/node_modules/`
3. a plain resolve (global / npx / parent `node_modules`)

```sh
# On this Mac, three unrelated projects already have it (verified 2026-10-31) - any works:
export PLAYWRIGHT_DIR=/Users/test/Desktop/Side-Proj/idiet/node_modules/
# ...or make it self-contained and stop depending on another repo:
cd ../../web && pnpm add -D playwright && npx playwright install chromium
```

Nothing in this repo has playwright installed, so with no `PLAYWRIGHT_DIR` the drivers fail fast with
an explicit message listing what it tried - not a confusing stack trace.

The original `common.mjs` hardcoded `createRequire('/Users/test/Desktop/Side-Proj/idiet/node_modules/')`
— an absolute path into a different project. That was replaced with the chain above; nothing else about
the drivers was changed.

## Environment

| Variable | Default | Purpose |
|---|---|---|
| `MUSICA_BASE` | `https://www.musicaa.site` | target origin — set to `http://localhost:3100` for a local build (3000 is taken on this Mac) |
| `MUSICA_PROFILE` | `./profile` | persistent Chrome profile holding the song library |
| `PLAYWRIGHT_DIR` | — | where to resolve `playwright` from |

`profile/` and `*.png` are gitignored.

## The drivers

| Script | What it does |
|---|---|
| `common.mjs` | shared launcher: profile, iPhone emulation, console/pageerror logging, `BASE` |
| `ingest.mjs` | search a query, screenshot results, click the Nth result, poll analysis progress up to 300s until the URL becomes `/song/` |
| `explore.mjs` | walk `/library`, `/`, `/song/<id>`, the Beats/Chords/Learn tabs, `/song/<id>/tutorial`, `/me`, screenshotting each as `x-*.png` |
| `play.mjs` | `id lineIdx secs out view` — click a lyric line, press Play, wait, optionally switch view, screenshot |
| `sheet.mjs` | `play.mjs` plus preference seeding (`playerCollapsed=false` into `musica.prefs.v1`) and sticky-header scroll alignment |
| `view.mjs` | most parameterised: `id lineIdx secs view collapsed out [instrument]` — picks an instrument button by regex |
| `tut.mjs` | tutorial builder: select instrument, open `/song/<id>/tutorial`, click Arrange/Melody, poll up to 240s for a `<canvas>`, log build time, play, screenshot |
| `lines.mjs` | print header text and the first 7 lyric lines for each song id in argv |
| `del.mjs` | `node del.mjs "<song title>"` — delete a library entry by name |

## Caveat

These have **not** been run since the Railway cutover (2026-10-02). Every verification in
`docs/ops/` is `curl` against individual endpoints; the full ingest → analysis → playback flow has not
been confirmed in a browser since. Running `ingest.mjs` is the cheapest way to close that gap.
