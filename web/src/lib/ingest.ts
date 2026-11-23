"use client";
import { audioUrls, splitTitle, type Resolved } from "@/lib/api";
import { decodeToMono, sha1Hex } from "@/lib/audio/decode";
import { analyzeAudio } from "@/lib/analysis/client";
import { fetchLyrics } from "@/lib/lyrics/lrclib";
import { getSong, saveAudio, saveSong, type Song } from "@/lib/store/db";
import { getPrefs } from "@/lib/store/prefs";
import type { Key } from "@/lib/i18n/en";
import { estimateOffset } from "@/lib/lyrics/sync";
import type { Preview } from "@/lib/sources/itunes";

export type IngestStage = "fetching" | "decoding" | "analyzing" | "lyrics" | "saving" | "done" | "error";
export interface IngestState { stage: IngestStage; pct: number; detail: Key | ""; songId?: string; error?: string; needsFile?: boolean }
type Report = (s: IngestState) => void;

/** YouTube would not hand over this song's audio (no audio service, or YouTube refused it).
 *  The song is still known: the user can open their own recording of it. */
export class NeedsRecordingError extends Error {
  constructor(cause?: string) { super(cause ?? "No audio service"); this.name = "NeedsRecordingError"; }
}

const STAGE_LABEL: Record<string, Key> = {
  waveform: "ingest.waveform", key: "ingest.key", tempo: "ingest.tempo", chords: "ingest.chords", vocals: "ingest.vocals", done: "ingest.done",
};

async function fetchWithProgress(url: string, onPct: (p: number) => void): Promise<Blob> {
  // A sleeping Mac behind a tunnel can leave the request hanging. Give up on the first byte after 90 s
  // (a cold download plus conversion takes well under that), but never cut off a body that is flowing.
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 90_000);
  const res = await fetch(url, { signal: ac.signal }).finally(() => clearTimeout(timer));
  if (!res.ok) throw new Error(`Audio fetch failed (${res.status})`);
  const total = Number(res.headers.get("Content-Length") ?? 0);
  if (!res.body || !total) return res.blob();
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let got = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value); got += value.length; onPct(got / total);
  }
  return new Blob(chunks as BlobPart[], { type: res.headers.get("Content-Type") ?? "audio/mp4" });
}

async function run(id: string, meta: Omit<Song, "id" | "hasAudio" | "transpose" | "capo" | "createdAt" | "updatedAt">, getBlob: (r: Report) => Promise<Blob>, report: Report, hints: { rawTitle?: string; channel?: string } = {}): Promise<string> {
  const existing = await getSong(id);
  if (existing?.analysis) { report({ stage: "done", pct: 1, detail: "ingest.already", songId: id }); return id; }

  const blob = await getBlob(report);
  report({ stage: "decoding", pct: 0.3, detail: "ingest.decoding" });
  const buf = await blob.arrayBuffer();
  const { audio, sampleRate, duration } = await decodeToMono(buf);

  report({ stage: "analyzing", pct: 0.35, detail: "ingest.warming" });
  const { analysis, peaks } = await analyzeAudio(audio, sampleRate, (stage, pct) =>
    report({ stage: "analyzing", pct: 0.35 + 0.5 * pct, detail: STAGE_LABEL[stage] ?? "ingest.chords" }));

  report({ stage: "lyrics", pct: 0.88, detail: "ingest.lyrics" });
  let lyrics = null;
  try { lyrics = await fetchLyrics(meta.title, meta.artist, duration, hints.channel, hints.rawTitle); } catch { /* offline: fine */ }

  report({ stage: "saving", pct: 0.95, detail: "ingest.saving" });
  // Line up a timestamped lyric file with this recording (a different edit often has a longer intro).
  let lyricsOffset = 0, lyricsAutoSynced = false;
  if (lyrics?.synced) {
    const est = estimateOffset(lyrics.lines, analysis.vocals);
    if (est?.confident) { lyricsOffset = est.offset; lyricsAutoSynced = true; }
  }
  const song: Song = {
    id, ...meta, durationSec: duration, hasAudio: true, analysis, peaks: Array.from(peaks), lyrics: lyrics ?? undefined,
    lyricsOffset, lyricsAutoSynced,
    transpose: 0, capo: 0, instrument: getPrefs().instrument, createdAt: Date.now(), updatedAt: Date.now(),
  };
  await saveAudio(id, blob);
  await saveSong(song);
  report({ stage: "done", pct: 1, detail: "ingest.ready", songId: id });
  return id;
}

function resolvedMeta(r: Resolved) {
  const split = songName(r);
  return {
    id: `yt:${r.id}`,
    meta: { source: r.source, title: split.title, artist: split.artist, durationSec: r.duration, thumbnail: r.thumbnail, sourceUrl: `https://www.youtube.com/watch?v=${r.id}` },
    hints: { rawTitle: r.title, channel: r.channel },
  };
}

export function ingestResolved(r: Resolved, report: Report): Promise<string> {
  const { id, meta, hints } = resolvedMeta(r);
  return run(id, meta, async (rep) => {
    let last = "No audio service";
    for (const url of audioUrls(r.id)) {
      rep({ stage: "fetching", pct: 0.02, detail: "ingest.pulling" });
      try { return await fetchWithProgress(url, (p) => rep({ stage: "fetching", pct: 0.02 + 0.26 * p, detail: "ingest.pulling" })); }
      catch (e) { last = (e as Error).message; } // offline Mac, YouTube refusing a cloud IP: try the next one
    }
    throw new NeedsRecordingError(last);
  }, report, hints);
}

/** Title and artist as the library will show them, for matching the song in other sources. */
export function songName(r: Resolved): { title: string; artist?: string } {
  return r.artist ? { title: r.title, artist: r.artist } : splitTitle(r.title, r.channel);
}

/** Fallback when YouTube refuses: analyze the song's 30-second store preview. A separate library entry,
 *  so opening the full recording later still works. */
export function ingestPreview(r: Resolved, p: Preview, report: Report): Promise<string> {
  const { meta, hints } = resolvedMeta(r);
  return run(`preview:${p.trackId}`, { ...meta, title: p.title, artist: p.artist, thumbnail: p.artwork ?? meta.thumbnail, preview: true }, async (rep) => {
    rep({ stage: "fetching", pct: 0.02, detail: "ingest.pullingPreview" });
    return fetchWithProgress(p.url, (pct) => rep({ stage: "fetching", pct: 0.02 + 0.26 * pct, detail: "ingest.pullingPreview" }));
  }, report, hints);
}

/** Analyze a file the user picked. With `as`, the file is their recording of a song they found by
 *  search or link, and it keeps that song's title, artist and cover. */
export async function ingestFile(file: File, report: Report, as?: Resolved): Promise<string> {
  report({ stage: "fetching", pct: 0.05, detail: "ingest.readingFile" });
  const buf = await file.arrayBuffer();
  const blob = async () => new Blob([buf], { type: file.type || "audio/mpeg" });
  if (as) {
    const { id, meta, hints } = resolvedMeta(as);
    return run(id, meta, blob, report, hints);
  }
  const id = `file:${(await sha1Hex(buf)).slice(0, 16)}`;
  const name = file.name.replace(/\.[^.]+$/, "");
  const split = splitTitle(name);
  return run(id, { source: "file", title: split.title, artist: split.artist, durationSec: 0 }, blob, report, { rawTitle: name });
}
