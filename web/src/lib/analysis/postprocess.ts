import type { Analysis, ChordSegment, RawAnalysis } from "./types";

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
