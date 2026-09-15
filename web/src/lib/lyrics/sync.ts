import type { LyricLine } from "./lrclib";

const HZ = 2; // vocal activity is sampled per half second

/** Moments where singing begins: rising edges of the smoothed vocal-activity curve. */
export function vocalOnsets(vocals: number[]): number[] {
  const on: number[] = [];
  let prev = 0;
  for (let i = 0; i < vocals.length; i++) {
    const w = (vocals[i - 1] ?? 0) * 0.25 + vocals[i] * 0.5 + (vocals[i + 1] ?? 0) * 0.25;
    const cur = w >= 0.3 ? 1 : 0;
    if (cur && !prev) on.push(i / HZ);
    prev = cur;
  }
  return on;
}

function matchScore(lineTimes: number[], onsets: number[], offset: number, tol = 1.0): number {
  if (!lineTimes.length || !onsets.length) return 0;
  let s = 0;
  for (const t of lineTimes) {
    const tt = t + offset;
    let best = Infinity;
    for (const o of onsets) { const d = Math.abs(o - tt); if (d < best) best = d; }
    if (best <= tol) s += 1 - best / tol;
  }
  return s / lineTimes.length;
}

export interface OffsetEstimate { offset: number; score: number; atZero: number; confident: boolean }

/** Estimate how far a lyric file's timestamps sit from this recording, by matching the starts of
 *  sung phrases against detected vocal onsets. Searches ±12 s; anything larger is a different song. */
export function estimateOffset(lines: LyricLine[], vocals: number[] | undefined): OffsetEstimate | null {
  if (!vocals || vocals.length < 20) return null;
  const timed = lines.filter((l) => l.time >= 0 && l.text.trim()).sort((a, b) => a.time - b.time);
  if (timed.length < 4) return null;
  const onsets = vocalOnsets(vocals);
  if (onsets.length < 3) return null;
  // phrase starts (a line after a pause) coincide with the voice coming back in; use them when there are enough
  const starts = timed.filter((l, i) => i === 0 || l.time - timed[i - 1].time >= 2.5).map((l) => l.time);
  const use = starts.length >= 3 ? starts : timed.map((l) => l.time);
  let best = { off: 0, s: -1 };
  for (let off = -12; off <= 12; off += 0.25) {
    const s = matchScore(use, onsets, off) - Math.abs(off) * 0.001;
    if (s > best.s) best = { off, s };
  }
  const atZero = matchScore(use, onsets, 0);
  const offset = Math.round(best.off * 10) / 10;
  const confident = best.s >= 0.25 && best.s - atZero >= 0.08 && Math.abs(offset) >= 0.5;
  return { offset, score: best.s, atZero, confident };
}
