/** Chord theory: parsing, spelling, transposition, note sets. No dependencies. */

export const SHARPS = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"] as const;
export const FLATS = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"] as const;

const NOTE_INDEX: Record<string, number> = {
  C: 0, "C#": 1, Db: 1, D: 2, "D#": 3, Eb: 3, E: 4, Fb: 4, "E#": 5, F: 5, "F#": 6, Gb: 6,
  G: 7, "G#": 8, Ab: 8, A: 9, "A#": 10, Bb: 10, B: 11, Cb: 11, "B#": 0,
};

export type Quality =
  | "maj" | "min" | "7" | "maj7" | "m7" | "sus2" | "sus4" | "dim" | "dim7" | "m7b5" | "aug" | "add9" | "6" | "m6" | "9" | "5";

export interface ParsedChord {
  root: number;          // pitch class 0-11
  quality: Quality;
  bass?: number;         // slash bass pitch class
  raw: string;
}

const QUALITY_INTERVALS: Record<Quality, number[]> = {
  maj: [0, 4, 7],
  min: [0, 3, 7],
  "7": [0, 4, 7, 10],
  maj7: [0, 4, 7, 11],
  m7: [0, 3, 7, 10],
  sus2: [0, 2, 7],
  sus4: [0, 5, 7],
  dim: [0, 3, 6],
  dim7: [0, 3, 6, 9],
  m7b5: [0, 3, 6, 10],
  aug: [0, 4, 8],
  add9: [0, 4, 7, 14],
  "6": [0, 4, 7, 9],
  m6: [0, 3, 7, 9],
  "9": [0, 4, 7, 10, 14],
  "5": [0, 7],
};

const QUALITY_SUFFIX: Record<Quality, string> = {
  maj: "", min: "m", "7": "7", maj7: "maj7", m7: "m7", sus2: "sus2", sus4: "sus4",
  dim: "dim", dim7: "dim7", m7b5: "m7b5", aug: "aug", add9: "add9", "6": "6", m6: "m6", "9": "9", "5": "5",
};

const SUFFIX_TO_QUALITY: [RegExp, Quality][] = [
  [/^(maj7|M7|Δ7|Δ)$/, "maj7"],
  [/^(m7b5|ø|ø7|min7b5)$/, "m7b5"],
  [/^(dim7|°7|o7)$/, "dim7"],
  [/^(dim|°|o)$/, "dim"],
  [/^(aug|\+|\+5)$/, "aug"],
  [/^(m7|min7|-7)$/, "m7"],
  [/^(m6|min6)$/, "m6"],
  [/^(m|min|-)$/, "min"],
  [/^(sus2)$/, "sus2"],
  [/^(sus4|sus)$/, "sus4"],
  [/^(add9|add2)$/, "add9"],
  [/^(maj|M|major)?$/, "maj"],
  [/^(7|dom7)$/, "7"],
  [/^(9)$/, "9"],
  [/^(6)$/, "6"],
  [/^(5|power)$/, "5"],
];

export function parseChord(input: string): ParsedChord | null {
  const raw = input.trim();
  if (!raw || raw === "N" || raw === "N.C." || raw === "NC") return null;
  const m = raw.match(/^([A-Ga-g])([#b♯♭]?)([^/]*)(?:\/([A-Ga-g][#b♯♭]?))?$/);
  if (!m) return null;
  const letter = m[1].toUpperCase();
  const acc = m[2].replace("♯", "#").replace("♭", "b");
  const rootName = letter + acc;
  const root = NOTE_INDEX[rootName];
  if (root === undefined) return null;
  const suffix = m[3].trim();
  let quality: Quality | null = null;
  for (const [re, q] of SUFFIX_TO_QUALITY) {
    if (re.test(suffix)) { quality = q; break; }
  }
  if (!quality) return null;
  let bass: number | undefined;
  if (m[4]) {
    const b = m[4][0].toUpperCase() + (m[4][1] ?? "").replace("♯", "#").replace("♭", "b");
    bass = NOTE_INDEX[b];
  }
  return { root, quality, bass, raw };
}

export function pcName(pc: number, preferFlats = false): string {
  const i = ((pc % 12) + 12) % 12;
  return preferFlats ? FLATS[i] : SHARPS[i];
}

export function chordName(c: ParsedChord, preferFlats = false): string {
  let n = pcName(c.root, preferFlats) + QUALITY_SUFFIX[c.quality];
  if (c.bass !== undefined && c.bass !== c.root) n += "/" + pcName(c.bass, preferFlats);
  return n;
}

export function transposeChord(c: ParsedChord, semitones: number): ParsedChord {
  return {
    ...c,
    root: (((c.root + semitones) % 12) + 12) % 12,
    bass: c.bass === undefined ? undefined : (((c.bass + semitones) % 12) + 12) % 12,
  };
}

/** Transpose a chord symbol string; returns the original if unparseable. */
export function transposeSymbol(symbol: string, semitones: number, preferFlats = false): string {
  const p = parseChord(symbol);
  if (!p) return symbol;
  return chordName(transposeChord(p, semitones), preferFlats);
}

/** Pitch classes of the chord (root-relative intervals folded into 0-11). */
export function chordPitchClasses(c: ParsedChord): number[] {
  const set = new Set<number>();
  for (const iv of QUALITY_INTERVALS[c.quality]) set.add((c.root + iv) % 12);
  if (c.bass !== undefined) set.add(c.bass);
  return [...set];
}

/** Absolute MIDI notes for a piano voicing, close position from octave 4 (bass in 3 if slash). */
export function chordMidiNotes(c: ParsedChord): number[] {
  const base = 60 + c.root; // C4 = 60
  const notes = QUALITY_INTERVALS[c.quality].map((iv) => base + iv);
  if (c.bass !== undefined && c.bass !== c.root) notes.unshift(48 + c.bass);
  return notes;
}

export const KEY_PREFERS_FLATS: Record<string, boolean> = {
  "F": true, "Bb": true, "Eb": true, "Ab": true, "Db": true, "Gb": true,
  "Dm": true, "Gm": true, "Cm": true, "Fm": true, "Bbm": true, "Ebm": true,
};

/** Given key like "Bb"/"minor", decide if flats should be used for spelling. */
export function keyPrefersFlats(key: string, scale: "major" | "minor"): boolean {
  const k = normalizeKeyName(key);
  return !!KEY_PREFERS_FLATS[scale === "minor" ? k + "m" : k];
}

export function normalizeKeyName(key: string): string {
  const p = parseChord(key);
  if (!p) return key;
  // Prefer conventional spellings: sharps → flats where the flat is the common key
  const idx = p.root;
  const common: Record<number, string> = { 1: "Db", 3: "Eb", 6: "F#", 8: "Ab", 10: "Bb" };
  return common[idx] ?? SHARPS[idx];
}

export function transposeKey(key: string, scale: "major" | "minor", semitones: number): string {
  const p = parseChord(key);
  if (!p) return key;
  const root = (((p.root + semitones) % 12) + 12) % 12;
  const flats = !!KEY_PREFERS_FLATS[scale === "minor" ? FLATS[root] + "m" : FLATS[root]];
  return pcName(root, flats);
}

/** Relative-major / minor helper for display "Am (C major)". */
export function relativeKey(key: string, scale: "major" | "minor"): string {
  const p = parseChord(key);
  if (!p) return "";
  const r = scale === "major" ? (p.root + 9) % 12 : (p.root + 3) % 12;
  return scale === "major" ? pcName(r) + "m" : pcName(r);
}

/** Roman-numeral function of a chord in a key (major keys only, loose). */
export function romanNumeral(c: ParsedChord, key: string, scale: "major" | "minor"): string {
  const k = parseChord(key);
  if (!k) return "";
  const tonic = scale === "minor" ? (k.root + 3) % 12 : k.root; // analyse relative major
  const deg = (((c.root - tonic) % 12) + 12) % 12;
  const map: Record<number, string> = { 0: "I", 2: "II", 4: "III", 5: "IV", 7: "V", 9: "VI", 11: "VII", 1: "♭II", 3: "♭III", 6: "♯IV", 8: "♭VI", 10: "♭VII" };
  const base = map[deg] ?? "";
  return c.quality === "min" || c.quality === "m7" || c.quality === "m6" ? base.toLowerCase() : base;
}

/** Simplification ladder: what easier chord could substitute. */
export function simplify(c: ParsedChord): ParsedChord | null {
  const ladder: Partial<Record<Quality, Quality>> = {
    maj7: "maj", "7": "maj", add9: "maj", "6": "maj", "9": "7", sus2: "maj", sus4: "maj",
    m7: "min", m6: "min", m7b5: "dim", dim7: "dim", aug: "maj",
  };
  if (c.bass !== undefined && c.bass !== c.root) return { ...c, bass: undefined };
  const q = ladder[c.quality];
  if (!q) return null;
  return { ...c, quality: q };
}

export const QUALITIES: Quality[] = ["maj", "min", "7", "maj7", "m7", "sus2", "sus4", "dim", "aug", "add9"];
export { QUALITY_SUFFIX, QUALITY_INTERVALS };
