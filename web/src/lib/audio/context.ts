"use client";
/** One AudioContext for the whole app. iOS misbehaves (silent capture, wrong rate) when several contexts
 *  are created and closed, so the player, the metronome, the tuner tones and the microphone all share this. */
let ctx: AudioContext | null = null;

export function getAudioContext(): AudioContext {
  if (!ctx || ctx.state === "closed") {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    ctx = new Ctx();
  }
  return ctx;
}

/** iOS audio session category (Safari 17+): "playback" ignores the Ring/Silent switch, "play-and-record" keeps the
 *  loudspeaker while the microphone is open. Harmless where unsupported. */
export function setAudioSession(type: "playback" | "play-and-record" | "auto") {
  try { const s = (navigator as Navigator & { audioSession?: { type: string } }).audioSession; if (s) s.type = type; } catch {}
}

/** Resume the context and make sure it is really running. A context stuck in iOS's "interrupted" state after a
 *  phone call or Siri is replaced with a fresh one. */
export async function resumeAudio(): Promise<AudioContext> {
  let c = getAudioContext();
  if (c.state !== "running") { try { await c.resume(); } catch {} }
  if ((c.state as string) !== "running") {
    try { await c.close(); } catch {}
    ctx = null;
    c = getAudioContext();
    try { await c.resume(); } catch {}
  }
  return c;
}
