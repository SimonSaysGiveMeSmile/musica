"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "motion/react";
import { onLive } from "@/lib/analysis/client";
import type { Instrument } from "@/lib/theory/coverage";
import { PitchSmoother, TUNINGS, midiToFreq, playReference, readPitch, type Reading } from "@/lib/audio/tuning";
import { IconPlay } from "@/components/ui/Icons";
import { useT } from "@/lib/i18n";

const A4_KEY = "musica.tuner.a4";

export function Tuner({ listening, instrument }: { listening: boolean; instrument: Instrument }) {
  const { t } = useT();
  const tunings = TUNINGS[instrument];
  const tuningName = (tn: (typeof tunings)[number]) => (tn.id === "dadgad" ? "DADGAD" : t(tn.name));
  const [tuningId, setTuningId] = useState(tunings[0].id);
  const tuning = tunings.find((t) => t.id === tuningId) ?? tunings[0];
  const [locked, setLocked] = useState<number | null>(null);
  const [a4, setA4] = useState(() => { try { const v = Number(localStorage.getItem(A4_KEY)); return v >= 415 && v <= 466 ? v : 440; } catch { return 440; } });
  const [rawReading, setReading] = useState<Reading | null>(null);
  const reading = listening ? rawReading : null;
  const [held, setHeld] = useState(0); // consecutive in-tune frames
  const smoother = useRef(new PitchSmoother(5));
  const lastGood = useRef(0);

  useEffect(() => { try { localStorage.setItem(A4_KEY, String(a4)); } catch {} }, [a4]);

  useEffect(() => onLive((frame) => {
    const good = frame.pitchConfidence > 0.55 && frame.rms > 0.004 && frame.pitch > 25;
    if (good) {
      const f = smoother.current.push(frame.pitch);
      const r = readPitch(f, tuning, a4, locked);
      setReading(r);
      lastGood.current = performance.now();
      setHeld((h) => (r && Math.abs(r.cents) <= 5 ? Math.min(h + 1, 30) : 0));
    } else if (performance.now() - lastGood.current > 900) {
      setReading(null); setHeld(0); smoother.current.reset();
    }
  }), [tuning, a4, locked]);

  const cents = reading ? Math.max(-50, Math.min(50, reading.cents)) : 0;
  const inTune = !!reading && Math.abs(reading.cents) <= 5;
  const tone = useMemo(() => (inTune ? "var(--gold-hi)" : Math.abs(cents) < 15 ? "var(--ivory)" : "var(--felt-hi)"), [inTune, cents]);
  const chromatic = tuning.strings.length === 0;

  return (
    <div className="space-y-4">
      {/* Gauge */}
      <div className="inset-group rounded-[30px] p-5 relative overflow-hidden">
        <div aria-hidden className="absolute inset-0 pointer-events-none transition-opacity duration-300" style={{ opacity: inTune ? 1 : 0, background: "radial-gradient(60% 60% at 50% 40%, color-mix(in srgb, var(--gold) 22%, transparent), transparent 70%)" }} />
        <div className="relative flex items-end justify-between">
          <div>
            <div className="eyebrow">{listening ? (reading ? (inTune ? t("tuner.inTune") : reading.cents < 0 ? t("tuner.tuneUp") : t("tuner.tuneDown")) : t("tuner.playNote")) : t("live.tapMic")}</div>
            <div className="flex items-baseline gap-2 mt-1">
              <motion.span key={reading?.targetLabel ?? "-"} initial={{ opacity: 0.4, y: 4 }} animate={{ opacity: 1, y: 0 }} className="chordname text-[64px] leading-none" style={{ color: tone }}>
                {reading ? reading.targetLabel.replace(/\d+$/, "") : "–"}
              </motion.span>
              <span className="ios-title3 label-2">{reading ? reading.targetLabel.match(/\d+$/)?.[0] : ""}</span>
            </div>
          </div>
          <div className="text-right">
            <div className="ios-footnote label-2 tabular-nums">{reading ? `${reading.freq.toFixed(1)} Hz` : ""}</div>
            <div className="ios-title3 tabular-nums" style={{ color: tone }}>{reading ? `${reading.cents > 0 ? "+" : ""}${Math.round(reading.cents)}¢` : ""}</div>
          </div>
        </div>

        {/* needle track */}
        <div className="relative mt-5 h-16">
          <div className="absolute inset-x-0 top-1/2 h-px bg-(--separator)" />
          {[-50, -40, -30, -20, -10, 0, 10, 20, 30, 40, 50].map((c) => (
            <span key={c} aria-hidden className="absolute top-1/2 -translate-y-1/2 w-px rounded" style={{ left: `calc(50% + ${(c / 50) * 46}%)`, height: c === 0 ? 34 : c % 20 === 0 ? 18 : 10, background: c === 0 ? "var(--gold)" : "var(--separator)" }} />
          ))}
          <span aria-hidden className="absolute top-1/2 -translate-y-1/2 h-10 rounded-full" style={{ left: "calc(50% - 4.6%)", width: "9.2%", background: "color-mix(in srgb, var(--gold) 14%, transparent)" }} />
          <motion.div
            aria-hidden
            className="absolute top-1/2 -translate-y-1/2 w-[3px] h-12 rounded-full"
            animate={{ left: `calc(50% + ${(cents / 50) * 46}%)`, opacity: reading ? 1 : 0.25 }}
            transition={{ type: "spring", stiffness: 260, damping: 26, mass: 0.6 }}
            style={{ background: tone, boxShadow: inTune ? "0 0 18px color-mix(in srgb, var(--gold-hi) 70%, transparent)" : "none" }}
          />
          <div className="absolute inset-x-0 -bottom-1 flex justify-between ios-caption2 label-3 px-1"><span>♭ 50</span><span>0</span><span>50 ♯</span></div>
        </div>
        {listening && held >= 8 && <div className="relative mt-3 text-center ios-footnote text-gold">{t("tuner.held")}</div>}
      </div>

      {/* Strings */}
      {!chromatic ? (
        <div className="inset-group p-3">
          <div className="flex items-center justify-between px-1 mb-2">
            <span className="eyebrow">{t("tuner.strings")}</span>
            <select value={tuningId} onChange={(e) => { setTuningId(e.target.value); setLocked(null); }} className="glass rounded-full h-8 px-3 ios-footnote text-ivory bg-transparent outline-none" aria-label={t("tuner.tuning")}>
              {tunings.map((tn) => <option key={tn.id} value={tn.id} className="text-black">{tuningName(tn)}</option>)}
            </select>
          </div>
          <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${tuning.strings.length}, minmax(0, 1fr))` }}>
            {tuning.strings.map((s, i) => {
              const active = reading?.stringIndex === i;
              const isLocked = locked === i;
              return (
                <div key={s.label} className="flex flex-col items-center gap-1.5">
                  <button
                    onClick={() => setLocked(isLocked ? null : i)}
                    aria-pressed={isLocked}
                    className={`press w-full h-14 rounded-[16px] chordname ios-headline flex flex-col items-center justify-center ${active ? "lens text-ivory" : "glass label-2"} ${isLocked ? "ring-1 ring-gold-hi/70" : ""}`}
                  >
                    <span style={{ color: active && inTune ? "var(--gold-hi)" : undefined }}>{s.label.replace(/\d+$/, "")}</span>
                    <span className="ios-caption2 label-3 font-normal">{s.label.match(/\d+$/)?.[0]}</span>
                  </button>
                  <button onClick={() => playReference(s.midi, a4)} aria-label={t("tuner.playRef", { note: s.label })} className="press circle-btn !w-8 !h-8 glass label-2"><IconPlay width={12} height={12} /></button>
                </div>
              );
            })}
          </div>
          <p className="ios-caption label-3 mt-2 px-1">{t("tuner.autoDetect")}</p>
        </div>
      ) : (
        <div className="inset-group p-4">
          <div className="eyebrow mb-1">{t("tuner.chromatic")}</div>
          <p className="ios-footnote label-2">{t("tuner.chromaticHint")}</p>
          <div className="flex flex-wrap gap-2 mt-3">
            {[57, 60, 64, 69, 72].map((m) => (
              <button key={m} onClick={() => playReference(m, a4, 2.2)} className="press glass rounded-full h-9 px-3.5 ios-footnote text-ivory flex items-center gap-1.5"><IconPlay width={12} height={12} /> {midiToFreq(m, a4).toFixed(0)} Hz · {["A3", "C4", "E4", "A4", "C5"][[57, 60, 64, 69, 72].indexOf(m)]}</button>
            ))}
          </div>
        </div>
      )}

      {/* Reference pitch */}
      <div className="inset-group">
        <div className="row">
          <span className="ios-body flex-1">{t("tuner.reference")}</span>
          <button onClick={() => setA4((v) => Math.max(415, v - 1))} className="press circle-btn !w-9 !h-9 glass text-ivory" aria-label={t("tuner.lower")}>−</button>
          <span className="chordname ios-headline tabular-nums w-16 text-center text-gold-hi">{a4} Hz</span>
          <button onClick={() => setA4((v) => Math.min(466, v + 1))} className="press circle-btn !w-9 !h-9 glass text-ivory" aria-label={t("tuner.raise")}>+</button>
          {a4 !== 440 && <button onClick={() => setA4(440)} className="press ios-footnote text-gold ml-1">{t("common.reset")}</button>}
        </div>
      </div>
    </div>
  );
}
