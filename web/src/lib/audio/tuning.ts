import type { Instrument } from "@/lib/theory/coverage";

export interface TuningString { label: string; midi: number }
export type TuningNameKey = "tuner.standard" | "tuner.dropD" | "tuner.halfDown" | "tuner.reentrant" | "tuner.lowG" | "tuner.baritone" | "tuner.chromaticName";
export interface Tuning { id: string; name: TuningNameKey; strings: TuningString[] }

export const TUNINGS: Record<Instrument, Tuning[]> = {
  guitar: [
    { id: "standard", name: "tuner.standard", strings: [{ label: "E2", midi: 40 }, { label: "A2", midi: 45 }, { label: "D3", midi: 50 }, { label: "G3", midi: 55 }, { label: "B3", midi: 59 }, { label: "E4", midi: 64 }] },
    { id: "drop-d", name: "tuner.dropD", strings: [{ label: "D2", midi: 38 }, { label: "A2", midi: 45 }, { label: "D3", midi: 50 }, { label: "G3", midi: 55 }, { label: "B3", midi: 59 }, { label: "E4", midi: 64 }] },
    { id: "half-down", name: "tuner.halfDown", strings: [{ label: "Eb2", midi: 39 }, { label: "Ab2", midi: 44 }, { label: "Db3", midi: 49 }, { label: "Gb3", midi: 54 }, { label: "Bb3", midi: 58 }, { label: "Eb4", midi: 63 }] },
    { id: "dadgad", name: "tuner.standard", strings: [{ label: "D2", midi: 38 }, { label: "A2", midi: 45 }, { label: "D3", midi: 50 }, { label: "G3", midi: 55 }, { label: "A3", midi: 57 }, { label: "D4", midi: 62 }] },
  ],
  ukulele: [
    { id: "gcea", name: "tuner.reentrant", strings: [{ label: "G4", midi: 67 }, { label: "C4", midi: 60 }, { label: "E4", midi: 64 }, { label: "A4", midi: 69 }] },
    { id: "low-g", name: "tuner.lowG", strings: [{ label: "G3", midi: 55 }, { label: "C4", midi: 60 }, { label: "E4", midi: 64 }, { label: "A4", midi: 69 }] },
    { id: "baritone", name: "tuner.baritone", strings: [{ label: "D3", midi: 50 }, { label: "G3", midi: 55 }, { label: "B3", midi: 59 }, { label: "E4", midi: 64 }] },
  ],
  // Piano is chromatic: every key is a target. Kept as an empty list; the UI switches to chromatic mode.
  piano: [{ id: "chromatic", name: "tuner.chromaticName", strings: [] }],
};

const NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

export function midiToFreq(midi: number, a4 = 440) { return a4 * Math.pow(2, (midi - 69) / 12); }
export function freqToMidi(freq: number, a4 = 440) { return 69 + 12 * Math.log2(freq / a4); }
export function midiName(midi: number) { const r = Math.round(midi); return `${NAMES[((r % 12) + 12) % 12]}${Math.floor(r / 12) - 1}`; }

export interface Reading {
  freq: number;
  midi: number;          // fractional
  nearestMidi: number;   // target (locked string or nearest chromatic note)
  cents: number;         // deviation from target
  targetLabel: string;
  stringIndex: number;   // -1 in chromatic mode
}

/** Resolve a detected frequency against the chosen tuning (or chromatic for piano). */
export function readPitch(freq: number, tuning: Tuning, a4: number, lockedString: number | null): Reading | null {
  if (!freq || freq < 25 || freq > 5000) return null;
  const midi = freqToMidi(freq, a4);
  if (!tuning.strings.length) {
    const nearest = Math.round(midi);
    return { freq, midi, nearestMidi: nearest, cents: (midi - nearest) * 100, targetLabel: midiName(nearest), stringIndex: -1 };
  }
  let idx = lockedString ?? -1;
  if (idx < 0) {
    let best = 0, bestD = Infinity;
    tuning.strings.forEach((s, i) => { const d = Math.abs(midi - s.midi); if (d < bestD) { bestD = d; best = i; } });
    idx = best;
  }
  const target = tuning.strings[idx];
  let cents = (midi - target.midi) * 100;
  // If a locked string is more than an octave off, still show but clamp the needle.
  cents = Math.max(-50, Math.min(50, cents)) === cents ? cents : cents;
  return { freq, midi, nearestMidi: target.midi, cents, targetLabel: target.label, stringIndex: idx };
}

/** Median-of-recent smoothing so the needle doesn't jitter. */
export class PitchSmoother {
  private buf: number[] = [];
  constructor(private size = 5) {}
  push(freq: number): number {
    this.buf.push(freq);
    if (this.buf.length > this.size) this.buf.shift();
    const s = [...this.buf].sort((a, b) => a - b);
    return s[Math.floor(s.length / 2)];
  }
  reset() { this.buf = []; }
}

/** Play a short reference tone for a target note. */
export function playReference(midi: number, a4 = 440, seconds = 1.6) {
  const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new Ctx();
  const f = midiToFreq(midi, a4);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, ctx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + seconds);
  g.connect(ctx.destination);
  // two partials give a plucked-string feel rather than a raw sine
  [1, 2, 3].forEach((h, i) => {
    const o = ctx.createOscillator();
    o.type = "sine";
    o.frequency.value = f * h;
    const pg = ctx.createGain();
    pg.gain.value = [1, 0.35, 0.12][i];
    o.connect(pg).connect(g);
    o.start();
    o.stop(ctx.currentTime + seconds + 0.05);
  });
  setTimeout(() => ctx.close(), (seconds + 0.2) * 1000);
}
