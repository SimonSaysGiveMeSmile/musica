"use client";
import { useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import { onLive } from "@/lib/analysis/client";
import type { LiveFrame } from "@/lib/analysis/types";
import { pitchToNote, startMic, type MicHandle } from "@/lib/audio/mic";
import { usePrefs } from "@/lib/store/prefs";
import { ChordDiagram } from "@/components/chords/ChordDiagram";
import { LargeTitle } from "@/components/shell/LargeTitle";
import { IconLive } from "@/components/ui/Icons";

const NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

export function LiveView() {
  const prefs = usePrefs();
  const [on, setOn] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [frame, setFrame] = useState<LiveFrame | null>(null);
  const [stable, setStable] = useState<string | null>(null);
  const micRef = useRef<MicHandle | null>(null);
  const histRef = useRef<string[]>([]);

  useEffect(() => onLive((f) => {
    setFrame(f);
    const h = histRef.current;
    h.push(f.chord); if (h.length > 6) h.shift();
    // stable = chord seen in >= 4 of last 6 frames
    const counts = new Map<string, number>();
    for (const c of h) counts.set(c, (counts.get(c) ?? 0) + 1);
    let best: string | null = null, n = 0;
    for (const [c, k] of counts) if (k > n) { best = c; n = k; }
    setStable(n >= 4 && best !== "N" ? best : null);
  }), []);

  useEffect(() => () => { micRef.current?.stop(); }, []);

  const toggle = async () => {
    if (on) { micRef.current?.stop(); micRef.current = null; setOn(false); setFrame(null); setStable(null); histRef.current = []; return; }
    setErr(null);
    try { micRef.current = await startMic(); setOn(true); }
    catch (e) { setErr((e as Error).name === "NotAllowedError" ? "Microphone access was denied. Allow it in Settings to use Live." : (e as Error).message); }
  };

  const note = frame && frame.pitchConfidence > 0.6 && frame.rms > 0.005 ? pitchToNote(frame.pitch) : null;
  const level = Math.min(1, (frame?.rms ?? 0) * 12);

  return (
    <main className="page-pad-bottom">
      <LargeTitle eyebrow="Listen as you play" title="Live" />
      <section className="px-5 lg:px-10 lg:grid lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-5 lg:items-start space-y-4 lg:space-y-0 lg:max-w-[1000px]">
        {/* Chord stage */}
        <div className="lacquer rounded-[30px] p-6 relative overflow-hidden min-h-[240px] lg:min-h-[420px] flex flex-col items-center justify-center lg:row-span-3">
          <div aria-hidden className="absolute inset-0 pointer-events-none" style={{ background: `radial-gradient(60% 50% at 50% 60%, color-mix(in srgb, var(--gold) ${Math.round(5 + level * 25)}%, transparent), transparent 70%)`, transition: "background 120ms" }} />
          <div className="eyebrow relative">{on ? (stable ? "Hearing" : "Listening…") : "Tap the mic to start"}</div>
          <motion.div key={stable ?? "none"} initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="chordname text-[84px] leading-none text-gold-hi relative mt-2">
            {stable ?? "—"}
          </motion.div>
          {stable && <div className="relative mt-3"><ChordDiagram symbol={stable} instrument={prefs.instrument} size={80} /></div>}
          <div className="relative mt-4 w-full h-1 rounded-full tint-2 overflow-hidden"><div className="h-full" style={{ width: `${level * 100}%`, background: "linear-gradient(90deg, var(--gold-lo), var(--gold-hi))", transition: "width 80ms" }} /></div>
        </div>

        {/* Tuner + chroma */}
        <div className="grid grid-cols-2 lg:grid-cols-1 gap-3">
          <div className="lacquer rounded-[24px] p-4">
            <div className="eyebrow">Tuner</div>
            <div className="flex items-baseline gap-1 mt-1">
              <span className="chordname text-[40px] leading-none">{note ? note.name : "–"}</span>
              <span className="text-ivory-3 text-sm">{note ? note.octave : ""}</span>
            </div>
            <div className="relative h-8 mt-2">
              <div className="absolute left-0 right-0 top-1/2 h-px bg-(--glass-line-hi)" />
              <div className="absolute left-1/2 top-1 bottom-1 w-px bg-gold/70" />
              {note && (
                <motion.div className="absolute top-0 bottom-0 w-1 rounded-full" animate={{ left: `calc(50% + ${(note.cents / 50) * 45}%)` }} transition={{ type: "spring", stiffness: 300, damping: 30 }}
                  style={{ background: Math.abs(note.cents) < 6 ? "var(--gold-hi)" : "var(--felt-hi)" }} />
              )}
            </div>
            <div className="text-[12px] text-ivory-3 mt-1 tabular-nums">{note ? `${note.cents > 0 ? "+" : ""}${note.cents} cents` : "play a single note"}</div>
          </div>
          <div className="lacquer rounded-[24px] p-4">
            <div className="eyebrow">Chroma</div>
            <div className="grid grid-cols-12 gap-[3px] items-end h-16 mt-2">
              {NAMES.map((n, i) => {
                const v = frame?.hpcp?.[i] ?? 0;
                return <div key={n} title={n} className="rounded-sm" style={{ height: `${Math.max(6, v * 100)}%`, background: v > 0.7 ? "var(--gold-hi)" : v > 0.35 ? "var(--gold)" : "var(--tint-2)", transition: "height 80ms" }} />;
              })}
            </div>
            <div className="grid grid-cols-12 text-[8px] text-ivory-3 mt-1 text-center">{NAMES.map((n) => <span key={n}>{n.length === 1 ? n : "·"}</span>)}</div>
          </div>
        </div>

        {err && <p className="text-felt-hi text-sm">{err}</p>}

        <button onClick={toggle} className={`press w-full h-14 rounded-full font-medium flex items-center justify-center gap-2 ${on ? "glass text-felt-hi pulse-gold" : "gold-fill"}`}>
          <IconLive /> {on ? "Stop listening" : "Start listening"}
        </button>
        <p className="text-ivory-3 text-xs text-center">Audio never leaves your device. Strum a chord and hold it for a second.</p>
      </section>
    </main>
  );
}
