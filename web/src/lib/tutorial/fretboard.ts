/** Laying notes out on a fretboard: which string to play each note on, at which fret, with
 *  which finger. The rules are the ones a teacher would give — keep the hand in one position,
 *  take the open string when it is there, never ask for two notes on one string at once, and
 *  lift a finger off a ringing note rather than demand a stretch nobody has. */
import type { RawNote, TutorialNote } from "./types";

export type FretTuning = number[];   // open-string MIDI notes, low to high

export const TUNING: Record<"guitar" | "ukulele", FretTuning> = {
  guitar: [40, 45, 50, 55, 59, 64],   // E2 A2 D3 G3 B3 E4
  ukulele: [67, 60, 64, 69],          // G4 C4 E4 A4, re-entrant
};

const GROUP = 0.05;     // notes starting this close together are one shape
const MAX_FRET = 15;

/** How far apart the lowest and highest stopped fret may be. Frets crowd together as you go up
 *  the neck, so the same hand covers more of them there. */
const spanLimit = (fret: number) => (fret <= 4 ? 4 : fret <= 9 ? 5 : 6);

interface Held { note: TutorialNote; string: number; fret: number }

/** Every way to put these notes on distinct strings without the shape crossing over itself. */
function placements(midis: number[], tuning: FretTuning, maxFret: number): number[][] {
  const out: number[][] = [];
  const walk = (i: number, from: number, picked: number[]) => {
    if (i === midis.length) { out.push(picked.slice()); return; }
    if (out.length > 400) return;
    for (let s = from; s < tuning.length; s++) {
      const fret = midis[i] - tuning[s];
      if (fret < 0 || fret > maxFret) continue;
      picked.push(s);
      walk(i + 1, s + 1, picked);
      picked.pop();
    }
  };
  walk(0, 0, []);
  return out;
}

/** What one shape asks of the hand, given what is already ringing: the stretch, the travel, and
 *  which held notes would have to be let go. Infinity means the shape itself does not fit a hand. */
function weigh(frets: number[], strings: number[], held: Held[], hand: number) {
  const stopped = frets.filter((f) => f > 0);
  let lo = stopped.length ? Math.min(...stopped) : null;
  let hi = stopped.length ? Math.max(...stopped) : null;
  if (lo !== null && hi !== null && hi - lo > spanLimit(lo)) return null;

  const used = new Set(strings);
  const centre = lo !== null && hi !== null ? (lo + hi) / 2 : hand;
  const keep = held
    .filter((h) => !used.has(h.string) && h.fret > 0)
    .sort((a, b) => Math.abs(a.fret - centre) - Math.abs(b.fret - centre));
  const release: Held[] = [];
  for (const h of keep) {
    const nl = lo === null ? h.fret : Math.min(lo, h.fret);
    const nh = hi === null ? h.fret : Math.max(hi, h.fret);
    if (nh - nl <= spanLimit(nl)) { lo = nl; hi = nh; } else release.push(h);
  }

  const open = frets.length - stopped.length;
  const stretch = lo !== null && hi !== null ? hi - lo : 0;
  const pos = lo !== null && hi !== null ? (lo + hi) / 2 : hand;
  const cost = stretch * 1.1 + Math.abs(pos - hand) * 0.75 + pos * 0.05 - open * 0.7 + release.length * 1.6;
  return { cost, release, lo, hi };
}

export interface FretPlan { notes: TutorialNote[]; dropped: number }

/** Lay a stream of notes onto the fretboard. */
export function makeFretted(raw: RawNote[], tuning: FretTuning, maxFret = MAX_FRET): FretPlan {
  const sorted = raw.slice().sort((a, b) => a.start - b.start || a.midi - b.midi);
  const groups: RawNote[][] = [];
  for (const n of sorted) {
    const g = groups[groups.length - 1];
    if (g && n.start - g[0].start <= GROUP) g.push(n); else groups.push([n]);
  }

  const out: TutorialNote[] = [];
  const ringing: (Held | null)[] = tuning.map(() => null);
  let hand = 2, base = 1, dropped = 0;

  // anything below the lowest string or above the top fret is played an octave over instead of lost
  const lowest = Math.min(...tuning), highest = Math.max(...tuning) + maxFret;
  const inReach = (m: number) => {
    while (m < lowest) m += 12;
    while (m > highest) m -= 12;
    return m >= lowest && m <= highest ? m : null;
  };

  for (const group of groups) {
    const at = group[0].start;
    // one note per pitch, and never more of them than there are strings
    const seen = new Set<number>();
    const byMidi = new Map<number, RawNote>();
    let midis: number[] = [];
    for (const n of group) {
      const m = inReach(n.midi);
      if (m === null) { dropped++; continue; }
      if (seen.has(m)) continue;
      seen.add(m);
      midis.push(m);
      byMidi.set(m, n);
    }
    if (!midis.length) continue;
    midis.sort((a, b) => a - b);
    if (midis.length > tuning.length) {
      // keep the melody on top and the bass underneath; the inner voices are the ones nobody misses
      const keep = new Set([midis[0], midis[midis.length - 1]]);
      for (let i = midis.length - 2; i > 0 && keep.size < tuning.length; i--) keep.add(midis[i]);
      dropped += midis.length - keep.size;
      midis = midis.filter((m) => keep.has(m));
    }

    const held = ringing.filter((h): h is Held => !!h && h.note.end > at + 1e-6);
    let best: { strings: number[]; frets: number[]; cost: number; release: Held[]; lo: number | null; hi: number | null } | null = null;
    let use = midis;
    while (use.length) {
      for (const strings of placements(use, tuning, maxFret)) {
        const frets = strings.map((s, i) => use[i] - tuning[s]);
        const w = weigh(frets, strings, held, hand);
        if (!w) continue;
        if (!best || w.cost < best.cost) best = { strings, frets, cost: w.cost, release: w.release, lo: w.lo, hi: w.hi };
      }
      if (best) break;
      // nothing fits as a whole: let an inner voice go and try again
      dropped++;
      if (use.length === 1) { use = []; break; }
      use = use.length > 2 ? [use[0], ...use.slice(2)] : [use[use.length - 1]];
    }
    if (!best) continue;

    for (const h of best.release) { h.note.end = Math.min(h.note.end, at); ringing[h.string] = null; }
    if (best.lo !== null && best.hi !== null) {
      // the hand only shifts when the music leaves the position it is already in
      if (best.lo < base) base = best.lo;
      else if (best.hi > base + spanLimit(base)) base = Math.max(best.lo, best.hi - spanLimit(best.lo));
      hand = (best.lo + best.hi) / 2;
    }

    best.strings.forEach((s, i) => {
      const src = byMidi.get(use[i])!;
      const prev = ringing[s];
      if (prev && prev.note.end > src.start) prev.note.end = src.start;   // the string has to be free to be struck
      const fret = best!.frets[i];
      // the index finger sits at the bottom of the shape and the others follow it up the neck
      const finger = (fret > 0 ? Math.max(1, Math.min(4, fret - base + 1)) : 0) as TutorialNote["finger"];
      const note: TutorialNote = { midi: use[i], start: src.start, end: src.end, hand: "r", finger, string: s, fret };
      ringing[s] = { note, string: s, fret };
      out.push(note);
    });
  }

  return {
    notes: out.filter((n) => n.end - n.start > 0.03).sort((a, b) => a.start - b.start || a.midi - b.midi),
    dropped,
  };
}
