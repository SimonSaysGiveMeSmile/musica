import { parseChord, type ParsedChord, type Quality, chordName } from "./chords";

/** Fret diagram: frets per string low→high. -1 = muted, 0 = open. fingers optional. */
export interface Voicing {
  frets: number[];
  fingers?: number[];
  baseFret: number;       // 1 = nut visible
  barre?: { fret: number; from: number; to: number };
}

/* ----------------------------- Guitar ----------------------------- */
/* Open-position shapes keyed by chord symbol. Frets low E → high e. */
const GUITAR_OPEN: Record<string, Voicing> = {
  C:     { frets: [-1, 3, 2, 0, 1, 0], fingers: [0, 3, 2, 0, 1, 0], baseFret: 1 },
  D:     { frets: [-1, -1, 0, 2, 3, 2], fingers: [0, 0, 0, 1, 3, 2], baseFret: 1 },
  E:     { frets: [0, 2, 2, 1, 0, 0], fingers: [0, 2, 3, 1, 0, 0], baseFret: 1 },
  F:     { frets: [1, 3, 3, 2, 1, 1], fingers: [1, 3, 4, 2, 1, 1], baseFret: 1, barre: { fret: 1, from: 0, to: 5 } },
  G:     { frets: [3, 2, 0, 0, 0, 3], fingers: [2, 1, 0, 0, 0, 3], baseFret: 1 },
  A:     { frets: [-1, 0, 2, 2, 2, 0], fingers: [0, 0, 1, 2, 3, 0], baseFret: 1 },
  B:     { frets: [-1, 2, 4, 4, 4, 2], fingers: [0, 1, 2, 3, 4, 1], baseFret: 1, barre: { fret: 2, from: 1, to: 5 } },
  Am:    { frets: [-1, 0, 2, 2, 1, 0], fingers: [0, 0, 2, 3, 1, 0], baseFret: 1 },
  Bm:    { frets: [-1, 2, 4, 4, 3, 2], fingers: [0, 1, 3, 4, 2, 1], baseFret: 1, barre: { fret: 2, from: 1, to: 5 } },
  Dm:    { frets: [-1, -1, 0, 2, 3, 1], fingers: [0, 0, 0, 2, 3, 1], baseFret: 1 },
  Em:    { frets: [0, 2, 2, 0, 0, 0], fingers: [0, 2, 3, 0, 0, 0], baseFret: 1 },
  Fm:    { frets: [1, 3, 3, 1, 1, 1], fingers: [1, 3, 4, 1, 1, 1], baseFret: 1, barre: { fret: 1, from: 0, to: 5 } },
  Gm:    { frets: [3, 5, 5, 3, 3, 3], fingers: [1, 3, 4, 1, 1, 1], baseFret: 3, barre: { fret: 3, from: 0, to: 5 } },
  A7:    { frets: [-1, 0, 2, 0, 2, 0], fingers: [0, 0, 2, 0, 3, 0], baseFret: 1 },
  B7:    { frets: [-1, 2, 1, 2, 0, 2], fingers: [0, 2, 1, 3, 0, 4], baseFret: 1 },
  C7:    { frets: [-1, 3, 2, 3, 1, 0], fingers: [0, 3, 2, 4, 1, 0], baseFret: 1 },
  D7:    { frets: [-1, -1, 0, 2, 1, 2], fingers: [0, 0, 0, 2, 1, 3], baseFret: 1 },
  E7:    { frets: [0, 2, 0, 1, 0, 0], fingers: [0, 2, 0, 1, 0, 0], baseFret: 1 },
  G7:    { frets: [3, 2, 0, 0, 0, 1], fingers: [3, 2, 0, 0, 0, 1], baseFret: 1 },
  Am7:   { frets: [-1, 0, 2, 0, 1, 0], fingers: [0, 0, 2, 0, 1, 0], baseFret: 1 },
  Dm7:   { frets: [-1, -1, 0, 2, 1, 1], fingers: [0, 0, 0, 2, 1, 1], baseFret: 1 },
  Em7:   { frets: [0, 2, 0, 0, 0, 0], fingers: [0, 2, 0, 0, 0, 0], baseFret: 1 },
  Cmaj7: { frets: [-1, 3, 2, 0, 0, 0], fingers: [0, 3, 2, 0, 0, 0], baseFret: 1 },
  Dmaj7: { frets: [-1, -1, 0, 2, 2, 2], fingers: [0, 0, 0, 1, 1, 1], baseFret: 1 },
  Fmaj7: { frets: [-1, -1, 3, 2, 1, 0], fingers: [0, 0, 3, 2, 1, 0], baseFret: 1 },
  Gmaj7: { frets: [3, 2, 0, 0, 0, 2], fingers: [3, 1, 0, 0, 0, 2], baseFret: 1 },
  Amaj7: { frets: [-1, 0, 2, 1, 2, 0], fingers: [0, 0, 2, 1, 3, 0], baseFret: 1 },
  Emaj7: { frets: [0, 2, 1, 1, 0, 0], fingers: [0, 3, 1, 2, 0, 0], baseFret: 1 },
  Asus2: { frets: [-1, 0, 2, 2, 0, 0], fingers: [0, 0, 1, 2, 0, 0], baseFret: 1 },
  Asus4: { frets: [-1, 0, 2, 2, 3, 0], fingers: [0, 0, 1, 2, 3, 0], baseFret: 1 },
  Dsus2: { frets: [-1, -1, 0, 2, 3, 0], fingers: [0, 0, 0, 1, 2, 0], baseFret: 1 },
  Dsus4: { frets: [-1, -1, 0, 2, 3, 3], fingers: [0, 0, 0, 1, 2, 3], baseFret: 1 },
  Esus4: { frets: [0, 2, 2, 2, 0, 0], fingers: [0, 1, 2, 3, 0, 0], baseFret: 1 },
  Cadd9: { frets: [-1, 3, 2, 0, 3, 0], fingers: [0, 2, 1, 0, 3, 0], baseFret: 1 },
  Gadd9: { frets: [3, 2, 0, 2, 0, 3], fingers: [2, 1, 0, 3, 0, 4], baseFret: 1 },
  Bdim:  { frets: [-1, 2, 3, 4, 3, -1], fingers: [0, 1, 2, 4, 3, 0], baseFret: 1 },
  "C#dim": { frets: [-1, 4, 5, 6, 5, -1], fingers: [0, 1, 2, 4, 3, 0], baseFret: 4 },
};

/* Barre templates (E-shape root on 6th string, A-shape root on 5th string). Offsets relative to barre fret. */
const E_SHAPES: Partial<Record<Quality, { frets: number[]; fingers: number[] }>> = {
  maj:  { frets: [0, 2, 2, 1, 0, 0], fingers: [1, 3, 4, 2, 1, 1] },
  min:  { frets: [0, 2, 2, 0, 0, 0], fingers: [1, 3, 4, 1, 1, 1] },
  "7":  { frets: [0, 2, 0, 1, 0, 0], fingers: [1, 3, 1, 2, 1, 1] },
  m7:   { frets: [0, 2, 0, 0, 0, 0], fingers: [1, 3, 1, 1, 1, 1] },
  maj7: { frets: [0, -1, 1, 1, 0, -1], fingers: [1, 0, 3, 2, 1, 0] },
  sus4: { frets: [0, 2, 2, 2, 0, 0], fingers: [1, 2, 3, 4, 1, 1] },
  sus2: { frets: [0, 2, 4, 4, 0, 0], fingers: [1, 2, 3, 4, 1, 1] },
  "5":  { frets: [0, 2, 2, -1, -1, -1], fingers: [1, 3, 4, 0, 0, 0] },
};
const A_SHAPES: Partial<Record<Quality, { frets: number[]; fingers: number[] }>> = {
  maj:  { frets: [-1, 0, 2, 2, 2, 0], fingers: [0, 1, 2, 3, 4, 1] },
  min:  { frets: [-1, 0, 2, 2, 1, 0], fingers: [0, 1, 3, 4, 2, 1] },
  "7":  { frets: [-1, 0, 2, 0, 2, 0], fingers: [0, 1, 3, 1, 4, 1] },
  m7:   { frets: [-1, 0, 2, 0, 1, 0], fingers: [0, 1, 3, 1, 2, 1] },
  maj7: { frets: [-1, 0, 2, 1, 2, 0], fingers: [0, 1, 3, 2, 4, 1] },
  sus4: { frets: [-1, 0, 2, 2, 3, 0], fingers: [0, 1, 2, 3, 4, 1] },
  sus2: { frets: [-1, 0, 2, 2, 0, 0], fingers: [0, 1, 3, 4, 1, 1] },
  dim:  { frets: [-1, 0, 1, 2, 1, -1], fingers: [0, 1, 2, 4, 3, 0] },
  dim7: { frets: [-1, 0, 1, 0, 1, -1], fingers: [0, 1, 2, 1, 3, 0] },
  m7b5: { frets: [-1, 0, 1, 0, 1, -1], fingers: [0, 1, 2, 1, 3, 0] },
  aug:  { frets: [-1, 0, 3, 2, 2, 1], fingers: [0, 0, 4, 2, 3, 1] },
  "6":  { frets: [-1, 0, 2, 2, 2, 2], fingers: [0, 1, 2, 2, 2, 2] },
  m6:   { frets: [-1, 0, 2, 2, 1, 2], fingers: [0, 1, 3, 4, 2, 1] },
  add9: { frets: [-1, 0, 2, 2, 2, 2], fingers: [0, 1, 2, 3, 4, 4] },
  "9":  { frets: [-1, 0, 2, 0, 2, 0], fingers: [0, 1, 3, 1, 4, 1] },
  "5":  { frets: [-1, 0, 2, 2, -1, -1], fingers: [0, 1, 3, 4, 0, 0] },
};

function barreVoicing(c: ParsedChord): Voicing | null {
  // Prefer the shape that lands lowest on the neck (fret 1-8).
  const eFret = ((c.root - 4) % 12 + 12) % 12; // E = 0
  const aFret = ((c.root - 9) % 12 + 12) % 12; // A = 0
  const options: Voicing[] = [];
  const eS = E_SHAPES[c.quality];
  if (eS && eFret > 0) {
    options.push({
      frets: eS.frets.map((f) => (f < 0 ? -1 : f + eFret)),
      fingers: eS.fingers,
      baseFret: eFret,
      barre: { fret: eFret, from: 0, to: 5 },
    });
  }
  const aS = A_SHAPES[c.quality];
  if (aS && aFret > 0) {
    const hasBarre = aS.fingers.filter((f) => f === 1).length > 1;
    options.push({
      frets: aS.frets.map((f) => (f < 0 ? -1 : f + aFret)),
      fingers: aS.fingers,
      baseFret: aFret,
      barre: hasBarre ? { fret: aFret, from: 1, to: 5 } : undefined,
    });
  }
  if (!options.length) return null;
  options.sort((a, b) => a.baseFret - b.baseFret);
  return options[0];
}

export function guitarVoicing(symbol: string): Voicing | null {
  const c = parseChord(symbol);
  if (!c) return null;
  const rootOnly: ParsedChord = { ...c, bass: undefined };
  const name = chordName(rootOnly);
  const flatName = chordName(rootOnly, true);
  return GUITAR_OPEN[name] ?? GUITAR_OPEN[flatName] ?? barreVoicing(rootOnly);
}

export function isBarre(v: Voicing | null): boolean {
  return !!v?.barre;
}

/* ----------------------------- Ukulele ----------------------------- */
/* Strings G C E A. */
const UKE_OPEN: Record<string, Voicing> = {
  C: { frets: [0, 0, 0, 3], baseFret: 1 }, D: { frets: [2, 2, 2, 0], baseFret: 1 }, E: { frets: [4, 4, 4, 2], baseFret: 2 },
  F: { frets: [2, 0, 1, 0], baseFret: 1 }, G: { frets: [0, 2, 3, 2], baseFret: 1 }, A: { frets: [2, 1, 0, 0], baseFret: 1 },
  B: { frets: [4, 3, 2, 2], baseFret: 2 }, Bb: { frets: [3, 2, 1, 1], baseFret: 1 }, Eb: { frets: [0, 3, 3, 1], baseFret: 1 },
  Ab: { frets: [5, 3, 4, 3], baseFret: 3 }, Db: { frets: [1, 1, 1, 4], baseFret: 1 }, Gb: { frets: [3, 1, 2, 1], baseFret: 1 },
  Am: { frets: [2, 0, 0, 0], baseFret: 1 }, Bm: { frets: [4, 2, 2, 2], baseFret: 2 }, Cm: { frets: [0, 3, 3, 3], baseFret: 1 },
  Dm: { frets: [2, 2, 1, 0], baseFret: 1 }, Em: { frets: [0, 4, 3, 2], baseFret: 1 }, Fm: { frets: [1, 0, 1, 3], baseFret: 1 },
  Gm: { frets: [0, 2, 3, 1], baseFret: 1 }, Bbm: { frets: [3, 1, 1, 1], baseFret: 1 }, Ebm: { frets: [3, 3, 2, 1], baseFret: 1 },
  "F#m": { frets: [2, 1, 2, 0], baseFret: 1 }, "G#m": { frets: [4, 3, 4, 2], baseFret: 2 }, "C#m": { frets: [1, 1, 0, 0], baseFret: 1 },
  A7: { frets: [0, 1, 0, 0], baseFret: 1 }, B7: { frets: [2, 3, 2, 2], baseFret: 1 }, C7: { frets: [0, 0, 0, 1], baseFret: 1 },
  D7: { frets: [2, 2, 2, 3], baseFret: 1 }, E7: { frets: [1, 2, 0, 2], baseFret: 1 }, F7: { frets: [2, 3, 1, 3], baseFret: 1 },
  G7: { frets: [0, 2, 1, 2], baseFret: 1 }, Am7: { frets: [0, 0, 0, 0], baseFret: 1 }, Dm7: { frets: [2, 2, 1, 3], baseFret: 1 },
  Em7: { frets: [0, 2, 0, 2], baseFret: 1 }, Cmaj7: { frets: [0, 0, 0, 2], baseFret: 1 }, Fmaj7: { frets: [2, 4, 1, 3], baseFret: 1 },
  Gmaj7: { frets: [0, 2, 2, 2], baseFret: 1 }, Dmaj7: { frets: [2, 2, 2, 4], baseFret: 1 }, Amaj7: { frets: [1, 1, 0, 0], baseFret: 1 },
  Asus4: { frets: [2, 2, 0, 0], baseFret: 1 }, Dsus4: { frets: [0, 2, 3, 0], baseFret: 1 }, Gsus4: { frets: [0, 2, 3, 3], baseFret: 1 },
  Csus2: { frets: [0, 2, 3, 3], baseFret: 1 }, Dsus2: { frets: [2, 2, 0, 0], baseFret: 1 }, Asus2: { frets: [2, 4, 5, 2], baseFret: 2 },
  Bdim: { frets: [1, 2, 1, 2], baseFret: 1 }, Cadd9: { frets: [0, 2, 0, 3], baseFret: 1 },
};
const UKE_OPEN_STRINGS = [7, 0, 4, 9]; // G C E A pitch classes

function ukeSearch(c: ParsedChord): Voicing | null {
  // brute-force smallest-span voicing covering all chord tones within frets 0-7
  const need = new Set<number>();
  const ivs = { maj: [0, 4, 7], min: [0, 3, 7], "7": [0, 4, 10], m7: [0, 3, 10], maj7: [0, 4, 11], sus2: [0, 2, 7], sus4: [0, 5, 7], dim: [0, 3, 6], aug: [0, 4, 8], add9: [0, 4, 2], "6": [0, 4, 9], m6: [0, 3, 9], dim7: [0, 3, 9], m7b5: [0, 3, 10], "9": [0, 4, 10], "5": [0, 7] }[c.quality];
  for (const iv of ivs) need.add((c.root + iv) % 12);
  let best: Voicing | null = null; let bestScore = Infinity;
  const rec = (s: number, frets: number[]) => {
    if (s === 4) {
      const pcs = new Set(frets.map((f, i) => (UKE_OPEN_STRINGS[i] + f) % 12));
      for (const n of need) if (!pcs.has(n)) return;
      const pressed = frets.filter((f) => f > 0);
      const max = Math.max(...frets), min = pressed.length ? Math.min(...pressed) : 0;
      const score = max * 2 + (max - min) * 3 + pressed.length;
      if (score < bestScore) { bestScore = score; best = { frets: [...frets], baseFret: min <= 1 ? 1 : min }; }
      return;
    }
    for (let f = 0; f <= 7; f++) rec(s + 1, [...frets, f]);
  };
  rec(0, []);
  return best;
}

export function ukuleleVoicing(symbol: string): Voicing | null {
  const c = parseChord(symbol);
  if (!c) return null;
  const rootOnly: ParsedChord = { ...c, bass: undefined };
  return UKE_OPEN[chordName(rootOnly)] ?? UKE_OPEN[chordName(rootOnly, true)] ?? ukeSearch(rootOnly);
}
