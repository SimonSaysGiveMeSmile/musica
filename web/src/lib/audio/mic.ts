"use client";
import { resetLive, sendLiveFrame } from "@/lib/analysis/client";

const FRAME = 4096;

export interface MicHandle { stop: () => void; sampleRate: number }

export async function startMic(): Promise<MicHandle> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
  });
  const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new Ctx();
  await ctx.resume();
  const source = ctx.createMediaStreamSource(stream);
  // ScriptProcessor is deprecated but still the most portable way to get raw frames on iOS Safari.
  const proc = ctx.createScriptProcessor(FRAME, 1, 1);
  const buf = new Float32Array(FRAME);
  proc.onaudioprocess = (e) => {
    buf.set(e.inputBuffer.getChannelData(0));
    sendLiveFrame(new Float32Array(buf), ctx.sampleRate);
  };
  const sink = ctx.createGain(); sink.gain.value = 0;
  source.connect(proc); proc.connect(sink); sink.connect(ctx.destination);
  resetLive();
  return {
    sampleRate: ctx.sampleRate,
    stop: () => {
      proc.disconnect(); source.disconnect(); sink.disconnect();
      stream.getTracks().forEach((t) => t.stop());
      ctx.close();
    },
  };
}

export function pitchToNote(freq: number): { name: string; octave: number; cents: number } | null {
  if (!freq || freq < 30) return null;
  const midi = 69 + 12 * Math.log2(freq / 440);
  const rounded = Math.round(midi);
  const names = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  return { name: names[((rounded % 12) + 12) % 12], octave: Math.floor(rounded / 12) - 1, cents: Math.round((midi - rounded) * 100) };
}
