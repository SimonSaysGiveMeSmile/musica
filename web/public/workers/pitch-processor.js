/* AudioWorklet: shifts the pitch of whatever plays through it by a number of semitones, at the same
   speed. A phase vocoder with identity phase locking (Laroche & Dolson): the input is read at the
   shift ratio (which changes speed and pitch together) and stretched back to real time frame by
   frame, keeping each spectral peak's phase coherent so sustained chords stay clean. Transients
   reset the phases so drums keep their edge. Plain JS on purpose: no bundler involvement. */

/* @pure-start */
const PV_N = 4096;      // frame: 12 Hz bins at 48 kHz, so three bass-register notes a tone apart each keep their own peak
const PV_HOP = 1024;    // 75 % overlap, Hann in and out
const PV_RING = 1 << 15;

function makeFFT(n) {
  const levels = Math.log2(n) | 0;
  const cos = new Float32Array(n / 2), sin = new Float32Array(n / 2);
  for (let i = 0; i < n / 2; i++) { cos[i] = Math.cos((2 * Math.PI * i) / n); sin[i] = Math.sin((2 * Math.PI * i) / n); }
  const rev = new Uint32Array(n);
  for (let i = 0; i < n; i++) { let x = i, y = 0; for (let j = 0; j < levels; j++) { y = (y << 1) | (x & 1); x >>>= 1; } rev[i] = y; }
  // in-place radix-2; inverse = conjugate trick, unscaled
  return function fft(re, im, inverse) {
    for (let i = 0; i < n; i++) { const j = rev[i]; if (j > i) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; } }
    for (let size = 2; size <= n; size <<= 1) {
      const half = size >> 1, step = n / size;
      for (let i = 0; i < n; i += size) {
        for (let j = i, k = 0; j < i + half; j++, k += step) {
          const c = cos[k], s = inverse ? sin[k] : -sin[k];
          const l = j + half;
          const tr = re[l] * c - im[l] * s, ti = re[l] * s + im[l] * c;
          re[l] = re[j] - tr; im[l] = im[j] - ti; re[j] += tr; im[j] += ti;
        }
      }
    }
  };
}

class PitchShifter {
  constructor() {
    this.N = PV_N; this.hop = PV_HOP;
    this.win = new Float32Array(this.N);
    for (let i = 0; i < this.N; i++) this.win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / this.N);
    this.fft = makeFFT(this.N);
    this.inRing = new Float32Array(PV_RING); this.inW = 0;      // absolute count of input samples written
    this.outRing = new Float32Array(PV_RING); this.outR = 0;    // absolute count of output samples read
    this.frames = 0;                                             // analysis frames done; frame k starts at k*hop
    this.re = new Float32Array(this.N); this.im = new Float32Array(this.N);
    this.mag = new Float32Array(this.N / 2 + 1); this.ph = new Float32Array(this.N / 2 + 1);
    this.prevPh = new Float32Array(this.N / 2 + 1); this.synPh = new Float32Array(this.N / 2 + 1);
    this.peakOf = new Int32Array(this.N / 2 + 1);
    this.lastEnergy = 0;
    this.ratio = 1; this.setSemitones(0);
  }
  setSemitones(semi) { this.ratio = Math.pow(2, semi / 12); }
  /** Samples between a sound going in and coming out at the current ratio: the reader trails the
   *  input by a frame read at the ratio, and the overlap-add centres each sound half a frame early. */
  latency() { return Math.round((this.N * (1 + this.ratio)) / 2 + this.hop / 2); }
  /** How far the reader may fall behind before it skips ahead. */
  lookahead() { return Math.ceil(this.N * this.ratio) + this.hop; }
  /** Feed input; then as many frames as the input now covers are analysed and overlap-added. */
  push(x) {
    const R = PV_RING - 1;
    for (let i = 0; i < x.length; i++) this.inRing[(this.inW + i) & R] = x[i];
    this.inW += x.length;
    while (this.frames * this.hop + (this.N - 1) * this.ratio + 2 < this.inW) this.frame();
  }
  /** Pull output. The reader never passes the last finished frame, so it waits (with zeros) while
   *  the first frames land or while a bigger shift needs more lookahead, and it skips ahead when a
   *  smaller shift leaves it further behind than the latency calls for. Returns the real count. */
  pull(out) { return this.advance(out, out.length); }
  /** Bypass keeps the rings in step so a later shift starts without a gap. */
  skip(n) { this.advance(null, n); }
  advance(out, n) {
    const R = PV_RING - 1, lat = this.lookahead();
    const ready = this.frames * this.hop; // output positions below this are final
    if (ready - this.outR > lat + this.hop) {
      const drop = ready - lat - this.outR;
      for (let i = 0; i < drop; i++) this.outRing[(this.outR + i) & R] = 0;
      this.outR += drop;
    }
    const take = Math.min(n, Math.max(0, ready - this.outR));
    for (let i = 0; i < take; i++) { const q = (this.outR + i) & R; if (out) out[i] = this.outRing[q]; this.outRing[q] = 0; }
    if (out) for (let i = take; i < n; i++) out[i] = 0;
    this.outR += take;
    return take;
  }
  frame() {
    const { N, hop, re, im, mag, ph, prevPh, synPh, win, ratio } = this;
    const R = PV_RING - 1, k = this.frames, base = k * hop;
    // the frame is the input read at the shift ratio: faster and higher (or slower and lower)
    let energy = 0;
    for (let n = 0; n < N; n++) {
      const p = base + n * ratio, i0 = Math.floor(p), f = p - i0;
      const v = this.inRing[i0 & R] * (1 - f) + this.inRing[(i0 + 1) & R] * f;
      re[n] = v * win[n]; im[n] = 0; energy += v * v;
    }
    this.fft(re, im, false);
    const half = N / 2;
    for (let b = 0; b <= half; b++) { mag[b] = Math.hypot(re[b], im[b]); ph[b] = Math.atan2(im[b], re[b]); }
    // a sudden jump in energy is an onset: start its phases fresh instead of smearing it
    const transient = energy > this.lastEnergy * 4 && energy > 1e-4;
    this.lastEnergy = energy * 0.6 + this.lastEnergy * 0.4;
    // peaks own the bins around them; every bin's phase advances with its peak
    let peak = -1, next = -1;
    for (let b = 0; b <= half; b++) {
      // one bin each side: two notes a tone apart in the bass sit two bins apart, and each must keep its own phase
      const isPeak = b > 0 && b < half && mag[b] > mag[b - 1] && mag[b] >= mag[b + 1];
      if (isPeak) {
        // bins between the previous peak and this one split at the magnitude valley
        if (peak >= 0) {
          let valley = peak; for (let c = peak; c <= b; c++) if (mag[c] < mag[valley]) valley = c;
          for (let c = next; c <= valley; c++) this.peakOf[c] = peak;
          next = valley + 1;
        } else next = 0;
        peak = b;
      }
    }
    if (peak >= 0) for (let c = next; c <= half; c++) this.peakOf[c] = peak; else for (let c = 0; c <= half; c++) this.peakOf[c] = c;
    const hopA = hop / ratio; // analysis hop, in samples of the ratio-read signal
    if (transient) { for (let b = 0; b <= half; b++) synPh[b] = ph[b]; }
    else {
      for (let b = 0; b <= half; b++) {
        if (this.peakOf[b] !== b) continue;
        const omega = (2 * Math.PI * b) / N;
        let d = ph[b] - prevPh[b] - omega * hopA;
        d -= 2 * Math.PI * Math.round(d / (2 * Math.PI));
        synPh[b] += (omega + d / hopA) * hop;
      }
      for (let b = 0; b <= half; b++) { const p = this.peakOf[b]; if (p !== b) synPh[b] = synPh[p] + (ph[b] - ph[p]); }
    }
    for (let b = 0; b <= half; b++) { prevPh[b] = ph[b]; const s = synPh[b]; re[b] = mag[b] * Math.cos(s); im[b] = mag[b] * Math.sin(s); }
    for (let b = 1; b < half; b++) { re[N - b] = re[b]; im[N - b] = -im[b]; }
    this.fft(re, im, true);
    // Hann in, Hann out, 75 % overlap: the windows sum to 1.5, and the unscaled inverse to N
    const g = 1 / (1.5 * N);
    for (let n = 0; n < N; n++) this.outRing[(base + n) & R] += re[n] * win[n] * g;
    this.frames++;
  }
}
/* @pure-end */

class PitchProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.semi = 0; this.shifters = []; this.stopped = false;
    this.port.onmessage = (e) => {
      const m = e.data;
      if (m === "stop") this.stopped = true;
      else if (m && typeof m.semitones === "number") { this.semi = m.semitones; for (const s of this.shifters) s.setSemitones(this.semi); this.port.postMessage({ latency: this.shifters[0] ? this.shifters[0].latency() : 0 }); }
    };
  }
  process(inputs, outputs) {
    if (this.stopped) return false;
    const inp = inputs[0], out = outputs[0];
    if (!inp || !inp.length) { for (const ch of out) ch.fill(0); return true; }
    while (this.shifters.length < inp.length) { const s = new PitchShifter(); s.setSemitones(this.semi); this.shifters.push(s); }
    for (let c = 0; c < out.length; c++) {
      const src = inp[Math.min(c, inp.length - 1)], sh = this.shifters[Math.min(c, inp.length - 1)];
      if (c < inp.length) sh.push(src);
      if (this.semi === 0) { out[c].set(src); if (c < inp.length) sh.skip(src.length); }
      else if (c < inp.length) sh.pull(out[c]); else out[c].set(out[0]);
    }
    return true;
  }
}
registerProcessor("pitch-processor", PitchProcessor);
