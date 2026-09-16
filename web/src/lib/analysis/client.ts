import type { Analysis, AnalysisStage, LiveFrame, RawAnalysis } from "./types";
import type { RawNote } from "@/lib/tutorial/types";
import { toAnalysis } from "./postprocess";

/** Bump when public/workers or public/essentia change so the service worker cache is bypassed. */
export const ANALYSIS_VERSION = "8";

type Listener = (f: LiveFrame) => void;

let worker: Worker | null = null;
let readyPromise: Promise<void> | null = null;
const liveListeners = new Set<Listener>();
const pending = new Map<string, {
  resolve: (r: { analysis: Analysis; peaks: Float32Array }) => void;
  reject: (e: Error) => void;
  onProgress?: (stage: AnalysisStage, pct: number) => void;
}>();

const tutorials = new Map<string, { resolve: (n: RawNote[]) => void; reject: (e: Error) => void; onProgress?: (pct: number) => void }>();

export function getWorker(): Worker {
  if (worker) return worker;
  worker = new Worker(`/workers/analysis.js?v=${ANALYSIS_VERSION}`);
  readyPromise = new Promise<void>((resolve) => {
    const onReady = (e: MessageEvent) => { if (e.data?.type === "ready") { resolve(); worker?.removeEventListener("message", onReady); } };
    worker!.addEventListener("message", onReady);
  });
  worker.addEventListener("message", (e: MessageEvent) => {
    const m = e.data;
    if (m.type === "progress") { pending.get(m.id)?.onProgress?.(m.stage, m.pct); tutorials.get(m.id)?.onProgress?.(m.pct); }
    else if (m.type === "tutorialResult") { const p = tutorials.get(m.id); if (p) { tutorials.delete(m.id); p.resolve(m.notes as RawNote[]); } }
    else if (m.type === "result") {
      const p = pending.get(m.id);
      if (p) { pending.delete(m.id); p.resolve({ analysis: toAnalysis(m.analysis as RawAnalysis), peaks: m.peaks }); }
    } else if (m.type === "error") {
      const p = pending.get(m.id);
      if (p) { pending.delete(m.id); p.reject(new Error(m.message)); }
      const q = tutorials.get(m.id);
      if (q) { tutorials.delete(m.id); q.reject(new Error(m.message)); }
    } else if (m.type === "live") {
      for (const l of liveListeners) l(m as LiveFrame);
    }
  });
  return worker;
}

export function warmWorker() { if (typeof window !== "undefined") getWorker(); }

export async function analyzeAudio(
  audio: Float32Array,
  sampleRate: number,
  onProgress?: (stage: AnalysisStage, pct: number) => void,
): Promise<{ analysis: Analysis; peaks: Float32Array }> {
  const w = getWorker();
  await readyPromise;
  const id = Math.random().toString(36).slice(2);
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject, onProgress });
    w.postMessage({ type: "analyze", id, audio, sampleRate }, [audio.buffer]);
  });
}

export function sendLiveFrame(frame: Float32Array, sampleRate: number) {
  const w = getWorker();
  w.postMessage({ type: "live", frame, sampleRate }, [frame.buffer]);
}
export function resetLive() { getWorker().postMessage({ type: "liveReset" }); }
/** "level" skips chroma and chord detection: all the tutorial needs is how loud the room is. */
export function setLiveMode(mode: "full" | "level") { getWorker().postMessage({ type: "liveMode", mode }); }
export function onLive(l: Listener) { liveListeners.add(l); return () => { liveListeners.delete(l); }; }

/** Ask the worker for the raw notes of a tutorial. Hands and fingers are decided on this side. */
export async function buildTutorialNotes(
  audio: Float32Array,
  sampleRate: number,
  mode: "arrange" | "transcribe",
  ctx: { chords?: { chord: string; start: number; end: number }[]; beats?: number[]; phase?: number },
  onProgress?: (pct: number) => void,
): Promise<RawNote[]> {
  const w = getWorker();
  await readyPromise;
  const id = Math.random().toString(36).slice(2);
  return new Promise((resolve, reject) => {
    tutorials.set(id, { resolve, reject, onProgress });
    w.postMessage({ type: "tutorial", id, audio, sampleRate, mode, chords: ctx.chords, beats: ctx.beats, phase: ctx.phase }, [audio.buffer]);
  });
}
