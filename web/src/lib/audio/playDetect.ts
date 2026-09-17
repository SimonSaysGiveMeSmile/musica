"use client";
/** Listens through the microphone and decides whether someone is playing right now.
 *
 *  The level to beat is not fixed: a floor follows the room (and whatever the backing track leaks
 *  past echo cancellation), and playing has to rise clearly above it. So it keeps working in a quiet
 *  bedroom and in a noisy room, and it does not hear the song as the player. */
import { useEffect, useRef, useState } from "react";
import { onLive, setLiveMode } from "@/lib/analysis/client";
import { startMic, type MicHandle } from "./mic";

export type Sensitivity = 1 | 2 | 3;

/** ratio above the room floor, and the absolute level below which nothing counts */
const TUNING: Record<Sensitivity, { ratio: number; floor: number }> = {
  1: { ratio: 4.0, floor: 0.012 },   // only clear, close playing
  2: { ratio: 2.8, floor: 0.005 },
  3: { ratio: 2.0, floor: 0.002 },   // hears quiet practice, and more of the room
};

export interface PlayDetect {
  listening: boolean;
  /** true while the microphone is hearing playing */
  playing: boolean;
  level: number;      // 0..1, for the meter
  error: string | null;
}

export interface PlayDetectOptions {
  enabled: boolean;
  sensitivity: Sensitivity;
  /** Which instrument to expect, so the pitch check uses that range. */
  instrument?: string;
  /** How long the silence has to last before it counts as stopping. */
  holdMs?: number;
  onIdle?: () => void;
  onActive?: () => void;
  onError?: (message: string) => void;
}

export function usePlayDetect({ enabled, sensitivity, instrument, holdMs = 1600, onIdle, onActive, onError }: PlayDetectOptions): PlayDetect {
  const [listening, setListening] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [level, setLevel] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const micRef = useRef<MicHandle | null>(null);
  const aliveRef = useRef(true);
  const floorRef = useRef(0.004);
  const lastTsRef = useRef(0);
  const lastHotRef = useRef(0);
  const playingRef = useRef(false);
  const sensRef = useRef(sensitivity);
  const cbs = useRef({ onIdle, onActive, onError });
  useEffect(() => { cbs.current = { onIdle, onActive, onError }; sensRef.current = sensitivity; }, [onIdle, onActive, onError, sensitivity]);

  useEffect(() => { aliveRef.current = true; return () => { aliveRef.current = false; micRef.current?.stop(); micRef.current = null; }; }, []);

  // one effect owns the microphone: opened while enabled, closed by the cleanup
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    let handle: MicHandle | null = null;
    (async () => {
      try {
        setError(null);
        setLiveMode("level");
        // echo cancellation keeps the backing track out of the microphone
        const h = await startMic({ echoCancellation: true, instrument });
        if (cancelled || !aliveRef.current) { h.stop(); return; }
        h.onLost = () => {
          if (micRef.current !== h) return;
          micRef.current = null;
          playingRef.current = false;
          setListening(false); setPlaying(false); setLevel(0);
          setError("lost");
          cbs.current.onError?.("lost");
        };
        handle = h;
        micRef.current = h;
        floorRef.current = 0.004;
        lastTsRef.current = 0;
        lastHotRef.current = 0;
        setListening(true);
      } catch (e) {
        const name = (e as Error).name === "NotAllowedError" ? "denied" : "failed";
        if (!cancelled && aliveRef.current) { setError(name); cbs.current.onError?.(name); }
      }
    })();
    return () => {
      cancelled = true;
      handle?.stop();
      if (micRef.current === handle) micRef.current = null;
      playingRef.current = false;
      setListening(false); setPlaying(false); setLevel(0);
      setLiveMode("full");
    };
  }, [enabled, instrument]);

  // every frame: track the room, then ask whether this is louder than the room
  useEffect(() => {
    if (!listening) return;
    return onLive((f) => {
      const rms = f.rms;
      const floor = floorRef.current;
      // the floor drops quickly and rises slowly, at rates set in seconds so the frame rate cannot change them
      const now = performance.now();
      const dt = lastTsRef.current ? Math.min(0.5, (now - lastTsRef.current) / 1000) : 0.085;
      lastTsRef.current = now;
      const down = 1 - Math.exp(-dt / 0.24), up = 1 - Math.exp(-dt / 4.2);
      floorRef.current = rms < floor ? floor + (rms - floor) * down : floor + (rms - floor) * up;
      const { ratio, floor: absFloor } = TUNING[sensRef.current];
      const threshold = Math.max(absFloor, floorRef.current * ratio);
      // loud enough, and either a note the recogniser can hold on to or a strike too sharp to be the room
      const pitched = f.pitchConfidence > 0.35 || rms > threshold * 2.5;
      if (rms > threshold && pitched) lastHotRef.current = performance.now();
      setLevel(Math.min(1, rms / Math.max(threshold, 1e-4) / 3));
    });
  }, [listening]);

  // the transition itself, on a timer so stopping is noticed even when frames dry up
  useEffect(() => {
    if (!listening) return;
    const id = setInterval(() => {
      const hot = performance.now() - lastHotRef.current < holdMs;
      if (hot === playingRef.current) return;
      playingRef.current = hot;
      setPlaying(hot);
      if (hot) cbs.current.onActive?.(); else cbs.current.onIdle?.();
    }, 120);
    return () => clearInterval(id);
  }, [listening, holdMs]);

  return { listening, playing, level, error };
}
