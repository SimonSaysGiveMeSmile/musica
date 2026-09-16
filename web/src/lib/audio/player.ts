"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getAudioContext, resumeAudio } from "./context";

export interface Loop { a: number; b: number }

export function usePlayer(src: string | null, beats: number[] | undefined, downbeatPhase = 0) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
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

  useEffect(() => {
    const a = new Audio();
    a.preload = "auto";
    (a as HTMLAudioElement & { preservesPitch: boolean }).preservesPitch = true;
    audioRef.current = a;
    const onMeta = () => setDuration(a.duration || 0);
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    a.addEventListener("loadedmetadata", onMeta);
    a.addEventListener("durationchange", onMeta);
    a.addEventListener("play", onPlay);
    a.addEventListener("pause", onPause);
    a.addEventListener("ended", onPause);
    return () => { a.pause(); a.src = ""; audioRef.current = null; };
  }, []);

  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    if (src) { a.src = src; a.load(); }
    setTime(0);
  }, [src]);

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
        const est = a.paused ? a.currentTime : Math.min(a.currentTime + ((now - ctRef.current.at) / 1000) * a.playbackRate, a.currentTime + 0.35);
        if (now - lastUiRef.current > 40) { lastUiRef.current = now; setTime(est); }
        const b = beatsRef.current;
        if (metroRef.current && !a.paused && b) {
          const ctx = getAudioContext();
          const horizon = t + 0.25;
          let i = nextBeatRef.current;
          if (i === 0 || b[i - 1] > t) { i = 0; while (i < b.length && b[i] < t) i++; }
          while (i < b.length && b[i] < horizon) {
            const when = ctx.currentTime + (b[i] - t) / rateRef.current;
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
    return Math.min(t + ((performance.now() - ctRef.current.at) / 1000) * a.playbackRate, t + 0.35);
  }, []);

  const toggle = useCallback(() => {
    const a = audioRef.current; if (!a) return;
    if (a.paused) {
      resumeAudio().catch(() => {});
      nextBeatRef.current = 0;
      a.play().catch(() => {});
    } else a.pause();
  }, []);
  const seek = useCallback((t: number) => { const a = audioRef.current; if (a) { a.currentTime = Math.max(0, Math.min(t, a.duration || t)); nextBeatRef.current = 0; setTime(a.currentTime); } }, []);
  const setRate = useCallback((r: number) => { setRateState(r); if (audioRef.current) audioRef.current.playbackRate = r; }, []);

  return useMemo(() => ({ playing, time, duration, rate, loop, metronome, toggle, seek, setRate, setLoop, setMetronome, now }),
    [playing, time, duration, rate, loop, metronome, toggle, seek, setRate, now]);
}

export function fmtTime(t: number) {
  if (!isFinite(t)) return "0:00";
  const m = Math.floor(t / 60), s = Math.floor(t % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}
