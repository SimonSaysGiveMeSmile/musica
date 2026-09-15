"use client";
import { ChordDiagram, ChordNotes } from "@/components/chords/ChordDiagram";
import type { Instrument } from "@/lib/theory/coverage";

export function ChordGallery({ chords, display, instrument, flats, known, current, onChord }: {
  chords: string[]; display: (s: string) => string; instrument: Instrument; flats: boolean; known: Set<string>; current: string | null; onChord: (c: string) => void;
}) {
  const shown = [...new Set(chords.map(display))];
  return (
    <div>
      <div className="eyebrow mb-3">{shown.length} chords in this song · {instrument}</div>
      <div className={`grid gap-3 ${instrument === "piano" ? "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3" : "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4"}`}>
        {shown.map((c) => {
          const hot = c === current;
          const unknown = !known.has(c);
          return (
            <button key={c} onClick={() => onChord(c)} className={`press inset-group p-3 flex flex-col items-center gap-1 relative transition-shadow ${hot ? "ring-1 ring-gold-hi/70" : ""}`}>
              {hot && <span aria-hidden className="absolute inset-x-0 top-0 h-px gold-line" />}
              <div className="flex items-center gap-2 self-stretch justify-between">
                <span className={`chordname ios-title2 ${hot ? "text-gold-hi" : "text-ivory"}`}>{c}</span>
                <span className={`ios-caption2 font-medium uppercase tracking-wide ${unknown ? "label-3" : "text-gold"}`}>{unknown ? "learn" : "known"}</span>
              </div>
              <ChordDiagram symbol={c} instrument={instrument} size={instrument === "piano" ? 110 : 92} />
              <ChordNotes symbol={c} flats={flats} />
            </button>
          );
        })}
      </div>
    </div>
  );
}
