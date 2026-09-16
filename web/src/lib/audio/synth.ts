"use client";
/** A small piano-ish voice, and a transport that plays a note list when there is no recording.
 *  Three partials with an exponential decay and a gentle low-pass: enough to hear a note clearly
 *  without shipping samples. */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getAudioContext, resumeAudio } from "./context";
import type { TutorialNote } from "@/lib/tutorial/types";

const PARTIALS = [
  { ratio: 1, gain: 1 },
  { ratio: 2, gain: 0.32 },
  { ratio: 3, gain: 0.12 },
];

interface Voice { stop: (at: number) => void }

function strike(ctx: AudioContext, midi: number, at: number, seconds: number, volume: number): Voice {
  const f0 = 440 * Math.pow(2, (midi - 69) / 12);
  const out = ctx.createGain();
  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.setValueAtTime(Math.min(9000, f0 * 8 + 900), at);
  // higher notes decay faster, as strings do
  const decay = Math.max(0.5, Math.min(3.4, 260 / f0)) * (seconds > 0.6 ? 1.2 : 0.8);
  out.gain.setValueAtTime(0.0001, at);
  out.gain.exponentialRampToValueAtTime(volume, at + 0.006);
  out.gain.exponentialRampToValueAtTime(volume * 0.28, at + Math.min(seconds, decay * 0.5));
  const osc: OscillatorNode[] = [];
  for (const p of PARTIALS) {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "sine";
    o.frequency.setValueAtTime(f0 * p.ratio, at);
    g.gain.value = p.gain;
    o.connect(g).connect(lp);
    o.start(at);
    osc.push(o);
  }
  lp.connect(out).connect(ctx.destination);
  const release = (t: number) => {
    const end = Math.max(t, at + 0.02);
    try {
      out.gain.cancelScheduledValues(end);
      out.gain.setValueAtTime(Math.max(0.0001, out.gain.value), end);
      out.gain.exponentialRampToValueAtTime(0.0001, end + 0.14);
    } catch { /* the node may already be finished */ }
    for (const o of osc) { try { o.stop(end + 0.2); } catch { /* already stopped */ } }
    setTimeout(() => { try { out.disconnect(); lp.disconnect(); } catch { /* gone */ } }, (end + 0.4 - ctx.currentTime) * 1000 + 60);
  };
  release(at + seconds);
  return { stop: release };
}

/** Play one note now — used when someone taps a key. */
export async function previewNote(midi: number, seconds = 0.7, volume = 0.22): Promise<void> {
  const ctx = await resumeAudio();
  strike(ctx, midi, ctx.currentTime + 0.01, seconds, volume);
}

export interface Transport {
  playing: boolean; time: number; duration: number; rate: number;
  toggle: () => void; seek: (t: number) => void; setRate: (r: number) => void;
  /** The playhead right now, for animation. */
  now: () => number;
}

const LOOKAHEAD = 0.35;

/** A transport for songs that have notes but no recording. Same shape as the audio player. */
export function useSynthPlayer(notes: TutorialNote[], duration: number, volume = 0.18): Transport {
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [rate, setRateState] = useState(1);
  const origin = useRef({ ctxTime: 0, pos: 0 });
  const cursor = useRef(0);
  const voices = useRef<Voice[]>([]);
  const rafRef = useRef(0);
  const rateRef = useRef(rate);
  const playRef = useRef(false);
  const sorted = useMemo(() => [...notes].sort((a, b) => a.start - b.start), [notes]);

  const silence = useCallback(() => {
    const ctx = getAudioContext();
    for (const v of voices.current) v.stop(ctx.currentTime);
    voices.current = [];
  }, []);

  const posNow = useCallback(() => {
    if (!playRef.current) return origin.current.pos;
    const ctx = getAudioContext();
    return origin.current.pos + (ctx.currentTime - origin.current.ctxTime) * rateRef.current;
  }, []);

  // schedule everything that falls inside the lookahead window, then move the UI clock
  useEffect(() => {
    const tick = () => {
      if (playRef.current) {
        const ctx = getAudioContext();
        const pos = posNow();
        if (pos >= duration) { playRef.current = false; setPlaying(false); silence(); setTime(duration); }
        else {
          const until = pos + LOOKAHEAD * rateRef.current;
          while (cursor.current < sorted.length && sorted[cursor.current].start < until) {
            const n = sorted[cursor.current++];
            if (n.start < pos - 0.05) continue;
            const at = origin.current.ctxTime + (n.start - origin.current.pos) / rateRef.current;
            voices.current.push(strike(ctx, n.midi, Math.max(ctx.currentTime, at), Math.max(0.12, (n.end - n.start) / rateRef.current), volume));
          }
          if (voices.current.length > 64) voices.current.splice(0, voices.current.length - 64);
          setTime(pos);
        }
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [sorted, duration, volume, posNow, silence]);

  useEffect(() => () => silence(), [silence]);

  const seek = useCallback((t: number) => {
    const clamped = Math.max(0, Math.min(t, duration));
    silence();
    const ctx = getAudioContext();
    origin.current = { ctxTime: ctx.currentTime, pos: clamped };
    cursor.current = sorted.findIndex((n) => n.start >= clamped - 0.05);
    if (cursor.current < 0) cursor.current = sorted.length;
    setTime(clamped);
  }, [duration, silence, sorted]);

  const toggle = useCallback(() => {
    if (playRef.current) { const p = posNow(); playRef.current = false; setPlaying(false); silence(); origin.current = { ctxTime: 0, pos: p }; setTime(p); return; }
    resumeAudio().then((ctx) => {
      const pos = origin.current.pos >= duration - 0.05 ? 0 : origin.current.pos;
      origin.current = { ctxTime: ctx.currentTime, pos };
      cursor.current = Math.max(0, sorted.findIndex((n) => n.start >= pos - 0.05));
      if (!sorted.some((n) => n.start >= pos - 0.05)) cursor.current = sorted.length;
      playRef.current = true;
      setPlaying(true);
    }).catch(() => {});
  }, [duration, posNow, silence, sorted]);

  const setRate = useCallback((r: number) => {
    const p = posNow();
    rateRef.current = r;
    setRateState(r);
    if (playRef.current) { const ctx = getAudioContext(); silence(); origin.current = { ctxTime: ctx.currentTime, pos: p }; cursor.current = Math.max(0, sorted.findIndex((n) => n.start >= p - 0.05)); }
  }, [posNow, silence, sorted]);

  return useMemo(() => ({ playing, time, duration, rate, toggle, seek, setRate, now: posNow }), [playing, time, duration, rate, toggle, seek, setRate, posNow]);
}
