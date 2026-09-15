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
export function alignSheet(lines: LyricLine[], segments: ChordSegment[], duration: number, activity?: (from: number, to: number) => number | null): SheetLine[] {
  const synced = lines.length > 0 && lines.every((l) => l.time >= 0);
  if (!synced) {
    // Unsynced: distribute lines evenly over the song duration as a best effort.
    const n = lines.length || 1;
    const per = duration / n;
    lines = lines.map((l, i) => ({ time: i * per, text: l.text }));
  }
  const timed = lines.filter((l) => l.time >= 0).sort((a, b) => a.time - b.time);
  const out: SheetLine[] = [];
  const firstT = timed.length ? timed[0].time : duration;

  const pushInstrumental = (from: number, to: number) => {
    const inGap = segments.filter((s) => s.start >= from && s.start < to && s.chord !== "N");
    if (!inGap.length) return;
    const a = activity ? activity(from, to) : null;
    const vocal = a === null ? "unknown" : a >= 0.2 ? "yes" : "no";
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
