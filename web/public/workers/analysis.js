/* Musica analysis worker — Essentia.js (WASM). Plain JS on purpose: no bundler involvement. */
/* global importScripts, EssentiaWASM, Essentia */
/* The version comes from this worker's own URL (client.ts ANALYSIS_VERSION), and is applied to every essentia file. */
const V = (new URL(self.location.href).searchParams.get("v")) || "0";
importScripts(`/essentia/essentia-wasm.web.js?v=${V}`, `/essentia/essentia.js-core.umd.min.js?v=${V}`);

let essentia = null;
let wasm = null;
const ready = EssentiaWASM({ locateFile: (p) => `/essentia/${p}?v=${V}` }).then((m) => {
  wasm = m;
  essentia = new Essentia(m);
  postMessage({ type: "ready", version: essentia.version });
});

const FRAME = 4096;
const HOP = 2048;

function hpcpFrame(frameVec, sr) {
  const w = essentia.Windowing(frameVec, true, FRAME, "blackmanharris62");
  const sp = essentia.Spectrum(w.frame, FRAME);
  const pk = essentia.SpectralPeaks(sp.spectrum, 0, 3500, 100, 60, "frequency", sr);
  const h = essentia.HPCP(pk.frequencies, pk.magnitudes, true, 500, 0, 3500, false, 60, true, "unitMax", 440, sr, 12, "squaredCosine", 1);
  w.frame.delete(); sp.spectrum.delete(); pk.frequencies.delete(); pk.magnitudes.delete();
  return { hpcp: h.hpcp, spectrum: null };
}

function waveformPeaks(audio, buckets) {
  const out = new Float32Array(buckets);
  const per = Math.max(1, Math.floor(audio.length / buckets));
  for (let b = 0; b < buckets; b++) {
    let m = 0;
    const s = b * per, e = Math.min(audio.length, s + per);
    for (let i = s; i < e; i += 4) { const v = Math.abs(audio[i]); if (v > m) m = v; }
    out[b] = m;
  }
  return out;
}

/* ------------------- beat-synchronous Viterbi chord decoding ------------------- */
/* Essentia HPCP bin 0 is A (reference 440 Hz); templates below are rotated accordingly. */
/* ------------------- beat-synchronous Viterbi chord decoding ------------------- */
/* Essentia HPCP bin 0 is A (reference 440 Hz); templates are rotated accordingly.
   Chord changes are cheap on estimated downbeats and expensive mid-bar, which
   matches how songs actually move. */
const NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const HPCP_OFFSET = 9;
function makeTemplates(wRoot, wThird, wFifth) {
  const T = [];
  for (let r = 0; r < 12; r++) {
    const maj = new Float32Array(12), min = new Float32Array(12);
    const b = (pc) => ((pc - HPCP_OFFSET) % 12 + 12) % 12;
    maj[b(r)] = wRoot; maj[b(r + 4)] = wThird; maj[b(r + 7)] = wFifth;
    min[b(r)] = wRoot; min[b(r + 3)] = wThird; min[b(r + 7)] = wFifth;
    T.push({ name: NAMES[r], v: maj }); T.push({ name: NAMES[r] + "m", v: min });
  }
  return T;
}
const ENHARMONIC = { Ab: "G#", Bb: "A#", Db: "C#", Eb: "D#", Gb: "F#" };
function diatonicSet(key, scale) { const kr = NAMES.indexOf(ENHARMONIC[key] || key); const set = new Set(); if (kr < 0) return set; const steps = scale === "major" ? [0, 2, 4, 5, 7, 9, 11] : [0, 2, 3, 5, 7, 8, 10]; const quals = scale === "major" ? ["", "m", "m", "", "", "m", "dim"] : ["m", "dim", "", "m", "m", "", ""]; steps.forEach((s, i) => { if (quals[i] !== "dim") set.add(NAMES[(kr + s) % 12] + quals[i]); }); return set; }

function decodeChords(hpcpFrames, frameTimes, beats, duration, key, scale, opts = {}) {
  const { downPenalty = 0.5, midPenalty = 1.4, offPenalty = 2.2, keyBonus = 0.03, wThird = 1.15 } = opts;
  const TEMPLATES = makeTemplates(1, wThird, 0.95);
  const K = TEMPLATES.length; const diat = diatonicSet(key, scale); const nB = beats.length; if (!nB) return [];
  const B = []; let f = 0;
  for (let i = 0; i < nB; i++) {
    const t0 = beats[i], t1 = i + 1 < nB ? beats[i + 1] : duration; const acc = new Float32Array(12); let c = 0;
    while (f < hpcpFrames.length && frameTimes[f] < t0) f++; let g = f;
    while (g < hpcpFrames.length && frameTimes[g] < t1) { const h = hpcpFrames[g]; for (let k = 0; k < 12; k++) acc[k] += h[k]; c++; g++; }
    if (c === 0) { const h = hpcpFrames[Math.min(f, hpcpFrames.length - 1)]; for (let k = 0; k < 12; k++) acc[k] = h[k]; }
    let nrm = 0; for (let k = 0; k < 12; k++) nrm += acc[k] * acc[k]; nrm = Math.sqrt(nrm) || 1; for (let k = 0; k < 12; k++) acc[k] /= nrm; B.push(acc);
  }
  // downbeat phase: where chroma changes most
  const phaseScore = [0, 0, 0, 0];
  for (let i = 1; i < nB; i++) { let d = 0; for (let k = 0; k < 12; k++) d += B[i][k] * B[i - 1][k]; phaseScore[i % 4] += 1 - d; }
  let phase = 0; for (let p = 1; p < 4; p++) if (phaseScore[p] > phaseScore[phase]) phase = p;
  const tn = TEMPLATES.map((t) => { let n = 0; for (let k = 0; k < 12; k++) n += t.v[k] * t.v[k]; return Math.sqrt(n); });
  const E = B.map((b) => TEMPLATES.map((t, j) => { let s = 0; for (let k = 0; k < 12; k++) s += b[k] * t.v[k]; s /= tn[j]; return Math.log(Math.max(s, 1e-3)) + (diat.has(t.name) ? keyBonus : 0); }));
  const dp = new Array(nB), bp = new Array(nB); dp[0] = E[0].slice(); bp[0] = new Int16Array(K);
  for (let i = 1; i < nB; i++) {
    const pen = i % 4 === phase ? downPenalty : (i % 2 === phase % 2 ? midPenalty : offPenalty);
    dp[i] = new Array(K); bp[i] = new Int16Array(K); let bestPrev = 0;
    for (let j = 1; j < K; j++) if (dp[i - 1][j] > dp[i - 1][bestPrev]) bestPrev = j;
    for (let j = 0; j < K; j++) { const stay = dp[i - 1][j], sw = dp[i - 1][bestPrev] - pen; if (stay >= sw) { dp[i][j] = stay + E[i][j]; bp[i][j] = j; } else { dp[i][j] = sw + E[i][j]; bp[i][j] = bestPrev; } }
  }
  let j = 0; for (let k = 1; k < K; k++) if (dp[nB - 1][k] > dp[nB - 1][j]) j = k;
  const path = new Array(nB); for (let i = nB - 1; i >= 0; i--) { path[i] = j; j = bp[i][j]; }
  return { phase, chords: path.map((p, i) => ({ chord: TEMPLATES[p].name, strength: Math.min(1, Math.exp(E[i][p] - (diat.has(TEMPLATES[p].name) ? keyBonus : 0))) })) };
}

/* ------------------- vocal activity (predominant melody, voice range) -------------------
   Melodia at 22.05 kHz with an 80–1000 Hz range mostly ignores strummed/arpeggiated accompaniment
   and follows a sung line. Output: voiced fraction per half second, 0..1. Used to decide whether a
   lyric gap is really instrumental, never to invent lyrics. */
function vocalActivity(audio, sr, progress) {
  const half = new Float32Array(Math.floor(audio.length / 2));
  for (let i = 0; i < half.length; i++) half[i] = (audio[2 * i] + audio[2 * i + 1]) * 0.5;
  const dsr = sr / 2;
  const hop = 256;
  const chunkSec = 60, overlap = 1;
  const out = [];
  const totalHalfSecs = Math.ceil(half.length / dsr * 2);
  const acc = new Float32Array(totalHalfSecs), cnt = new Float32Array(totalHalfSecs);
  let start = 0, k = 0;
  while (start < half.length) {
    const end = Math.min(half.length, start + (chunkSec + overlap) * dsr);
    const vec = essentia.arrayToVector(half.subarray(start, end));
    let m = null;
    try { m = essentia.PredominantPitchMelodia(vec, 10, 3, 2048, false, 0.8, hop, 1, 40, 1000, 100, 80, 20, 0.9, 0.9, 27.5625, 55, dsr, 100, false, 0.2); } catch (e) { vec.delete(); break; }
    const n = m.pitch.size();
    for (let i = 0; i < n; i++) {
      const t = start / dsr + (i * hop) / dsr;
      const b = Math.floor(t * 2);
      if (b >= totalHalfSecs) break;
      if (start > 0 && t < start / dsr + overlap) continue; // skip the overlap re-analysed from the previous chunk
      acc[b] += m.pitch.get(i) > 0 ? 1 : 0; cnt[b] += 1;
    }
    m.pitch.delete(); m.pitchConfidence.delete(); vec.delete();
    start += chunkSec * dsr; k++;
    progress(Math.min(1, start / half.length));
  }
  for (let b = 0; b < totalHalfSecs; b++) out.push(cnt[b] ? Math.round((acc[b] / cnt[b]) * 100) / 100 : 0);
  return out;
}

function analyze(id, audio, sr) {
  const progress = (stage, pct) => postMessage({ type: "progress", id, stage, pct });
  progress("waveform", 0.02);
  const peaks = waveformPeaks(audio, 800);

  const vec = essentia.arrayToVector(audio);

  progress("key", 0.08);
  const key = essentia.KeyExtractor(vec, true, 4096, 4096, 12, 3500, 60, 25, 0.2, "edma", sr, 0.0001, 440, "cosine", "hann");

  progress("tempo", 0.2);
  const rhythm = essentia.RhythmExtractor2013(vec, 208, "degara", 40);
  const ticks = essentia.vectorToArray(rhythm.ticks);
  const bpm = rhythm.bpm;
  vec.delete();

  progress("chords", 0.5);
  const frames = essentia.FrameGenerator(audio, FRAME, HOP);
  const n = frames.size();
  const hpcpFrames = new Array(n);
  const frameTimes = new Float32Array(n);
  const chromaSummary = new Float32Array(12);
  for (let i = 0; i < n; i++) {
    const fr = frames.get(i);
    const { hpcp } = hpcpFrame(fr, sr);
    const a = essentia.vectorToArray(hpcp);
    hpcp.delete();
    hpcpFrames[i] = a;
    frameTimes[i] = (i * HOP + FRAME / 2) / sr;
    if (i % 25 === 0) for (let k = 0; k < 12; k++) chromaSummary[k] += a[(k + 3) % 12]; // rotate A-based bins to C-based
    if (i % 200 === 0) progress("chords", 0.5 + 0.4 * (i / n));
  }
  frames.delete();

  const beats = Array.from(ticks);
  const duration = audio.length / sr;
  const { phase, chords: decoded } = decodeChords(hpcpFrames, frameTimes, beats, duration, key.key, key.scale);
  rhythm.ticks.delete();

  progress("vocals", 0.95);
  let vocals = [];
  try { vocals = vocalActivity(audio, sr, (p) => progress("vocals", 0.95 + 0.05 * p)); } catch (e) { vocals = []; }

  progress("done", 1);
  postMessage(
    {
      type: "result",
      id,
      analysis: {
        version: 1,
        key: key.key,
        scale: key.scale,
        keyStrength: key.strength,
        bpm,
        beats,
        beatChords: decoded.map((d) => d.chord),
        beatStrengths: decoded.map((d) => d.strength),
        downbeatPhase: phase,
        vocals,
        chroma: Array.from(chromaSummary),
        duration,
        sampleRate: sr,
      },
      peaks,
    },
    [peaks.buffer],
  );
}


/* ============================ piano tutorial ============================
   Two ways to get notes out of a recording:
     transcribe — iterative harmonic-comb estimation, best on solo piano
     arrange    — the sung melody over chord voicings, which works on any band recording
   Both return plain {midi,start,end}; hands and fingers are worked out on the main thread. */

const T_LO = 33, T_HI = 96, T_NH = 8;            // A1..C7, harmonics per comb

function combTable(sr, frameSize) {
  const bw = sr / frameSize, half = frameSize / 2;
  const table = [];
  for (let p = T_LO; p <= T_HI; p++) {
    const f0 = 440 * Math.pow(2, (p - 69) / 12);
    const bins = [];
    for (let h = 1; h <= T_NH; h++) {
      const c = Math.round((f0 * h) / bw);
      if (c > half - 2) break;
      bins.push({ c, w: Math.max(1, Math.round((f0 * h * 0.029) / bw)) }); // ~half a semitone
    }
    if (bins.length) table.push({ p, bins });
  }
  return table;
}
function bandMax(S, b) { let m = 0; for (let i = b.c - b.w; i <= b.c + b.w; i++) if (i >= 0 && i < S.length && S[i] > m) m = S[i]; return m; }

/** Pitches sounding in one spectrum, strongest first, each with the strength of its fundamental. */
function framePitches(S, table, maxPoly) {
  const R = Float32Array.from(S);
  let total = 0; for (let i = 0; i < S.length; i++) total += S[i];
  const floor = (total / S.length) * 2;
  const found = [];
  for (let k = 0; k < maxPoly; k++) {
    let best = null, bestScore = 0, bestFund = 0;
    for (const e of table) {
      if (found.some((f) => Math.abs(f.p - e.p) <= 1)) continue;   // itself, or a neighbour leaking in
      let score = 0, odd = 0, even = 0, fund = 0;
      for (let h = 0; h < e.bins.length; h++) {
        const m = bandMax(R, e.bins[h]);
        if (h === 0) fund = m;
        score += m / Math.pow(h + 1, 0.7);
        if (h % 2 === 0) odd += m; else even += m;
      }
      if (fund < floor) continue;                                   // no fundamental, no note
      if (odd < 0.35 * even) continue;                              // a phantom an octave below a real note
      if (score > bestScore) { bestScore = score; best = e; bestFund = fund; }
    }
    if (!best) break;
    if (k === 0) { if (bestScore < floor * 3) break; found.top = bestScore; }
    else if (bestScore < found.top * 0.3) break;
    found.push({ p: best.p, m: bestFund });
    for (const b of best.bins) {                                    // take this comb out of the spectrum
      const m = bandMax(R, b);
      for (let i = b.c - b.w - 1; i <= b.c + b.w + 1; i++) if (i >= 0 && i < R.length) R[i] = Math.max(0, R[i] - m);
    }
  }
  return found;
}

/** Runs of a held pitch become notes; a sharp rise in the fundamental re-strikes the same key. */
function runsToNotes(frames, frameDur, offset, minDur, gapDur) {
  const minF = Math.max(2, Math.round(minDur / frameDur)), gapF = Math.max(1, Math.round(gapDur / frameDur));
  const pitches = new Set();
  for (const f of frames) for (const n of f) pitches.add(n.p);
  const maps = frames.map((f) => { const m = new Map(); for (const n of f) m.set(n.p, n.m); return m; });
  const notes = [];
  for (const p of pitches) {
    let run = null, gap = 0, peak = 0, prev = 0;
    const close = () => { if (run && run.e - run.s + 1 >= minF) notes.push({ midi: p, start: run.s * frameDur + offset, end: (run.e + 1) * frameDur + offset }); run = null; };
    for (let i = 0; i < maps.length; i++) {
      const m = maps[i].get(p);
      if (m === undefined) { if (run) { gap++; if (gap > gapF) close(); } prev = 0; continue; }
      if (run && m >= 1.5 * prev && m > 0.25 * peak && i - run.s > minF) { close(); }  // struck again
      if (!run) { run = { s: i, e: i }; peak = m; } else { run.e = i; if (m > peak) peak = m; }
      gap = 0; prev = m;
    }
    close();
  }
  return notes.sort((a, b) => a.start - b.start || a.midi - b.midi);
}

function transcribeNotes(audio, sr, progress) {
  const FS = 8192, HOP = 1024;
  const table = combTable(sr, FS);
  const frames = [];
  for (let i = 0; i + FS <= audio.length; i += HOP) {
    const vec = essentia.arrayToVector(audio.subarray(i, i + FS));
    const w = essentia.Windowing(vec, true, FS, "hann");
    const sp = essentia.Spectrum(w.frame, FS);
    const S = essentia.vectorToArray(sp.spectrum);
    vec.delete(); w.frame.delete(); sp.spectrum.delete();
    frames.push(framePitches(S, table, 6));
    if ((frames.length & 31) === 0) progress(Math.min(1, (i + FS) / audio.length));
  }
  return runsToNotes(frames, HOP / sr, FS / 2 / sr, 0.09, 0.08);
}

/** The sung line, as notes: Melodia at 22.05 kHz, smoothed and cut into steady pitches. */
function melodyNotes(audio, sr, progress) {
  const half = new Float32Array(Math.floor(audio.length / 2));
  for (let i = 0; i < half.length; i++) half[i] = (audio[2 * i] + audio[2 * i + 1]) * 0.5;
  const dsr = sr / 2, hop = 256, chunkSec = 60, overlap = 1;
  const pitch = new Float32Array(Math.ceil((half.length / hop) + 8));
  let start = 0;
  while (start < half.length) {
    const end = Math.min(half.length, start + (chunkSec + overlap) * dsr);
    const vec = essentia.arrayToVector(half.subarray(start, end));
    let m = null;
    try { m = essentia.PredominantPitchMelodia(vec, 10, 3, 2048, false, 0.8, hop, 1, 40, 1100, 100, 80, 20, 0.9, 0.9, 27.5625, 55, dsr, 100, false, 0.2); }
    catch (e) { vec.delete(); break; }
    const n = m.pitch.size();
    for (let i = 0; i < n; i++) {
      const idx = Math.round((start + i * hop) / hop);
      if (idx >= pitch.length) break;
      if (start > 0 && i * hop < overlap * dsr) continue;            // already covered by the previous chunk
      pitch[idx] = m.pitch.get(i);
    }
    m.pitch.delete(); m.pitchConfidence.delete(); vec.delete();
    start += chunkSec * dsr;
    progress(Math.min(1, start / half.length));
  }
  // Hz -> semitone, median-smoothed so vibrato and glides do not split a note in two
  const midi = new Float32Array(pitch.length);
  for (let i = 0; i < pitch.length; i++) midi[i] = pitch[i] > 0 ? 69 + 12 * Math.log2(pitch[i] / 440) : 0;
  const smooth = new Int16Array(pitch.length);
  const win = [];
  for (let i = 0; i < midi.length; i++) {
    win.length = 0;
    for (let k = Math.max(0, i - 2); k <= Math.min(midi.length - 1, i + 2); k++) if (midi[k] > 0) win.push(midi[k]);
    if (win.length < 3) { smooth[i] = 0; continue; }
    win.sort((a, b) => a - b);
    smooth[i] = Math.round(win[win.length >> 1]);
  }
  const frameDur = hop / dsr;
  const frames = [];
  for (let i = 0; i < smooth.length; i++) frames.push(smooth[i] > 0 ? [{ p: smooth[i], m: 1 }] : []);
  return runsToNotes(frames, frameDur, 0, 0.1, 0.06).filter((n) => n.midi >= 48 && n.midi <= 88);
}

const T_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
function chordRoot(name) {
  if (!name || name === "N") return null;
  const m = /^([A-G])([#b]?)(m?)/.exec(name);
  if (!m) return null;
  let pc = T_NAMES.indexOf(m[1]);
  if (pc < 0) return null;
  if (m[2] === "#") pc = (pc + 1) % 12;
  if (m[2] === "b") pc = (pc + 11) % 12;
  return { pc, minor: m[3] === "m" };
}

/** Melody in the right hand, a close triad in the left: the shape of an actual piano tutorial. */
function arrangeNotes(melody, chords, beats, phase, duration) {
  const out = [];
  const downbeats = beats.filter((_, i) => i % 4 === (phase % 4));
  const voicing = (c) => {
    let root = 45 + (((c.pc - 45) % 12) + 12) % 12;                 // A2 upward, so the bass stays in reach
    if (root > 52) root -= 12;
    return [root, root + (c.minor ? 3 : 4), root + 7];              // triad inside a fifth: one easy hand shape
  };
  for (const seg of chords) {
    const c = chordRoot(seg.chord);
    if (!c || seg.end - seg.start < 0.25) continue;
    const triad = voicing(c);
    const strikes = [seg.start, ...downbeats.filter((b) => b > seg.start + 0.25 && b < seg.end - 0.25)];
    for (let i = 0; i < strikes.length; i++) {
      const s = strikes[i], e = Math.min(seg.end, strikes[i + 1] !== undefined ? strikes[i + 1] : seg.end);
      if (e - s < 0.2) continue;
      for (const m of triad) out.push({ midi: m, start: s, end: e - 0.02 });
    }
  }
  // the tune, kept in a comfortable octave
  const tune = melody.map((n) => ({ midi: n.midi < 55 ? n.midi + 12 : n.midi > 84 ? n.midi - 12 : n.midi, start: n.start, end: n.end }));
  out.push(...tune);
  // where nobody is singing, the right hand takes the chord an octave up so the part is not empty
  const sungUntil = [];
  let cursor = 0;
  for (const n of tune) { if (n.start > cursor + 2.5) sungUntil.push([cursor, n.start]); cursor = Math.max(cursor, n.end); }
  if (duration > cursor + 2.5) sungUntil.push([cursor, duration]);
  for (const [a, b] of sungUntil) {
    for (const seg of chords) {
      if (seg.end < a || seg.start > b) continue;
      const c = chordRoot(seg.chord);
      if (!c) continue;
      const hits = [Math.max(a, seg.start), ...downbeats.filter((t) => t > Math.max(a, seg.start) + 0.25 && t < Math.min(b, seg.end) - 0.25)];
      for (let i = 0; i < hits.length; i++) {
        const s = hits[i], e = Math.min(Math.min(b, seg.end), hits[i + 1] !== undefined ? hits[i + 1] : Math.min(b, seg.end));
        if (e - s < 0.25) continue;
        for (const m of voicing(c)) out.push({ midi: m + 24, start: s, end: e - 0.02 });
      }
    }
  }
  return out.sort((a, b) => a.start - b.start || a.midi - b.midi);
}

function tutorial(id, audio, sr, mode, chords, beats, phase) {
  const progress = (pct) => postMessage({ type: "progress", id, stage: "tutorial", pct });
  progress(0.02);
  const duration = audio.length / sr;
  let notes;
  if (mode === "transcribe") notes = transcribeNotes(audio, sr, (p) => progress(0.02 + 0.96 * p));
  else {
    const melody = melodyNotes(audio, sr, (p) => progress(0.02 + 0.8 * p));
    progress(0.9);
    notes = arrangeNotes(melody, chords || [], beats || [], phase || 0, duration);
  }
  progress(1);
  postMessage({ type: "tutorialResult", id, notes, duration });
}

/* ---------------------------- live mode ---------------------------- */
const live = { hpcps: [], max: 12, sr: 48000, mode: "full" };

function liveFrame(frame, sr) {
  if (!frame || frame.length !== FRAME) return; // the worklet always sends 4096; anything else is not ours
  const owned = [];
  const own = (v) => { owned.push(v); return v; };
  try {
    const vec = own(essentia.arrayToVector(frame));
    if (live.mode === "level") {
      // the tutorial only asks "is someone playing?" — skip the expensive chroma and chord work
      const p = essentia.PitchYin(vec, FRAME, true, 2500, 40, sr, 0.15);
      let r = 0; for (let i = 0; i < frame.length; i++) r += frame[i] * frame[i];
      postMessage({ type: "live", chord: "N", strength: 0, pitch: p.pitch, pitchConfidence: p.pitchConfidence, rms: Math.sqrt(r / frame.length), hpcp: new Array(12).fill(0) });
      return;
    }
    const w = essentia.Windowing(vec, true, FRAME, "hann"); own(w.frame);
    const sp = essentia.Spectrum(w.frame, FRAME); own(sp.spectrum);
    const pk = essentia.SpectralPeaks(sp.spectrum, 0, 3500, 100, 60, "frequency", sr); own(pk.frequencies); own(pk.magnitudes);
    const h = essentia.HPCP(pk.frequencies, pk.magnitudes, true, 500, 0, 3500, false, 60, true, "unitMax", 440, sr, 12, "squaredCosine", 1); own(h.hpcp);
    // time-domain YIN with interpolation: sub-sample accuracy, reliable down to the low E of a guitar
    const pitch = essentia.PitchYin(vec, FRAME, true, 2500, 40, sr, 0.15);
    let rms = 0; for (let i = 0; i < frame.length; i++) rms += frame[i] * frame[i];
    rms = Math.sqrt(rms / frame.length);

    const QUIET = 0.004;
    const hpcpArr = essentia.vectorToArray(h.hpcp);
    // silence normalises to a full-scale chroma (unitMax), so only speaking frames enter the chord window
    if (rms > QUIET) { live.hpcps.push(hpcpArr); if (live.hpcps.length > live.max) live.hpcps.shift(); }

    let chord = "N", strength = 0;
    if (rms > QUIET && live.hpcps.length >= 3) {
      const vv = own(new wasm.VectorVectorFloat());
      for (const a of live.hpcps) vv.push_back(own(essentia.arrayToVector(a)));
      const cd = essentia.ChordsDetection(vv, FRAME, sr, (live.hpcps.length * FRAME) / sr); own(cd.chords); own(cd.strength);
      const n = cd.chords.size();
      chord = cd.chords.get(n - 1);
      strength = cd.strength.get(n - 1);
    }
    postMessage({
      type: "live",
      chord, strength,
      pitch: pitch.pitch, pitchConfidence: pitch.pitchConfidence,
      rms,
      hpcp: rms > QUIET ? Array.from({ length: 12 }, (_, k) => hpcpArr[(k + 3) % 12]) : new Array(12).fill(0), // C-based for display
    });
  } finally {
    for (const v of owned) { try { v.delete(); } catch (e) { /* already freed */ } }
  }
}

onmessage = async (e) => {
  const msg = e.data;
  await ready;
  try {
    if (msg.type === "analyze") analyze(msg.id, msg.audio, msg.sampleRate);
    else if (msg.type === "tutorial") tutorial(msg.id, msg.audio, msg.sampleRate, msg.mode, msg.chords, msg.beats, msg.phase);
    else if (msg.type === "live") liveFrame(msg.frame, msg.sampleRate);
    else if (msg.type === "liveReset") live.hpcps = [];
    else if (msg.type === "liveMode") { live.mode = msg.mode === "level" ? "level" : "full"; live.hpcps = []; }
  } catch (err) {
    postMessage({ type: "error", id: msg.id, message: String(err && err.message ? err.message : err) });
  }
};
