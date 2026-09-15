import type { Analysis, AnalysisStage, LiveFrame, RawAnalysis } from "./types";
import { toAnalysis } from "./postprocess";

/** Bump when public/workers or public/essentia change so the service worker cache is bypassed. */
export const ANALYSIS_VERSION = "7";

type Listener = (f: LiveFrame) => void;

let worker: Worker | null = null;
let readyPromise: Promise<void> | null = null;
const liveListeners = new Set<Listener>();
const pending = new Map<string, {
  resolve: (r: { analysis: Analysis; peaks: Float32Array }) => void;
  reject: (e: Error) => void;
  onProgress?: (stage: AnalysisStage, pct: number) => void;
}>();

export function getWorker(): Worker {
  if (worker) return worker;
  worker = new Worker(`/workers/analysis.js?v=${ANALYSIS_VERSION}`);
  readyPromise = new Promise<void>((resolve) => {
    const onReady = (e: MessageEvent) => { if (e.data?.type === "ready") { resolve(); worker?.removeEventListener("message", onReady); } };
    worker!.addEventListener("message", onReady);
  });
  worker.addEventListener("message", (e: MessageEvent) => {
    const m = e.data;
    if (m.type === "progress") pending.get(m.id)?.onProgress?.(m.stage, m.pct);
    else if (m.type === "result") {
      const p = pending.get(m.id);
      if (p) { pending.delete(m.id); p.resolve({ analysis: toAnalysis(m.analysis as RawAnalysis), peaks: m.peaks }); }
    } else if (m.type === "error") {
      const p = pending.get(m.id);
      if (p) { pending.delete(m.id); p.reject(new Error(m.message)); }
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
export function onLive(l: Listener) { liveListeners.add(l); return () => { liveListeners.delete(l); }; }
