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
export async function resumeAudio(): Promise<AudioContext> {
  const c = getAudioContext();
  if (c.state !== "running") { try { await c.resume(); } catch {} }
  return c;
}
