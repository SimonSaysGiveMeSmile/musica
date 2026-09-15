import { parseChord, chordName, transposeChord, simplify, type ParsedChord } from "./chords";
import { guitarVoicing, isBarre } from "./voicings";

export type Instrument = "guitar" | "piano" | "ukulele";

export interface CoverageOption {
  capo: number;         // 0-7 (guitar/uke)
  transpose: number;    // semitones applied to the written chords (display key shift)
  shapes: string[];     // distinct chord shapes the player fingers
  known: string[];
  unknown: string[];
  coverage: number;     // 0-1
  barres: number;
  reason: string;
  swaps: string[];      // e.g. "F→D" for the top few chords that turn into known shapes
}

/** Normalise a set of chord symbols to canonical names. */
export function canon(symbols: Iterable<string>): string[] {
  const out = new Set<string>();
  for (const s of symbols) { const p = parseChord(s); if (p) out.add(chordName({ ...p, bass: undefined })); }
  return [...out];
}

/** Which shape do you finger for a sounding chord with a capo? shape = chord - capo. */
export function shapeForCapo(c: ParsedChord, capo: number): ParsedChord {
  return transposeChord(c, -capo);
}

export function evaluateOptions(
  songChords: string[],
  knownChords: string[],
  instrument: Instrument,
  maxCapo = 7,
): CoverageOption[] {
  const known = new Set(canon(knownChords));
  const parsed = songChords.map(parseChord).filter((c): c is ParsedChord => !!c).map((c) => ({ ...c, bass: undefined }));
  const distinct = new Map<string, ParsedChord>();
  for (const c of parsed) distinct.set(chordName(c), c);
  const chords = [...distinct.values()];
  const options: CoverageOption[] = [];

  const evaluate = (capo: number, transpose: number) => {
    const shapes = chords.map((c) => shapeForCapo(transposeChord(c, transpose), capo));
    const shapeNames = [...new Set(shapes.map((s) => chordName(s)))];
    const k = shapeNames.filter((n) => known.has(n));
    const u = shapeNames.filter((n) => !known.has(n));
    const barres = instrument === "guitar" ? shapeNames.filter((n) => isBarre(guitarVoicing(n))).length : 0;
    options.push({
      capo, transpose, shapes: shapeNames, known: k, unknown: u,
      coverage: shapeNames.length ? k.length / shapeNames.length : 1, barres, reason: "", swaps: [],
    });
  };

  if (instrument === "piano") {
    for (let t = -6; t <= 6; t++) evaluate(0, t);
  } else {
    for (let capo = 0; capo <= maxCapo; capo++) evaluate(capo, 0);
    // also allow pure transposition without capo (sing in another key)
    for (let t = -5; t <= 6; t++) if (t !== 0) evaluate(0, t);
  }

  for (const o of options) { o.swaps = swapsFor(o, chords); o.reason = describe(o); }
  options.sort((a, b) =>
    b.coverage - a.coverage || a.barres - b.barres || Math.abs(a.transpose) - Math.abs(b.transpose) || a.capo - b.capo,
  );
  return options;
}

function swapsFor(o: CoverageOption, chords: ParsedChord[]): string[] {
  const swaps: string[] = [];
  for (const c of chords.slice(0, 6)) {
    const shape = chordName(shapeForCapo(transposeChord(c, o.transpose), o.capo));
    const orig = chordName(c);
    if (shape !== orig && o.known.includes(shape)) swaps.push(`${orig}→${shape}`);
  }
  return swaps.slice(0, 3);
}

/** English fallback; the UI rebuilds this from the fields in the user's language. */
function describe(o: CoverageOption): string {
  const pct = Math.round(o.coverage * 100);
  const where = o.capo ? `Capo ${o.capo}` : o.transpose ? `Transpose ${o.transpose > 0 ? "+" : ""}${o.transpose}` : "As written";
  if (o.unknown.length === 0) return `${where} · every chord is one you know`;
  return `${where} · ${pct}% known${o.swaps.length ? ` · ${o.swaps.join(", ")}` : ""}`;
}

export type SuggestionKind = "playInstead" | "simplifyTo" | "barre" | "newChord";
export interface Suggestion { chord: string; easier: string | null; kind: SuggestionKind }

export function suggestions(unknown: string[], known: string[]): Suggestion[] {
  const k = new Set(canon(known));
  return unknown.map((u) => {
    const p = parseChord(u);
    if (!p) return { chord: u, easier: null, kind: "newChord" as const };
    const s = simplify(p);
    if (s) {
      const name = chordName(s);
      return { chord: u, easier: name, kind: k.has(name) ? ("playInstead" as const) : ("simplifyTo" as const) };
    }
    const v = guitarVoicing(u);
    if (isBarre(v)) return { chord: u, easier: null, kind: "barre" as const };
    return { chord: u, easier: null, kind: "newChord" as const };
  });
}
