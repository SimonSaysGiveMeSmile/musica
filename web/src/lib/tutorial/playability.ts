/** Turn a bag of notes into something two human hands can actually play.
 *
 *  Three passes:
 *   1. hands   — split every simultaneity at one point, so the hands never cross
 *   2. limits  — at every instant a hand holds at most five notes inside one octave;
 *                held notes are released early before anything is thrown away
 *   3. fingers — a small dynamic program over finger combinations, scored on stretch,
 *                repeated fingers, hand travel and thumbs landing on black keys
 *   4. repair  — the dynamic program only sees the chord before this one, so a finger can end up
 *                asked to play a new note while it is still holding an old one. This pass walks
 *                the result and settles those, releasing a held note only when nothing else works.
 */
import { MAX_PER_HAND, MAX_SPAN, isBlackKey, type Finger, type Hand, type RawNote, type TutorialNote } from "./types";

/** Notes starting within this of each other are one chord to the hand. */
const GROUP = 0.05;

export interface PlayableOptions {
  maxSpan?: number;
  maxPerHand?: number;
  /** Notes shorter than this are dropped as transcription dust. */
  minDur?: number;
}

export interface PlayableResult { notes: TutorialNote[]; dropped: number }

interface Work extends RawNote { hand: Hand; weight: number }

/** How much this note matters: outer voices (melody, bass) and long notes survive first. */
function weigh(n: RawNote, lowest: number, highest: number): number {
  let w = Math.min(1, (n.end - n.start) / 0.6);
  if (n.midi === highest) w += 2;     // the tune
  if (n.midi === lowest) w += 1.5;    // the bass
  return w;
}

/** Middle C: by convention the left hand works below it and the right hand above. */
const SPLIT = 60;

/** Split one simultaneity between the hands at the point that suits where the hands already are. */
function splitGroup(group: Work[], centre: { l: number; r: number }, maxSpan: number, maxPer: number): void {
  const sorted = [...group].sort((a, b) => a.midi - b.midi);
  let best = 0, bestCost = Infinity;
  for (let k = 0; k <= sorted.length; k++) {
    const lo = sorted.slice(0, k), hi = sorted.slice(k);
    let cost = 0;
    for (const n of lo) cost += Math.abs(n.midi - centre.l) + Math.max(0, n.midi - SPLIT) * 0.6;
    for (const n of hi) cost += Math.abs(n.midi - centre.r) + Math.max(0, SPLIT - n.midi) * 0.6;
    for (const part of [lo, hi]) {
      if (!part.length) continue;
      const span = part[part.length - 1].midi - part[0].midi;
      cost += Math.max(0, span - maxSpan) * 40 + Math.max(0, part.length - maxPer) * 60;
    }
    if (cost < bestCost) { bestCost = cost; best = k; }
  }
  sorted.forEach((n, i) => { n.hand = i < best ? "l" : "r"; });
  const lo = sorted.slice(0, best), hi = sorted.slice(best);
  if (lo.length) centre.l = (lo[0].midi + lo[lo.length - 1].midi) / 2;
  if (hi.length) centre.r = (hi[0].midi + hi[hi.length - 1].midi) / 2;
}

const spanOf = (ns: Work[]) => (ns.length ? Math.max(...ns.map((n) => n.midi)) - Math.min(...ns.map((n) => n.midi)) : 0);
const breaks = (ns: Work[], maxSpan: number, maxPer: number) => ns.length > maxPer || spanOf(ns) > maxSpan;

export function makePlayable(raw: RawNote[], opts: PlayableOptions = {}): PlayableResult {
  const maxSpan = opts.maxSpan ?? MAX_SPAN;
  const maxPer = opts.maxPerHand ?? MAX_PER_HAND;
  const minDur = opts.minDur ?? 0.05;

  const clean = raw
    .filter((n) => Number.isFinite(n.midi) && Number.isFinite(n.start) && Number.isFinite(n.end))
    .filter((n) => n.midi >= 21 && n.midi <= 108 && n.end - n.start >= minDur)
    .map((n) => ({ midi: Math.round(n.midi), start: n.start, end: n.end, hand: "r" as Hand, weight: 0 }))
    .sort((a, b) => a.start - b.start || a.midi - b.midi);
  if (!clean.length) return { notes: [], dropped: 0 };

  // de-duplicate: the same pitch restarting inside its own tail is one note
  const byPitch = new Map<number, Work>();
  const deduped: Work[] = [];
  for (const n of clean) {
    const prev = byPitch.get(n.midi);
    if (prev && n.start < prev.end - 0.03) { prev.end = Math.max(prev.end, n.end); continue; }
    byPitch.set(n.midi, n);
    deduped.push(n);
  }

  // 1. group into simultaneities, then hand each one out
  const groups: Work[][] = [];
  for (const n of deduped) {
    const g = groups[groups.length - 1];
    if (g && n.start - g[0].start <= GROUP) g.push(n);
    else groups.push([n]);
  }
  const centre = { l: 53, r: 67 }; // F3 and G4, where the hands sit before the music says otherwise
  for (const g of groups) {
    const lowest = Math.min(...g.map((n) => n.midi)), highest = Math.max(...g.map((n) => n.midi));
    for (const n of g) n.weight = weigh(n, lowest, highest);
    splitGroup(g, centre, maxSpan, maxPer);
  }

  // 2. enforce the limits over time: release what is held before dropping what is new
  let dropped = 0;
  const kept: Work[] = [];
  const active: Record<Hand, Work[]> = { l: [], r: [] };
  for (const g of groups) {
    const t = g[0].start;
    for (const h of ["l", "r"] as Hand[]) active[h] = active[h].filter((n) => n.end > t + 1e-4);
    for (const h of ["l", "r"] as Hand[]) {
      const incoming = g.filter((n) => n.hand === h);
      if (!incoming.length) continue;
      // release held notes, furthest from the new hand position first, until the hand fits
      while (active[h].length && breaks([...active[h], ...incoming], maxSpan, maxPer)) {
        const mid = incoming.reduce((s, n) => s + n.midi, 0) / incoming.length;
        let victim = 0;
        for (let i = 1; i < active[h].length; i++) if (Math.abs(active[h][i].midi - mid) > Math.abs(active[h][victim].midi - mid)) victim = i;
        const v = active[h][victim];
        if (t - v.start < 0.08) { v.end = v.start; dropped++; } // too short to be worth striking
        else v.end = t;                                          // lift the finger as the next note lands
        active[h].splice(victim, 1);
      }
      // still impossible: the new chord itself is too big, so the weakest voices go
      while (breaks(incoming, maxSpan, maxPer)) {
        let weakest = 0;
        for (let i = 1; i < incoming.length; i++) if (incoming[i].weight < incoming[weakest].weight) weakest = i;
        const [gone] = incoming.splice(weakest, 1);
        gone.end = gone.start; // marks it removed
        dropped++;
      }
      for (const n of incoming) { kept.push(n); active[h].push(n); }
    }
  }
  const survivors = kept.filter((n) => n.end > n.start).sort((a, b) => a.start - b.start || a.midi - b.midi);
  uncross(survivors);

  // 3. fingers, one hand at a time, then 4. settle them against whatever is still held
  const out: TutorialNote[] = [];
  for (const h of ["l", "r"] as Hand[]) {
    const fingered = fingerHand(survivors.filter((n) => n.hand === h), h);
    settleHeld(fingered, h);
    out.push(...fingered);
  }
  out.sort((a, b) => a.start - b.start || a.midi - b.midi);
  return { notes: out.filter((n) => n.end - n.start > 0.02), dropped };
}

/* ----------------------------- fingering ----------------------------- */

/** Comfortable reach in semitones between two fingers of one hand, and the tightest they sit happily. */
const REACH: Record<number, Record<number, number>> = {
  1: { 2: 8, 3: 10, 4: 11, 5: 13 }, 2: { 3: 4, 4: 6, 5: 8 }, 3: { 4: 3, 5: 5 }, 4: { 5: 3 },
};
const TIGHT: Record<number, Record<number, number>> = {
  1: { 2: 1, 3: 2, 4: 3, 5: 4 }, 2: { 3: 1, 4: 2, 5: 3 }, 3: { 4: 1, 5: 2 }, 4: { 5: 1 },
};
const reach = (a: number, b: number) => (a < b ? REACH[a]?.[b] : REACH[b]?.[a]) ?? 12;
const tight = (a: number, b: number) => (a < b ? TIGHT[a]?.[b] : TIGHT[b]?.[a]) ?? 0;

/** Every ascending choice of k fingers out of five. */
function combinations(k: number): Finger[][] {
  const all: Finger[][] = [];
  const walk = (start: number, acc: Finger[]) => {
    if (acc.length === k) { all.push([...acc]); return; }
    for (let f = start; f <= 5; f++) walk(f + 1, [...acc, f as Finger]);
  };
  walk(1, []);
  return all;
}
const COMBOS: Finger[][][] = [[], combinations(1), combinations(2), combinations(3), combinations(4), combinations(5)];

/** What it costs this hand to hold one chord with one finger choice. */
function shapeCost(midis: number[], fingers: Finger[]): number {
  let cost = 0;
  for (let i = 0; i + 1 < midis.length; i++) {
    const d = midis[i + 1] - midis[i], a = fingers[i], b = fingers[i + 1];
    cost += Math.max(0, d - reach(a, b)) * 1.6 + Math.max(0, tight(a, b) - d) * 0.7;
  }
  if (midis.length > 1) {
    const d = midis[midis.length - 1] - midis[0];
    cost += Math.max(0, d - reach(fingers[0], fingers[fingers.length - 1])) * 1.4;
  }
  for (let i = 0; i < midis.length; i++) {
    if (fingers[i] === 1 && isBlackKey(midis[i])) cost += 1.1;   // thumbs dislike black keys
    if (fingers[i] === 5 && isBlackKey(midis[i])) cost += 0.4;
  }
  return cost;
}

/** What it costs to get from one chord shape to the next. */
function moveCost(prev: { midis: number[]; fingers: Finger[] }, cur: { midis: number[]; fingers: Finger[] }): number {
  let cost = 0;
  const prevOf = new Map<Finger, number>();
  prev.fingers.forEach((f, i) => prevOf.set(f, prev.midis[i]));
  cur.fingers.forEach((f, i) => {
    const was = prevOf.get(f);
    if (was === undefined) return;
    cost += was === cur.midis[i] ? -0.5 : 1.2 + Math.abs(cur.midis[i] - was) * 0.15;
  });
  const mid = (a: number[]) => (a[0] + a[a.length - 1]) / 2;
  cost += Math.abs(mid(cur.midis) - mid(prev.midis)) * 0.1;
  // stepwise single notes: reward neighbouring fingers, allow the thumb to pass under
  if (prev.midis.length === 1 && cur.midis.length === 1) {
    const step = cur.midis[0] - prev.midis[0], a = prev.fingers[0], b = cur.fingers[0];
    if (Math.abs(step) <= 2 && step !== 0) {
      const up = step > 0;
      if ((up && b === a + 1) || (!up && b === a - 1)) cost -= 0.8;
      else if (up && a >= 3 && b === 1) cost -= 0.2;           // thumb under, going up
      else if (!up && a === 1 && b >= 3) cost -= 0.2;          // hand over the thumb, coming down
      else if ((up && b < a) || (!up && b > a)) cost += 1.5;
    }
  }
  return cost;
}

/** Dynamic program over the chord shapes of one hand. */
function fingerHand(notes: Work[], hand: Hand): TutorialNote[] {
  if (!notes.length) return [];
  const groups: Work[][] = [];
  for (const n of notes) {
    const g = groups[groups.length - 1];
    if (g && n.start - g[0].start <= GROUP) g.push(n);
    else groups.push([n]);
  }
  const shapes = groups.map((g) => {
    const midis = g.map((n) => n.midi).sort((a, b) => a - b);
    // the left hand numbers its fingers the other way round: thumb on the highest note
    const options = COMBOS[Math.min(5, midis.length)].map((c) => (hand === "l" ? ([...c].reverse() as Finger[]) : c));
    return { midis, options };
  });

  const n = shapes.length;
  const dp: number[][] = [], back: number[][] = [];
  for (let i = 0; i < n; i++) {
    const opts = shapes[i].options;
    dp.push(new Array<number>(opts.length).fill(Infinity));
    back.push(new Array<number>(opts.length).fill(0));
    for (let j = 0; j < opts.length; j++) {
      const own = shapeCost(shapes[i].midis, opts[j]);
      if (i === 0) { dp[i][j] = own; continue; }
      for (let k = 0; k < shapes[i - 1].options.length; k++) {
        const c = dp[i - 1][k] + own + moveCost(
          { midis: shapes[i - 1].midis, fingers: shapes[i - 1].options[k] },
          { midis: shapes[i].midis, fingers: opts[j] },
        );
        if (c < dp[i][j]) { dp[i][j] = c; back[i][j] = k; }
      }
    }
  }
  let j = 0;
  for (let k = 1; k < dp[n - 1].length; k++) if (dp[n - 1][k] < dp[n - 1][j]) j = k;
  const chosen = new Array<number>(n);
  for (let i = n - 1; i >= 0; i--) { chosen[i] = j; j = back[i][j]; }

  const out: TutorialNote[] = [];
  for (let i = 0; i < n; i++) {
    const { midis, options } = shapes[i];
    const fingers = options[chosen[i]];
    for (const note of groups[i]) {
      const idx = midis.indexOf(note.midi);
      out.push({ midi: note.midi, start: note.start, end: note.end, hand, finger: fingers[Math.max(0, idx)] });
    }
  }
  return out;
}

/* ----------------------------- holding on ----------------------------- */

/** The hands never reach across each other. Splitting each chord keeps that true at the moment
 *  it is struck; a note held on afterwards can still end up on the wrong side, so it is let go. */
function uncross(notes: Work[]): void {
  const held: Work[] = [];
  for (const n of notes) {
    for (let i = held.length - 1; i >= 0; i--) if (held[i].end <= n.start + 1e-6) held.splice(i, 1);
    for (let i = held.length - 1; i >= 0; i--) {
      const h = held[i];
      if (h.hand === n.hand || h.start >= n.start - 1e-6) continue;
      if (h.hand === "l" ? h.midi > n.midi : h.midi < n.midi) { h.end = n.start; held.splice(i, 1); }
    }
    held.push(n);
  }
}

/** One number that makes both hands read the same way: fingers run left to right across the keys. */
const order = (f: Finger, hand: Hand) => (hand === "r" ? f : 6 - f);

/** Fingers for a chord that sit correctly beside every note still held, as close as possible to
 *  what the fingering pass chose. Null when no such choice exists. */
function beside(chord: TutorialNote[], held: TutorialNote[], hand: Hand): { note: TutorialNote; finger: Finger }[] | null {
  const taken = new Set(held.map((h) => h.finger));
  const free = ([1, 2, 3, 4, 5] as Finger[]).filter((f) => !taken.has(f));
  if (chord.length > free.length) return null;
  const sorted = [...chord].sort((a, b) => a.midi - b.midi);
  let best: { cost: number; fingers: Finger[] } | null = null;

  const walk = (i: number, used: Finger[], cost: number) => {
    if (best && cost >= best.cost) return;
    if (i === sorted.length) { best = { cost, fingers: used }; return; }
    for (const f of free) {
      if (used.includes(f)) continue;
      if (used.length && order(f, hand) <= order(used[used.length - 1], hand)) continue;  // the hand cannot fold over itself
      let ok = true;
      for (const h of held) {
        if (h.midi === sorted[i].midi) continue;
        // a finger holding a lower key has to stay to the left of one taking a higher key
        const oh = order(h.finger, hand), of = order(f, hand);
        if (h.midi < sorted[i].midi ? oh >= of : oh <= of) { ok = false; break; }
      }
      if (ok) walk(i + 1, [...used, f], cost + (f === sorted[i].finger ? 0 : 1));
    }
  };
  walk(0, [], 0);
  return best ? sorted.map((n, k) => ({ note: n, finger: best!.fingers[k] })) : null;
}

/** Walk one hand's part and make every moment physically possible. */
function settleHeld(notes: TutorialNote[], hand: Hand): void {
  const chords: TutorialNote[][] = [];
  for (const n of [...notes].sort((a, b) => a.start - b.start)) {
    const g = chords[chords.length - 1];
    if (g && n.start - g[0].start <= GROUP) g.push(n); else chords.push([n]);
  }
  const held: TutorialNote[] = [];
  for (const chord of chords) {
    const t = chord[0].start;
    for (let i = held.length - 1; i >= 0; i--) if (held[i].end <= t + 1e-6) held.splice(i, 1);
    for (;;) {
      const fix = beside(chord, held, hand);
      if (fix) { for (const { note, finger } of fix) note.finger = finger; break; }
      if (!held.length) break;                      // nothing left to give up; leave it as the program chose
      // let go of whatever is furthest from what is being played now
      const centre = chord.reduce((sum, n) => sum + n.midi, 0) / chord.length;
      let worst = 0;
      for (let i = 1; i < held.length; i++) if (Math.abs(held[i].midi - centre) > Math.abs(held[worst].midi - centre)) worst = i;
      held[worst].end = Math.min(held[worst].end, t);
      held.splice(worst, 1);
    }
    held.push(...chord);
  }
}
