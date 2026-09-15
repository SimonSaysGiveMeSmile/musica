/* Musica analysis worker — Essentia.js (WASM). Plain JS on purpose: no bundler involvement. */
/* global importScripts, EssentiaWASM, Essentia */
importScripts("/essentia/essentia-wasm.web.js?v=4", "/essentia/essentia.js-core.umd.min.js?v=4");

let essentia = null;
let wasm = null;
const ready = EssentiaWASM({ locateFile: (p) => "/essentia/" + p }).then((m) => {
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
    if (i % 200 === 0) progress("chords", 0.5 + 0.45 * (i / n));
  }
  frames.delete();

  const beats = Array.from(ticks);
  const duration = audio.length / sr;
  const { phase, chords: decoded } = decodeChords(hpcpFrames, frameTimes, beats, duration, key.key, key.scale);
  rhythm.ticks.delete();

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
        chroma: Array.from(chromaSummary),
        duration,
        sampleRate: sr,
      },
      peaks,
    },
    [peaks.buffer],
  );
}

/* ---------------------------- live mode ---------------------------- */
const live = { hpcps: [], max: 12, sr: 48000 };

function liveFrame(frame, sr) {
  const vec = essentia.arrayToVector(frame);
  const w = essentia.Windowing(vec, true, frame.length, "hann");
  const sp = essentia.Spectrum(w.frame, frame.length);
  const pk = essentia.SpectralPeaks(sp.spectrum, 0, 3500, 100, 60, "frequency", sr);
  const h = essentia.HPCP(pk.frequencies, pk.magnitudes, true, 500, 0, 3500, false, 60, true, "unitMax", 440, sr, 12, "squaredCosine", 1);
  const pitch = essentia.PitchYinFFT(sp.spectrum, frame.length, false, 22050, 20, sr, 0.1);
  // rms for silence gating
  let rms = 0; for (let i = 0; i < frame.length; i++) rms += frame[i] * frame[i];
  rms = Math.sqrt(rms / frame.length);

  const hpcpArr = essentia.vectorToArray(h.hpcp);
  live.hpcps.push(hpcpArr);
  if (live.hpcps.length > live.max) live.hpcps.shift();

  let chord = "N", strength = 0;
  if (rms > 0.004 && live.hpcps.length >= 3) {
    const vv = new wasm.VectorVectorFloat();
    const tmp = [];
    for (const a of live.hpcps) { const v = essentia.arrayToVector(a); vv.push_back(v); tmp.push(v); }
    const cd = essentia.ChordsDetection(vv, frame.length, sr, (live.hpcps.length * frame.length) / sr);
    const n = cd.chords.size();
    chord = cd.chords.get(n - 1);
    strength = cd.strength.get(n - 1);
    vv.delete(); cd.chords.delete(); cd.strength.delete();
    for (const v of tmp) v.delete();
  }
  vec.delete(); w.frame.delete(); sp.spectrum.delete(); pk.frequencies.delete(); pk.magnitudes.delete(); h.hpcp.delete();

  postMessage({
    type: "live",
    chord, strength,
    pitch: pitch.pitch, pitchConfidence: pitch.pitchConfidence,
    rms,
    hpcp: Array.from({ length: 12 }, (_, k) => hpcpArr[(k + 3) % 12]), // C-based for display
  });
}

onmessage = async (e) => {
  const msg = e.data;
  await ready;
  try {
    if (msg.type === "analyze") analyze(msg.id, msg.audio, msg.sampleRate);
    else if (msg.type === "live") liveFrame(msg.frame, msg.sampleRate);
    else if (msg.type === "liveReset") live.hpcps = [];
  } catch (err) {
    postMessage({ type: "error", id: msg.id, message: String(err && err.message ? err.message : err) });
  }
};
