/* AudioWorklet: batches microphone samples into 4096-sample frames for the analysis worker.
   Returns false after a "stop" message so the processor is released instead of rendering forever. */
class MicProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.size = 4096;
    this.buf = new Float32Array(this.size);
    this.fill = 0;
    this.stopped = false;
    this.port.onmessage = (e) => { if (e.data === "stop") this.stopped = true; };
  }
  process(inputs) {
    if (this.stopped) return false;
    const ch = inputs[0] && inputs[0][0];
    if (!ch) return true;
    let i = 0;
    while (i < ch.length) {
      const n = Math.min(ch.length - i, this.size - this.fill);
      this.buf.set(ch.subarray(i, i + n), this.fill);
      this.fill += n; i += n;
      if (this.fill === this.size) {
        const out = this.buf;
        this.port.postMessage(out, [out.buffer]);
        this.buf = new Float32Array(this.size);
        this.fill = 0;
      }
    }
    return true;
  }
}
registerProcessor("mic-processor", MicProcessor);
