import type { Instrument } from "@/lib/theory/coverage";
import { guitarVoicing, ukuleleVoicing } from "@/lib/theory/voicings";
import { FretDiagram } from "./FretDiagram";
import { PianoDiagram } from "./PianoDiagram";
import { chordPitchClasses, parseChord, pcName } from "@/lib/theory/chords";

export function ChordDiagram({ symbol, instrument, size = 96 }: { symbol: string; instrument: Instrument; size?: number }) {
  if (instrument === "piano") return <PianoDiagram symbol={symbol} width={size * 2} />;
  if (instrument === "ukulele") return <FretDiagram voicing={ukuleleVoicing(symbol)} strings={4} size={size} label={symbol} />;
  return <FretDiagram voicing={guitarVoicing(symbol)} strings={6} size={size} label={symbol} />;
}

export function ChordNotes({ symbol, flats }: { symbol: string; flats?: boolean }) {
  const c = parseChord(symbol);
  if (!c) return null;
  return <span className="label-2 ios-caption tracking-wide">{chordPitchClasses(c).map((p) => pcName(p, flats)).join(" · ")}</span>;
}
