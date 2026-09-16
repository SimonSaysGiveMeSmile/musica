"use client";
import { resetLive, sendLiveFrame } from "@/lib/analysis/client";
import { resumeAudio, setAudioSession } from "./context";

const FRAME = 4096;
const WORKLET_VERSION = "2";

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

  const handle: MicHandle = { stop: () => {}, sampleRate: ctx.sampleRate, method: "worklet" };
  const track = stream.getAudioTracks()[0];
  track.addEventListener("ended", () => handle.onLost?.("ended"));
  track.addEventListener("mute", () => handle.onLost?.("muted"));
  const finish = () => { stream.getTracks().forEach((t) => t.stop()); activeStream = null; setAudioSession("playback"); };

  // Preferred: AudioWorklet (runs off the main thread, not deprecated, works on iOS 14.5+).
  if (ctx.audioWorklet) {
    try {
      await ctx.audioWorklet.addModule(`/workers/mic-processor.js?v=${WORKLET_VERSION}`);
      const node = new AudioWorkletNode(ctx, "mic-processor", { numberOfInputs: 1, numberOfOutputs: 1, channelCount: 1 });
      node.port.onmessage = (e: MessageEvent<Float32Array>) => sendLiveFrame(e.data, ctx.sampleRate);
      const sink = ctx.createGain(); sink.gain.value = 0;
      source.connect(node); node.connect(sink); sink.connect(ctx.destination);
      handle.stop = () => { node.port.postMessage("stop"); node.port.onmessage = null; node.disconnect(); source.disconnect(); sink.disconnect(); finish(); };
      return handle;
    } catch (e) { console.warn("AudioWorklet unavailable, using ScriptProcessor", e); }
  }

  const proc = ctx.createScriptProcessor(FRAME, 1, 1);
  proc.onaudioprocess = (e) => sendLiveFrame(new Float32Array(e.inputBuffer.getChannelData(0)), ctx.sampleRate);
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
