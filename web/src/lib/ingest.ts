"use client";
import { audioUrl, splitTitle, type Resolved } from "@/lib/api";
import { decodeToMono, sha1Hex } from "@/lib/audio/decode";
import { analyzeAudio } from "@/lib/analysis/client";
import { fetchLyrics } from "@/lib/lyrics/lrclib";
import { getSong, saveAudio, saveSong, type Song } from "@/lib/store/db";
import { getPrefs } from "@/lib/store/prefs";
import type { Key } from "@/lib/i18n/en";

export type IngestStage = "fetching" | "decoding" | "analyzing" | "lyrics" | "saving" | "done" | "error";
export interface IngestState { stage: IngestStage; pct: number; detail: Key | ""; songId?: string; error?: string }
type Report = (s: IngestState) => void;

const STAGE_LABEL: Record<string, Key> = {
  waveform: "ingest.waveform", key: "ingest.key", tempo: "ingest.tempo", chords: "ingest.chords", vocals: "ingest.vocals", done: "ingest.done",
};

async function fetchWithProgress(url: string, onPct: (p: number) => void): Promise<Blob> {
  const res = await fetch(url);
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
  const song: Song = {
    id, ...meta, durationSec: duration, hasAudio: true, analysis, peaks: Array.from(peaks), lyrics: lyrics ?? undefined,
    transpose: 0, capo: 0, instrument: getPrefs().instrument, createdAt: Date.now(), updatedAt: Date.now(),
  };
  await saveAudio(id, blob);
  await saveSong(song);
  report({ stage: "done", pct: 1, detail: "ingest.ready", songId: id });
  return id;
}

export function ingestResolved(r: Resolved, report: Report): Promise<string> {
  const split = r.artist ? { title: r.title, artist: r.artist } : splitTitle(r.title, (r as Resolved & { channel?: string }).channel);
  return run(
    `yt:${r.id}`,
    { source: r.source, title: split.title, artist: split.artist, durationSec: r.duration, thumbnail: r.thumbnail, sourceUrl: `https://www.youtube.com/watch?v=${r.id}` },
    async (rep) => {
      rep({ stage: "fetching", pct: 0.02, detail: "ingest.pulling" });
      return fetchWithProgress(audioUrl(r.id), (p) => rep({ stage: "fetching", pct: 0.02 + 0.26 * p, detail: "ingest.pulling" }));
    },
    report,
    { rawTitle: r.title, channel: (r as Resolved & { channel?: string }).channel },
  );
}

export async function ingestFile(file: File, report: Report): Promise<string> {
  report({ stage: "fetching", pct: 0.05, detail: "ingest.readingFile" });
  const buf = await file.arrayBuffer();
  const id = `file:${(await sha1Hex(buf)).slice(0, 16)}`;
  const name = file.name.replace(/\.[^.]+$/, "");
  const split = splitTitle(name);
  return run(
    id,
    { source: "file", title: split.title, artist: split.artist, durationSec: 0 },
    async () => new Blob([buf], { type: file.type || "audio/mpeg" }),
    report,
    { rawTitle: name },
  );
}
