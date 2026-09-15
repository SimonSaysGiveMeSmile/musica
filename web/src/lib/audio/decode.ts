/** Decode any browser-supported audio into mono Float32 at the given rate (Essentia rhythm expects 44100). */
export const ANALYSIS_RATE = 44100;
export const MAX_SECONDS = 12 * 60;

export async function decodeToMono(data: ArrayBuffer, rate = ANALYSIS_RATE): Promise<{ audio: Float32Array; sampleRate: number; duration: number }> {
  const Ctx = (window.OfflineAudioContext || (window as unknown as { webkitOfflineAudioContext: typeof OfflineAudioContext }).webkitOfflineAudioContext);
  const ctx = new Ctx(1, 1, rate);
  const buf: AudioBuffer = await new Promise((resolve, reject) => {
    // callback form for Safari compatibility
    ctx.decodeAudioData(data.slice(0), resolve, reject);
  });
  const length = Math.min(buf.length, MAX_SECONDS * buf.sampleRate);
  const out = new Float32Array(length);
  const ch = buf.numberOfChannels;
  for (let c = 0; c < ch; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < length; i++) out[i] += d[i] / ch;
  }
  return { audio: out, sampleRate: buf.sampleRate, duration: length / buf.sampleRate };
}

export async function sha1Hex(data: ArrayBuffer): Promise<string> {
  const h = await crypto.subtle.digest("SHA-1", data);
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
