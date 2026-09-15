import type { ChordSegment } from "@/lib/analysis/types";
import type { LyricLine } from "./lrclib";

export interface PlacedChord { chord: string; at: number /* char index */; time: number }
export interface SheetLine {
  time: number;
  end: number;
  text: string;
  chords: PlacedChord[];
  instrumental: boolean; // no lyric text, chords only
  vocal: "yes" | "no" | "unknown"; // whether singing was detected in this gap
}

/** Align chord segments to timed lyric lines. Chords in gaps become instrumental rows. */
/** Sung passages from the vocal-activity curve (2 Hz): merged runs where the voice is present. */
export function vocalSegments(vocals: number[] | undefined, duration: number): { start: number; end: number }[] {
  if (!vocals || vocals.length < 8) return [];
  const on = vocals.map((v, i) => {
    const w = (vocals[i - 1] ?? 0) * 0.25 + v * 0.5 + (vocals[i + 1] ?? 0) * 0.25;
    return w >= 0.18;
  });
  const segs: { start: number; end: number }[] = [];
  for (let i = 0; i < on.length; i++) {
    if (!on[i]) continue;
    const start = i / 2;
    while (i < on.length && on[i]) i++;
    const end = Math.min(duration, i / 2);
    const last = segs[segs.length - 1];
    if (last && start - last.end < 3) last.end = end; else segs.push({ start, end });
  }
  return segs.filter((s) => s.end - s.start >= 1.5);
}

/** Give unsynced lines timestamps. Anchors (line index → time, set by the user while listening) are
 *  fixed points; lines between anchors are spread in proportion to their length. Without anchors the
 *  lines run from the end of any leading silence to the end of the track. */
export function placeUnsyncedLines(lines: LyricLine[], duration: number, anchors: Record<number, number> = {}, leadIn = 0): LyricLine[] {
  const text = lines.filter((l) => l.text.trim());
  const n = text.length;
  if (!n) return [];
  const weights = text.map((l) => Math.max(8, l.text.trim().length));
  const fixed: { idx: number; time: number }[] = Object.entries(anchors)
    .map(([i, t]) => ({ idx: Number(i), time: t }))
    .filter((x) => x.idx >= 0 && x.idx < n && x.time >= 0 && x.time <= duration)
    .sort((x, y) => x.idx - y.idx);
  // keep anchors monotonic in time
  const mono: typeof fixed = [];
  for (const f of fixed) if (!mono.length || f.time > mono[mono.length - 1].time) mono.push(f);
  if (!mono.length || mono[0].idx !== 0) mono.unshift({ idx: 0, time: mono.length ? Math.max(0, Math.min(mono[0].time - 1, Math.min(leadIn, duration * 0.3))) : Math.min(leadIn, duration * 0.3) });
  const times = new Array<number>(n);
  for (let k = 0; k < mono.length; k++) {
    const from = mono[k], to = mono[k + 1] ?? { idx: n, time: duration };
    const span = Math.max(0.5, to.time - from.time);
    const w = weights.slice(from.idx, to.idx).reduce((x, y) => x + y, 0) || 1;
    let cursor = from.time;
    for (let i = from.idx; i < to.idx; i++) { times[i] = Math.round(cursor * 10) / 10; cursor += (weights[i] / w) * span; }
  }
  return text.map((l, i) => ({ time: times[i], text: l.text }));
}

export function alignSheet(lines: LyricLine[], segments: ChordSegment[], duration: number, activity?: (from: number, to: number) => number | null, anchors?: Record<number, number>, leadIn = 0): SheetLine[] {
  const synced = lines.length > 0 && lines.every((l) => l.time >= 0);
  if (!synced) lines = placeUnsyncedLines(lines, duration, anchors, leadIn);
  const timed = lines.filter((l) => l.time >= 0).sort((a, b) => a.time - b.time);
  const out: SheetLine[] = [];
  const firstT = timed.length ? timed[0].time : duration;

  const pushInstrumental = (from: number, to: number) => {
    const inGap = segments.filter((s) => s.start >= from && s.start < to && s.chord !== "N");
    if (!inGap.length) return;
    // Say "instrumental" only when the voice is clearly absent over a real gap; the detector under-reports singing.
    const a = activity ? activity(from, to) : null;
    const vocal = a === null ? "unknown" : a >= 0.35 ? "yes" : a <= 0.05 && to - from >= 4 ? "no" : "unknown";
    out.push({ time: from, end: to, text: "", instrumental: true, vocal, chords: inGap.map((s, i) => ({ chord: s.chord, at: i, time: s.start })) });
  };

  if (firstT > 1.5) pushInstrumental(0, firstT);

  for (let i = 0; i < timed.length; i++) {
    const l = timed[i];
    const next = timed[i + 1];
    const end = next ? next.time : duration;
    const text = l.text;
    if (!text) { pushInstrumental(l.time, end); continue; }
    const inLine = segments.filter((s) => s.chord !== "N" && s.start >= l.time - 0.15 && s.start < end - 0.15);
    // also carry the chord sounding at line start if the line has no chord at its head
    const sounding = segments.find((s) => s.start <= l.time && s.end > l.time && s.chord !== "N");
    const chords: PlacedChord[] = [];
    if (sounding && !inLine.some((s) => Math.abs(s.start - l.time) < 0.4)) chords.push({ chord: sounding.chord, at: 0, time: l.time });
    for (const s of inLine) {
      const pos = Math.max(0, Math.min(1, (s.start - l.time) / Math.max(0.001, end - l.time)));
      chords.push({ chord: s.chord, at: snapToWord(text, Math.round(pos * text.length)), time: s.start });
    }
    // de-duplicate chords landing on the same word
    const dedup: PlacedChord[] = [];
    for (const c of chords) {
      const last = dedup[dedup.length - 1];
      if (last && last.chord === c.chord) continue;
      if (last && c.at <= last.at) c.at = nextWord(text, last.at);
      dedup.push(c);
    }
    out.push({ time: l.time, end, text, chords: dedup, instrumental: false, vocal: "yes" });
  }
  return out;
}

/** Snap a character index to the start of the word it falls in. */
function snapToWord(text: string, at: number): number {
  if (at >= text.length) return text.length;
  let i = at;
  while (i > 0 && text[i - 1] !== " ") i--;
  return i;
}
function nextWord(text: string, from: number): number {
  const sp = text.indexOf(" ", from);
  return sp < 0 ? text.length : sp + 1;
}

/** Seconds of near-silence at the start of the recording, from the waveform peaks. */
export function leadInSeconds(peaks: number[] | undefined, duration: number): number {
  if (!peaks || !peaks.length) return 0;
  const per = duration / peaks.length;
  let max = 0; for (const p of peaks) if (p > max) max = p;
  if (!max) return 0;
  for (let i = 0; i < peaks.length; i++) if (peaks[i] > max * 0.06) return Math.round(i * per * 10) / 10;
  return 0;
}
