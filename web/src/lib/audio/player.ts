"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getAudioContext, resumeAudio } from "./context";

export interface Loop { a: number; b: number }

/** Bump when public/workers/pitch-processor.js changes so the service worker cache is bypassed. */
export const PITCH_VERSION = "1";

/** The recording, shifted in pitch to follow the transpose setting. Lives in an AudioWorklet; the
 *  element's sound is routed through it the first time a shift is asked for and stays routed. */
export interface PitchShift { semitones: number; enabled: boolean }
interface Graph { ctx: AudioContext; src: MediaElementAudioSourceNode; node: AudioWorkletNode }
const moduleReady = new WeakMap<AudioContext, Promise<void>>();

export function usePlayer(src: string | null, beats: number[] | undefined, downbeatPhase = 0, pitch: PitchShift = { semitones: 0, enabled: false }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const graphRef = useRef<Graph | null>(null);
  const latencyRef = useRef(0); // seconds the shifter holds the sound back; 0 when it is bypassed
  const [shifting, setShifting] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [rate, setRateState] = useState(1);
  const [loop, setLoop] = useState<Loop | null>(null);
  const [metronome, setMetronome] = useState(false);
  const nextBeatRef = useRef(0);
  const rafRef = useRef(0);
  const lastUiRef = useRef(0);
  const ctRef = useRef({ value: 0, at: 0 }); // last distinct currentTime and when it changed
  const loopRef = useRef(loop);
  const metroRef = useRef(metronome);
  const rateRef = useRef(rate);
  const beatsRef = useRef(beats);
  useEffect(() => { loopRef.current = loop; metroRef.current = metronome; rateRef.current = rate; beatsRef.current = beats; }, [loop, metronome, rate, beats]);

  /** A fresh element, wired up. An element can be tied to one AudioContext for life, so when the
   *  context is replaced (iOS after an interruption) the element is replaced with it. */
  const makeElement = useCallback((from?: HTMLAudioElement | null) => {
    const a = new Audio();
    a.preload = "auto";
    (a as HTMLAudioElement & { preservesPitch: boolean }).preservesPitch = true;
    const onMeta = () => setDuration(a.duration || 0);
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    a.addEventListener("loadedmetadata", onMeta);
    a.addEventListener("durationchange", onMeta);
    a.addEventListener("play", onPlay);
    a.addEventListener("pause", onPause);
    a.addEventListener("ended", onPause);
    if (from) {
      const wasPlaying = !from.paused;
      if (from.currentSrc || from.src) { a.src = from.src; a.load(); a.currentTime = from.currentTime; }
      a.playbackRate = from.playbackRate;
      from.pause(); from.src = "";
      if (wasPlaying) a.play().catch(() => {});
    }
    audioRef.current = a;
    return a;
  }, []);

  useEffect(() => {
    makeElement();
    return () => {
      const a = audioRef.current; if (a) { a.pause(); a.src = ""; } audioRef.current = null;
      const g = graphRef.current; if (g) { try { g.node.port.postMessage("stop"); g.node.disconnect(); g.src.disconnect(); } catch {} graphRef.current = null; }
    };
  }, [makeElement]);

  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    if (src) { a.src = src; a.load(); }
    setTime(0);
  }, [src]);

  /** Route the element through the pitch shifter on the current context, rebuilding the element if
   *  the context has been replaced since. Resolves to null where worklets are not available. */
  const ensureGraph = useCallback(async (): Promise<Graph | null> => {
    const ctx = getAudioContext();
    if (!ctx.audioWorklet) return null;
    const g = graphRef.current;
    if (g && g.ctx === ctx) return g;
    if (g) { try { g.node.port.postMessage("stop"); g.node.disconnect(); g.src.disconnect(); } catch {} graphRef.current = null; makeElement(audioRef.current); }
    const a = audioRef.current; if (!a) return null;
    let ready = moduleReady.get(ctx);
    if (!ready) { ready = ctx.audioWorklet.addModule(`/workers/pitch-processor.js?v=${PITCH_VERSION}`); moduleReady.set(ctx, ready); }
    try { await ready; } catch { return null; }
    if (audioRef.current !== a || graphRef.current) return graphRef.current;
    const node = new AudioWorkletNode(ctx, "pitch-processor", { outputChannelCount: [2] });
    const srcNode = ctx.createMediaElementSource(a);
    srcNode.connect(node).connect(ctx.destination);
    const built = { ctx, src: srcNode, node };
    graphRef.current = built;
    return built;
  }, [makeElement]);

  const pitchRef = useRef(pitch);
  useEffect(() => { pitchRef.current = pitch; }, [pitch]);
  const applyPitch = useCallback(async () => {
    const want = pitchRef.current.enabled ? pitchRef.current.semitones : 0;
    if (want === 0 && !graphRef.current) { latencyRef.current = 0; setShifting(false); return; } // nothing to undo, nothing to build
    const g = await ensureGraph();
    if (!g) { latencyRef.current = 0; setShifting(false); return; }
    const semis = pitchRef.current.enabled ? pitchRef.current.semitones : 0;
    g.node.port.postMessage({ semitones: semis });
    g.node.port.onmessage = (e) => { const l = e.data?.latency; if (typeof l === "number") latencyRef.current = semis === 0 ? 0 : l / g.ctx.sampleRate; };
    setShifting(semis !== 0);
  }, [ensureGraph]);
  useEffect(() => { const t = setTimeout(applyPitch, 0); return () => clearTimeout(t); }, [pitch.enabled, pitch.semitones, applyPitch]);

  const click = useCallback((at: number, accent: boolean) => {
    const ctx = getAudioContext();
    if (ctx.state !== "running") return;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "sine";
    o.frequency.value = accent ? 1568 : 1046;
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(accent ? 0.5 : 0.3, at + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, at + 0.06);
    o.connect(g).connect(ctx.destination);
    o.start(at); o.stop(at + 0.08);
  }, []);

  // rAF loop: UI time, A-B loop, metronome scheduling
  useEffect(() => {
    const tick = () => {
      const a = audioRef.current;
      if (a) {
        const t = a.currentTime;
        const lp = loopRef.current;
        if (lp && !a.paused && t >= lp.b) { a.currentTime = lp.a; nextBeatRef.current = 0; }
        const now = performance.now();
        // iOS updates currentTime only a few times a second; interpolate between updates for smooth highlighting
        if (a.currentTime !== ctRef.current.value) ctRef.current = { value: a.currentTime, at: now };
        const est = a.paused ? a.currentTime : Math.max(0, Math.min(a.currentTime + ((now - ctRef.current.at) / 1000) * a.playbackRate, a.currentTime + 0.35) - latencyRef.current);
        if (now - lastUiRef.current > 40) { lastUiRef.current = now; setTime(est); }
        const b = beatsRef.current;
        if (metroRef.current && !a.paused && b) {
          const ctx = getAudioContext();
          const horizon = t + 0.25;
          let i = nextBeatRef.current;
          if (i === 0 || b[i - 1] > t) { i = 0; while (i < b.length && b[i] < t) i++; }
          while (i < b.length && b[i] < horizon) {
            const when = ctx.currentTime + (b[i] - t) / rateRef.current + latencyRef.current; // clicks land with the sound, not before it
            click(when, i % 4 === downbeatPhase);
            i++;
          }
          nextBeatRef.current = i;
        }
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [click, downbeatPhase]);

  /** The playhead right now, interpolated between the coarse updates iOS gives us. */
  const now = useCallback(() => {
    const a = audioRef.current;
    if (!a) return 0;
    const t = a.currentTime;
    if (t !== ctRef.current.value) ctRef.current = { value: t, at: performance.now() };
    if (a.paused) return t;
    return Math.max(0, Math.min(t + ((performance.now() - ctRef.current.at) / 1000) * a.playbackRate, t + 0.35) - latencyRef.current);
  }, []);

  const toggle = useCallback(() => {
    const a = audioRef.current; if (!a) return;
    if (a.paused) {
      nextBeatRef.current = 0;
      a.play().catch(() => {});
      // the context may get replaced while resuming (iOS after an interruption); the shifter follows it
      resumeAudio().then(() => { if (graphRef.current && graphRef.current.ctx !== getAudioContext()) applyPitch(); }).catch(() => {});
    } else a.pause();
  }, [applyPitch]);
  const seek = useCallback((t: number) => { const a = audioRef.current; if (a) { a.currentTime = Math.max(0, Math.min(t, a.duration || t)); nextBeatRef.current = 0; setTime(a.currentTime); } }, []);
  const setRate = useCallback((r: number) => { setRateState(r); if (audioRef.current) audioRef.current.playbackRate = r; }, []);

  return useMemo(() => ({ playing, time, duration, rate, loop, metronome, shifting, toggle, seek, setRate, setLoop, setMetronome, now }),
    [playing, time, duration, rate, loop, metronome, shifting, toggle, seek, setRate, now]);
}

export function fmtTime(t: number) {
  if (!isFinite(t)) return "0:00";
  const m = Math.floor(t / 60), s = Math.floor(t % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}
