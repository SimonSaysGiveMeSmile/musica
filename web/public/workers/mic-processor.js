/* AudioWorklet: hands the analysis worker a `size`-sample window every `hop` samples. The window
   stays long enough for a low E to be measured; the hop is what sets how often the tuner moves.
   Returns false after a "stop" message so the processor is released instead of rendering forever. */
class MicProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const o = (options && options.processorOptions) || {};
    this.size = o.size || 4096;
    this.hop = Math.max(128, Math.min(this.size, o.hop || this.size));
    this.ring = new Float32Array(this.size);   // the last `size` samples, oldest first
    this.filled = 0;                           // how many real samples the ring holds so far
    this.sinceEmit = 0;
    this.stopped = false;
    this.port.onmessage = (e) => { if (e.data === "stop") this.stopped = true; };
  }
  process(inputs) {
    if (this.stopped) return false;
    const ch = inputs[0] && inputs[0][0];
    if (!ch) return true;
    const n = ch.length;                       // 128 per render quantum
    this.ring.copyWithin(0, n);
    this.ring.set(ch, this.size - n);
    this.filled = Math.min(this.size, this.filled + n);
    this.sinceEmit += n;
    if (this.filled === this.size && this.sinceEmit >= this.hop) {
      this.sinceEmit = 0;
      const out = this.ring.slice();
      this.port.postMessage(out, [out.buffer]);
    }
    return true;
  }
}
registerProcessor("mic-processor", MicProcessor);
