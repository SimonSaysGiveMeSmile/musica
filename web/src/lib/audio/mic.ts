"use client";
import { resetLive, sendLiveFrame } from "@/lib/analysis/client";
import { resumeAudio } from "./context";

const FRAME = 4096;

export interface MicHandle { stop: () => void; sampleRate: number; method: "worklet" | "scriptprocessor" }

export async function startMic(): Promise<MicHandle> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
  });
  const ctx = await resumeAudio();
  const source = ctx.createMediaStreamSource(stream);
  resetLive();

  // Preferred: AudioWorklet (runs off the main thread, not deprecated, works on iOS 14.5+).
  if (ctx.audioWorklet) {
    try {
      await ctx.audioWorklet.addModule("/workers/mic-processor.js?v=1");
      const node = new AudioWorkletNode(ctx, "mic-processor", { numberOfInputs: 1, numberOfOutputs: 1, channelCount: 1 });
      node.port.onmessage = (e: MessageEvent<Float32Array>) => sendLiveFrame(e.data, ctx.sampleRate);
      const sink = ctx.createGain(); sink.gain.value = 0;
      source.connect(node); node.connect(sink); sink.connect(ctx.destination);
      return {
        sampleRate: ctx.sampleRate, method: "worklet",
        stop: () => { node.port.onmessage = null; node.disconnect(); source.disconnect(); sink.disconnect(); stream.getTracks().forEach((t) => t.stop()); },
      };
    } catch { /* fall through to ScriptProcessor */ }
  }

  const proc = ctx.createScriptProcessor(FRAME, 1, 1);
  proc.onaudioprocess = (e) => sendLiveFrame(new Float32Array(e.inputBuffer.getChannelData(0)), ctx.sampleRate);
  const sink = ctx.createGain(); sink.gain.value = 0;
  source.connect(proc); proc.connect(sink); sink.connect(ctx.destination);
  return {
    sampleRate: ctx.sampleRate, method: "scriptprocessor",
    stop: () => { proc.onaudioprocess = null; proc.disconnect(); source.disconnect(); sink.disconnect(); stream.getTracks().forEach((t) => t.stop()); },
  };
}

export function pitchToNote(freq: number): { name: string; octave: number; cents: number } | null {
  if (!freq || freq < 30) return null;
  const midi = 69 + 12 * Math.log2(freq / 440);
  const rounded = Math.round(midi);
  const names = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  return { name: names[((rounded % 12) + 12) % 12], octave: Math.floor(rounded / 12) - 1, cents: Math.round((midi - rounded) * 100) };
}
