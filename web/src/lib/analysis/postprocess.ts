import type { Analysis, ChordSegment, RawAnalysis } from "./types";
import { parseChord } from "@/lib/theory/chords";

/** Turn per-beat chord labels into merged segments, dropping unstable blips. */
export function toAnalysis(raw: RawAnalysis): Analysis {
  const { beats, beatChords, beatStrengths, duration } = raw;
  const segs: ChordSegment[] = [];
  const n = Math.min(beats.length, beatChords.length);
  for (let i = 0; i < n; i++) {
    const chord = beatChords[i];
    const start = beats[i];
    const end = i + 1 < beats.length ? beats[i + 1] : duration;
    const strength = beatStrengths[i] ?? 0;
    const last = segs[segs.length - 1];
    if (last && last.chord === chord) { last.end = end; last.strength = Math.max(last.strength, strength); }
    else segs.push({ chord, start, end, beatIndex: i, strength });
  }
  // Absorb single-beat blips sandwiched between identical neighbours.
  const cleaned: ChordSegment[] = [];
  for (let i = 0; i < segs.length; i++) {
    const s = segs[i];
    const prev = cleaned[cleaned.length - 1];
    const next = segs[i + 1];
    const beatsLong = next ? next.beatIndex - s.beatIndex : 1;
    if (prev && next && beatsLong === 1 && prev.chord === next.chord && s.strength < 0.6) {
      prev.end = s.end; continue;
    }
    if (prev && prev.chord === s.chord) { prev.end = s.end; continue; }
    cleaned.push({ ...s });
  }
  return {
    version: 1,
    key: raw.key,
    scale: raw.scale,
    keyStrength: raw.keyStrength,
    bpm: Math.round(raw.bpm * 10) / 10,
    beats,
    chords: cleaned,
    chroma: raw.chroma,
    duration,
    downbeatPhase: raw.downbeatPhase ?? 0,
    vocals: raw.vocals && raw.vocals.length ? raw.vocals : undefined,
  };
}

/** Distinct chords, ignoring one-off blips that cover less than a bar of the song. */
export function distinctChords(a: Analysis): string[] {
  const total = new Map<string, { dur: number; n: number; first: number }>();
  const bar = (60 / (a.bpm || 120)) * 4;
  for (const s of a.chords) {
    if (s.chord === "N") continue;
    const t = total.get(s.chord) ?? { dur: 0, n: 0, first: s.start };
    t.dur += s.end - s.start; t.n += 1;
    total.set(s.chord, t);
  }
  return [...total.entries()]
    .filter(([, t]) => t.n > 1 || t.dur >= bar)
    .sort((x, y) => x[1].first - y[1].first)
    .map(([c]) => c);
}

/** Mean vocal activity over [from, to). Returns null when the analysis has no vocal data. */
export function vocalActivityIn(a: Analysis, from: number, to: number): number | null {
  if (!a.vocals || !a.vocals.length) return null;
  const s = Math.max(0, Math.floor(from * 2)), e = Math.min(a.vocals.length, Math.ceil(to * 2));
  if (e <= s) return null;
  let sum = 0; for (let i = s; i < e; i++) sum += a.vocals[i];
  return sum / (e - s);
}

/** First moment the voice comes in and stays for ~2 s. */
export function firstVocalOnset(a: Analysis): number | null {
  if (!a.vocals) return null;
  const v = a.vocals;
  for (let i = 0; i + 3 < v.length; i++) {
    const w = (v[i] + v[i + 1] + v[i + 2] + v[i + 3]) / 4;
    if (w >= 0.45) return i / 2;
  }
  return null;
}

export function chordAt(a: Analysis, t: number): ChordSegment | null {
  // binary search
  let lo = 0, hi = a.chords.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const s = a.chords[mid];
    if (t < s.start) hi = mid - 1;
    else if (t >= s.end) lo = mid + 1;
    else return s;
  }
  return null;
}

/* ───────────── simplification: fewer chords to follow ─────────────
   The analysis names a chord for every beat it can. A beginner wants one chord per bar, or one per
   line of lyrics. Nothing here touches the analysis itself: the song keeps every chord it found, and
   the page decides how many of them to show. */

export interface SimplifyOptions {
  /** at most one chord per this many beats, or one per lyric line; 0 leaves the chords alone */
  grid: 0 | 2 | 4 | 6 | 8 | "line";
  /** the chord that sounds longest in the stretch, or the one sounding when it starts */
  pick: "longest" | "first";
  /** chords outside the key fold into the chord before them */
  inKey: boolean;
}

/** Chords that belong to a key: the six triads of the scale (no diminished), plus the major V in minor. */
export function diatonicChords(key: string, scale: "major" | "minor"): Set<string> {
  const k = parseChord(key);
  const out = new Set<string>();
  if (!k) return out;
  const steps = scale === "major" ? [0, 2, 4, 5, 7, 9] : [0, 3, 5, 7, 8, 10];
  const minor = scale === "major" ? [false, true, true, false, false, true] : [true, false, true, true, false, false];
  const NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  steps.forEach((st, i) => out.add(NAMES[(k.root + st) % 12] + (minor[i] ? "m" : "")));
  if (scale === "minor") out.add(NAMES[(k.root + 7) % 12]); // the dominant, almost always major in practice
  return out;
}

function mergeRuns(segs: ChordSegment[]): ChordSegment[] {
  const out: ChordSegment[] = [];
  for (const s of segs) {
    const last = out[out.length - 1];
    if (last && last.chord === s.chord && Math.abs(last.end - s.start) < 1e-6) { last.end = s.end; last.strength = Math.max(last.strength, s.strength); }
    else out.push({ ...s });
  }
  return out;
}

/** Stretch boundaries for a beat grid: every `n` beats from the bar line, so stretches line up with bars. */
function gridCells(beats: number[], duration: number, n: number, phase: number): { start: number; end: number; beatIndex: number }[] {
  if (!beats.length) return [{ start: 0, end: duration, beatIndex: 0 }];
  const starts: number[] = [];
  const first = ((phase % n) + n) % n; // the first beat index that sits on the grid
  if (first > 0) starts.push(0);
  for (let i = first; i < beats.length; i += n) starts.push(i);
  return starts.map((bi, k) => ({ start: beats[bi], end: k + 1 < starts.length ? beats[starts[k + 1]] : duration, beatIndex: bi }));
}

/** One stretch per lyric line; the time before the first line and any line longer than three bars fall back to two-bar stretches. */
function lineCells(beats: number[], duration: number, phase: number, lines: number[]): { start: number; end: number; beatIndex: number }[] {
  const times = [...new Set(lines.filter((t) => t >= 0 && t < duration))].sort((a, b) => a - b);
  if (!times.length) return gridCells(beats, duration, 8, phase);
  const bars = gridCells(beats, duration, 8, phase);
  const out: { start: number; end: number; beatIndex: number }[] = [];
  const beatAt = (t: number) => { const i = beats.findIndex((b) => b >= t - 1e-6); return i < 0 ? Math.max(0, beats.length - 1) : i; };
  // the intro: two-bar stretches on the song's own bar lines, cut to the gap
  if (times[0] > 0) for (const c of bars) {
    const s = Math.max(0, c.start), e = Math.min(times[0], c.end);
    if (e - s > 1e-3) out.push({ start: s, end: e, beatIndex: beatAt(s) });
  }
  const beatLen = beats.length > 1 ? (beats[beats.length - 1] - beats[0]) / (beats.length - 1) : 0.5;
  for (let i = 0; i < times.length; i++) {
    const s = times[i], e = i + 1 < times.length ? times[i + 1] : duration;
    if (e - s <= beatLen * 12) { out.push({ start: s, end: e, beatIndex: beatAt(s) }); continue; }
    // a long line (an instrumental break the lyrics skip over): eight beats at a time from where it starts
    let b = beatAt(s), start = s;
    while (start < e - 1e-3) {
      const nb = Math.min(b + 8, beats.length);
      const end = nb < beats.length ? Math.min(e, beats[nb]) : e;
      out.push({ start, end, beatIndex: b });
      if (end >= e - 1e-3 || nb >= beats.length) break;
      start = end; b = nb;
    }
  }
  return out;
}

/** The chords the page shows for the chosen level of detail. `lineTimes` are the lyric lines' start times, offset applied. */
export function simplifyChords(a: Analysis, o: SimplifyOptions, lineTimes: number[] = []): ChordSegment[] {
  let segs = a.chords;
  if (o.inKey) {
    const ok = diatonicChords(a.key, a.scale);
    const folded: ChordSegment[] = [];
    for (const s of segs) {
      const keep = s.chord === "N" || ok.has(s.chord);
      const prev = folded[folded.length - 1];
      if (keep || !prev) folded.push({ ...s }); else prev.end = s.end;
    }
    // a foreign chord at the very start takes the name of what follows
    if (folded.length > 1 && folded[0].chord !== "N" && !ok.has(folded[0].chord)) { folded[1].start = folded[0].start; folded[1].beatIndex = folded[0].beatIndex; folded.shift(); }
    segs = mergeRuns(folded);
  }
  if (o.grid === 0) return segs;
  const cells = o.grid === "line" ? lineCells(a.beats, a.duration, a.downbeatPhase, lineTimes) : gridCells(a.beats, a.duration, o.grid, a.downbeatPhase);
  const out: ChordSegment[] = [];
  let j = 0;
  for (const c of cells) {
    while (j > 0 && segs[j - 1].end > c.start) j--;
    while (j < segs.length && segs[j].end <= c.start) j++;
    const weight = new Map<string, number>(); const strength = new Map<string, number>();
    let firstChord: string | null = null, k = j;
    while (k < segs.length && segs[k].start < c.end) {
      const s = segs[k]; const ov = Math.min(s.end, c.end) - Math.max(s.start, c.start);
      if (ov > 0) {
        if (s.chord !== "N") {
          weight.set(s.chord, (weight.get(s.chord) ?? 0) + ov * (0.6 + 0.4 * s.strength));
          strength.set(s.chord, Math.max(strength.get(s.chord) ?? 0, s.strength));
          if (firstChord === null) firstChord = s.chord;
        }
      }
      k++;
    }
    let chord = "N";
    if (o.pick === "first" && firstChord) chord = firstChord;
    else { let best = 0; for (const [name, w] of weight) if (w > best) { best = w; chord = name; } }
    out.push({ chord, start: c.start, end: c.end, beatIndex: c.beatIndex, strength: strength.get(chord) ?? 0 });
  }
  return mergeRuns(out);
}
