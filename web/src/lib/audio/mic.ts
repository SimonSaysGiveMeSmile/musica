"use client";
import { resetLive, sendLiveFrame, setLiveInstrument } from "@/lib/analysis/client";
import { resumeAudio, setAudioSession } from "./context";

const FRAME = 4096;   // analysis window: long enough to measure a low E
const HOP = 1024;     // a fresh window every 21 ms at 48 kHz — what makes the needle feel live
const WORKLET_VERSION = "3";

export interface MicHandle {
  stop: () => void;
  sampleRate: number;
  method: "worklet" | "scriptprocessor";
  /** Fired when iOS takes the microphone away (lock screen, app switch, phone call) or the track ends. */
  onLost?: (reason: "ended" | "muted") => void;
}

/** The live microphone stream, so reference tones can mute it while they play. */
let activeStream: MediaStream | null = null;
export function isMicActive() { return activeStream !== null; }
export function muteMic(muted: boolean) { activeStream?.getAudioTracks().forEach((t) => { t.enabled = !muted; }); }

export interface MicOptions {
  /** Let the browser subtract what we are playing, so listening while a backing track runs hears only the room. */
  echoCancellation?: boolean;
  /** What the listener expects to hear, so the recogniser can use that instrument's range and partials. */
  instrument?: string;
}

export async function startMic(opts: MicOptions = {}): Promise<MicHandle> {
  // Ask iOS for a recording session that keeps the loudspeaker, before the hardware route is decided.
  setAudioSession("play-and-record");
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: !!opts.echoCancellation, noiseSuppression: false, autoGainControl: false },
  });
  activeStream = stream;
  const ctx = await resumeAudio();
  const source = ctx.createMediaStreamSource(stream);
  resetLive();
  if (opts.instrument) setLiveInstrument(opts.instrument);

  const handle: MicHandle = { stop: () => {}, sampleRate: ctx.sampleRate, method: "worklet" };
  const track = stream.getAudioTracks()[0];
  track.addEventListener("ended", () => handle.onLost?.("ended"));
  track.addEventListener("mute", () => handle.onLost?.("muted"));
  const finish = () => { stream.getTracks().forEach((t) => t.stop()); activeStream = null; setAudioSession("playback"); };

  // Preferred: AudioWorklet (runs off the main thread, not deprecated, works on iOS 14.5+).
  if (ctx.audioWorklet) {
    try {
      await ctx.audioWorklet.addModule(`/workers/mic-processor.js?v=${WORKLET_VERSION}`);
      const node = new AudioWorkletNode(ctx, "mic-processor", { numberOfInputs: 1, numberOfOutputs: 1, channelCount: 1, processorOptions: { size: FRAME, hop: HOP } });
      node.port.onmessage = (e: MessageEvent<Float32Array>) => sendLiveFrame(e.data, ctx.sampleRate, HOP);
      const sink = ctx.createGain(); sink.gain.value = 0;
      source.connect(node); node.connect(sink); sink.connect(ctx.destination);
      handle.stop = () => { node.port.postMessage("stop"); node.port.onmessage = null; node.disconnect(); source.disconnect(); sink.disconnect(); finish(); };
      return handle;
    } catch (e) { console.warn("AudioWorklet unavailable, using ScriptProcessor", e); }
  }

  // the same rolling window, one hop at a time
  const proc = ctx.createScriptProcessor(HOP, 1, 1);
  const ring = new Float32Array(FRAME);
  let filled = 0;
  proc.onaudioprocess = (e) => {
    const chunk = e.inputBuffer.getChannelData(0);
    ring.copyWithin(0, chunk.length);
    ring.set(chunk, FRAME - chunk.length);
    filled = Math.min(FRAME, filled + chunk.length);
    if (filled === FRAME) sendLiveFrame(ring.slice(), ctx.sampleRate, HOP);
  };
  const sink = ctx.createGain(); sink.gain.value = 0;
  source.connect(proc); proc.connect(sink); sink.connect(ctx.destination);
  handle.method = "scriptprocessor";
  handle.stop = () => { proc.onaudioprocess = null; proc.disconnect(); source.disconnect(); sink.disconnect(); finish(); };
  return handle;
}

export function pitchToNote(freq: number): { name: string; octave: number; cents: number } | null {
  if (!freq || freq < 30) return null;
  const midi = 69 + 12 * Math.log2(freq / 440);
  const rounded = Math.round(midi);
  const names = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  return { name: names[((rounded % 12) + 12) % 12], octave: Math.floor(rounded / 12) - 1, cents: Math.round((midi - rounded) * 100) };
}
