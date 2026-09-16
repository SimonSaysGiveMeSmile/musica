/** Where the music starts again: four-bar phrases, nudged onto a nearby chord change.
 *  Used by the tutorial's "back a section" control and to draw the section marks. */
import type { Analysis } from "@/lib/analysis/types";

const MIN_GAP = 4; // seconds; closer than this and it is not worth its own section

export function sectionStarts(analysis: Pick<Analysis, "beats" | "chords" | "downbeatPhase" | "duration">): number[] {
  const { beats, chords, duration } = analysis;
  const phase = analysis.downbeatPhase % 4;
  const bars = beats.filter((_, i) => i % 4 === phase);
  if (bars.length < 2) return [0];

  const barLen = (bars[bars.length - 1] - bars[0]) / Math.max(1, bars.length - 1);
  const changes = chords.filter((c, i) => c.chord !== "N" && (i === 0 || chords[i - 1].chord !== c.chord)).map((c) => c.start);

  const out: number[] = [0];
  for (let i = 4; i < bars.length; i += 4) {
    let t = bars[i];
    // a chord change within a bar of the phrase line is the better place to restart
    let best = Infinity, snapped = t;
    for (const c of changes) { const d = Math.abs(c - t); if (d < best && d <= barLen) { best = d; snapped = c; } }
    t = snapped;
    if (t - out[out.length - 1] >= MIN_GAP && t < duration - 1) out.push(t);
  }
  return out;
}

/** The section the playhead sits in, and the one before it. */
export function sectionAt(starts: number[], t: number): { index: number; start: number; prev: number } {
  let i = 0;
  while (i + 1 < starts.length && starts[i + 1] <= t + 0.25) i++;
  return { index: i, start: starts[i], prev: starts[Math.max(0, i - 1)] };
}
