"use client";
import { useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import { onLive } from "@/lib/analysis/client";
import type { LiveFrame } from "@/lib/analysis/types";
import { pitchToNote, startMic, type MicHandle } from "@/lib/audio/mic";
import { usePrefs, setPrefs } from "@/lib/store/prefs";
import type { Instrument } from "@/lib/theory/coverage";
import { ChordDiagram } from "@/components/chords/ChordDiagram";
import { Segmented } from "@/components/ui/Segmented";
import { IconLive } from "@/components/ui/Icons";
import { Tuner } from "./Tuner";
import { useT } from "@/lib/i18n";

const NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
type Mode = "tuner" | "chords";

/** Live: one screen, no page scroll. Tuner by default; Chords mode for strumming along. */
export function LiveView() {
  const prefs = usePrefs();
  const { t } = useT();
  const [mode, setMode] = useState<Mode>("tuner");
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
    catch (e) { setErr((e as Error).name === "NotAllowedError" ? t("live.micDenied") : (e as Error).message); }
  };

  const note = frame && frame.pitchConfidence > 0.6 && frame.rms > 0.005 ? pitchToNote(frame.pitch) : null;
  const level = Math.min(1, (frame?.rms ?? 0) * 12);

  const micButton = (
    <button onClick={toggle} className={`press w-full h-[52px] rounded-full ios-headline flex items-center justify-center gap-2 ${on ? "glass text-felt-hi pulse-gold" : "gold-fill"}`}>
      <IconLive /> {on ? t("live.stop") : t("live.start")}
    </button>
  );

  return (
    <main className="h-dvh flex flex-col overflow-hidden" style={{ paddingBottom: "calc(var(--tabbar-h) + var(--sab) + 8px)" }}>
      <header className="safe-top px-5 lg:px-10 pt-1 pb-2 flex items-center justify-between gap-3 shrink-0">
        <h1 className="ios-title1 text-ivory">{t("live.title")}</h1>
        <div className="glass rounded-full h-10 p-[3px] flex items-center">
          {(["guitar", "piano", "ukulele"] as Instrument[]).map((i) => (
            <button key={i} onClick={() => setPrefs({ instrument: i })} className={`press h-full px-3 rounded-full ios-footnote capitalize ${prefs.instrument === i ? "lens text-ivory font-semibold" : "label-2 font-medium"}`}>{t(`song.${i}` as const)}</button>
          ))}
        </div>
      </header>
      <div className="px-5 lg:px-10 shrink-0">
        <Segmented id="live-mode" value={mode} onChange={setMode} options={[{ value: "tuner", label: t("live.tuner") }, { value: "chords", label: t("live.chordsMode") }]} />
      </div>

      <section className="flex-1 min-h-0 px-5 lg:px-10 pt-3 overflow-y-auto no-scrollbar lg:max-w-[1000px]" style={{ overscrollBehavior: "contain" }}>
        {mode === "tuner" ? (
          <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_320px] lg:gap-5 lg:items-start space-y-3 lg:space-y-0">
            <Tuner key={prefs.instrument} listening={on} instrument={prefs.instrument} />
            <div className="space-y-2">
              {micButton}
              {err && <p className="text-felt-hi ios-footnote">{err}</p>}
            </div>
          </div>
        ) : (
          <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-5 lg:items-start space-y-3 lg:space-y-0">
            <div className="inset-group rounded-[30px] p-6 relative overflow-hidden min-h-[220px] lg:min-h-[420px] flex flex-col items-center justify-center lg:row-span-3">
              <div aria-hidden className="absolute inset-0 pointer-events-none" style={{ background: `radial-gradient(90% 80% at 50% 60%, color-mix(in srgb, var(--gold) ${Math.round(3 + level * 18)}%, transparent), transparent 100%)`, transition: "background 120ms" }} />
              <div className="eyebrow relative">{on ? (stable ? t("live.hearing") : t("live.listening")) : t("live.tapMic")}</div>
              <motion.div key={stable ?? "none"} initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="chordname text-[76px] leading-none text-gold relative mt-2">
                {stable ?? "—"}
              </motion.div>
              {stable && <div className="relative mt-3"><ChordDiagram symbol={stable} instrument={prefs.instrument} size={76} /></div>}
              <div className="relative mt-4 w-full h-1 rounded-full tint-2 overflow-hidden"><div className="h-full" style={{ width: `${level * 100}%`, background: "var(--gold)", transition: "width 80ms" }} /></div>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-1 gap-3">
              <div className="inset-group p-4">
                <div className="eyebrow">{t("live.pitch")}</div>
                <div className="flex items-baseline gap-1 mt-1">
                  <span className="chordname text-[36px] leading-none">{note ? note.name : "–"}</span>
                  <span className="label-2 ios-subhead">{note ? note.octave : ""}</span>
                </div>
                <div className="ios-caption label-2 mt-1 tabular-nums">{note ? t("live.cents", { n: `${note.cents > 0 ? "+" : ""}${note.cents}` }) : t("live.singleNotes")}</div>
                <button onClick={() => setMode("tuner")} className="press ios-footnote text-gold mt-2">{t("live.openTuner")}</button>
              </div>
              <div className="inset-group p-4">
                <div className="eyebrow">{t("live.chroma")}</div>
                <div className="grid grid-cols-12 gap-[3px] items-end h-14 mt-2">
                  {NAMES.map((n, i) => {
                    const v = frame?.hpcp?.[i] ?? 0;
                    return <div key={n} title={n} className="rounded-sm" style={{ height: `${Math.max(6, v * 100)}%`, background: v > 0.7 ? "var(--gold)" : v > 0.35 ? "var(--gold-lo)" : "var(--tint-2)", transition: "height 80ms" }} />;
                  })}
                </div>
                <div className="grid grid-cols-12 text-[8px] label-3 mt-1 text-center">{NAMES.map((n) => <span key={n}>{n.length === 1 ? n : "·"}</span>)}</div>
              </div>
            </div>

            <div className="space-y-2">
              {micButton}
              {err && <p className="text-felt-hi ios-footnote">{err}</p>}
              <p className="label-2 ios-footnote text-center">{t("live.privacyChords")}</p>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
