"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "motion/react";
import { onLive } from "@/lib/analysis/client";
import type { Instrument } from "@/lib/theory/coverage";
import { PitchSmoother, TUNINGS, playReference, readPitch, type Reading } from "@/lib/audio/tuning";
import { useT } from "@/lib/i18n";

const A4_KEY = "musica.tuner.a4";
const PIANO_REFS = [{ label: "A3", midi: 57 }, { label: "C4", midi: 60 }, { label: "E4", midi: 64 }, { label: "A4", midi: 69 }, { label: "C5", midi: 72 }];

/** One card: what you hear, how far off it is, and the strings to tune. */
export function Tuner({ listening, instrument }: { listening: boolean; instrument: Instrument }) {
  const { t } = useT();
  const tunings = TUNINGS[instrument];
  const tuningName = (tn: (typeof tunings)[number]) => (tn.id === "dadgad" ? "DADGAD" : t(tn.name));
  const [tuningId, setTuningId] = useState(tunings[0].id);
  const tuning = tunings.find((x) => x.id === tuningId) ?? tunings[0];
  const [locked, setLocked] = useState<number | null>(null);
  const [a4, setA4] = useState(() => { try { const v = Number(localStorage.getItem(A4_KEY)); return v >= 415 && v <= 466 ? v : 440; } catch { return 440; } });
  const [rawReading, setReading] = useState<Reading | null>(null);
  const reading = listening ? rawReading : null;
  const [held, setHeld] = useState(0);
  const [level, setLevel] = useState(0);
  const [silentFor, setSilentFor] = useState(0);
  const [playing, setPlaying] = useState<number | null>(null); // midi of the tone sounding now
  const smoother = useRef(new PitchSmoother(5));
  const lastGood = useRef(0);

  useEffect(() => { try { localStorage.setItem(A4_KEY, String(a4)); } catch {} }, [a4]);

  useEffect(() => onLive((frame) => {
    setLevel(Math.min(1, frame.rms * 14));
    setSilentFor((n) => (frame.rms < 0.0008 ? n + 1 : 0));
    const good = frame.pitchConfidence > 0.5 && frame.rms > 0.0015 && frame.pitch > 30;
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

  const play = async (midi: number) => {
    if (playing !== null) return;
    setPlaying(midi);
    try { await playReference(midi, a4); } finally { setPlaying(null); }
  };

  const cents = reading ? Math.max(-50, Math.min(50, reading.cents)) : 0;
  const inTune = !!reading && Math.abs(reading.cents) <= 5;
  const tone = useMemo(() => (inTune ? "var(--gold)" : Math.abs(cents) < 15 ? "var(--ivory)" : "var(--felt-hi)"), [inTune, cents]);
  const chromatic = tuning.strings.length === 0;
  const status = !listening ? t("live.tapMic") : reading ? (inTune ? t("tuner.inTune") : reading.cents < 0 ? t("tuner.tuneUp") : t("tuner.tuneDown")) : silentFor >= 30 ? t("tuner.noAudio") : t("tuner.playNote");

  return (
    <div className="inset-group rounded-[30px] p-5 relative overflow-hidden">
      <div aria-hidden className="absolute inset-0 pointer-events-none transition-opacity duration-300" style={{ opacity: inTune ? 1 : 0, background: "radial-gradient(100% 90% at 50% 30%, color-mix(in srgb, var(--gold) 12%, transparent), transparent 100%)" }} />

      {/* the note */}
      <div className="relative text-center pt-2">
        <div className="flex items-baseline justify-center gap-1">
          <motion.span key={reading?.targetLabel ?? "-"} initial={{ opacity: 0.4, y: 4 }} animate={{ opacity: 1, y: 0 }} className="chordname text-[88px] leading-none" style={{ color: reading ? tone : "var(--label-3)" }}>
            {reading ? reading.targetLabel.replace(/\d+$/, "") : "·"}
          </motion.span>
          <span className="ios-title2 label-2">{reading ? reading.targetLabel.match(/\d+$/)?.[0] : ""}</span>
        </div>
        <div className="ios-subhead mt-1 tabular-nums" style={{ color: reading ? tone : "var(--label-2)" }}>
          {reading ? `${reading.cents > 0 ? "+" : ""}${Math.round(reading.cents)}¢ · ${reading.freq.toFixed(1)} Hz` : status}
        </div>
      </div>

      {/* the dial: a VU-meter arc, ±50 cents across 160°, needle sprung from the base */}
      <div className="relative mt-1 -mb-2">
        <Dial cents={cents} live={!!reading} inTune={inTune} tone={tone} />
        <div className="absolute inset-x-0 bottom-1 flex justify-between ios-caption2 label-3 px-2"><span>♭ 50</span><span>50 ♯</span></div>
      </div>

      {/* input level */}
      <div className="relative mt-3 h-[3px] rounded-full tint-2 overflow-hidden"><div className="h-full" style={{ width: `${(listening ? level : 0) * 100}%`, background: "var(--gold)", transition: "width 80ms" }} /></div>
      {listening && held >= 8 && <div className="relative mt-2 text-center ios-footnote text-gold">{t("tuner.held")}</div>}

      {/* strings: tap to hear and select; tap again to release */}
      <div className="relative mt-5">
        <div className="flex items-center justify-between mb-2">
          <span className="eyebrow">{chromatic ? t("tuner.chromatic") : t("tuner.strings")}</span>
          {!chromatic && tunings.length > 1 && (
            <select value={tuningId} onChange={(e) => { setTuningId(e.target.value); setLocked(null); }} className="glass rounded-full h-8 px-3 ios-footnote text-ivory bg-transparent outline-none" aria-label={t("tuner.tuning")}>
              {tunings.map((tn) => <option key={tn.id} value={tn.id} className="text-black">{tuningName(tn)}</option>)}
            </select>
          )}
        </div>
        {!chromatic ? (
          <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${tuning.strings.length}, minmax(0, 1fr))` }}>
            {tuning.strings.map((s, i) => {
              const active = reading?.stringIndex === i;
              const isLocked = locked === i;
              const sounding = playing === s.midi;
              return (
                <button key={s.label}
                  onClick={() => { setLocked(isLocked ? null : i); play(s.midi); }}
                  aria-pressed={isLocked}
                  aria-label={t("tuner.playRef", { note: s.label })}
                  className={`press h-16 rounded-[18px] flex flex-col items-center justify-center chordname ios-headline ${active || sounding ? "lens text-ivory" : "glass label-2"} ${isLocked ? "ring-1 ring-gold/70" : ""}`}
                  style={sounding ? { boxShadow: "0 0 0 1px var(--gold), 0 0 22px color-mix(in srgb, var(--gold) 45%, transparent)" } : undefined}>
                  <span style={{ color: (active && inTune) || sounding ? "var(--gold)" : undefined }}>{s.label.replace(/\d+$/, "")}</span>
                  <span className="ios-caption2 label-3 font-normal">{s.label.match(/\d+$/)?.[0]}</span>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="grid grid-cols-5 gap-2">
            {PIANO_REFS.map((r) => {
              const sounding = playing === r.midi;
              return (
                <button key={r.midi} onClick={() => play(r.midi)} aria-label={t("tuner.playRef", { note: r.label })}
                  className={`press h-16 rounded-[18px] flex flex-col items-center justify-center chordname ios-headline ${sounding ? "lens text-ivory" : "glass label-2"}`}
                  style={sounding ? { boxShadow: "0 0 0 1px var(--gold), 0 0 22px color-mix(in srgb, var(--gold) 45%, transparent)" } : undefined}>
                  <span style={{ color: sounding ? "var(--gold)" : undefined }}>{r.label.replace(/\d+$/, "")}</span>
                  <span className="ios-caption2 label-3 font-normal">{r.label.match(/\d+$/)?.[0]}</span>
                </button>
              );
            })}
          </div>
        )}
        <p className="ios-caption label-3 mt-2">{chromatic ? t("tuner.chromaticHint") : t("tuner.autoDetect")}</p>
      </div>

      {/* reference pitch, one quiet line */}
      <div className="relative mt-4 flex items-center justify-between">
        <span className="ios-footnote label-2">{t("tuner.reference")}</span>
        <div className="flex items-center gap-1">
          <button onClick={() => setA4((v) => Math.max(415, v - 1))} className="press circle-btn !w-8 !h-8 glass text-ivory" aria-label={t("tuner.lower")}>−</button>
          <span className="chordname ios-subhead tabular-nums w-16 text-center text-gold">{a4} Hz</span>
          <button onClick={() => setA4((v) => Math.min(466, v + 1))} className="press circle-btn !w-8 !h-8 glass text-ivory" aria-label={t("tuner.raise")}>+</button>
          {a4 !== 440 && <button onClick={() => setA4(440)} className="press ios-footnote text-gold ml-1">{t("common.reset")}</button>}
        </div>
      </div>
    </div>
  );
}


/** Arc gauge. Angles run from -80° (flat) to +80° (sharp); 0 is straight up. */
function Dial({ cents, live, inTune, tone }: { cents: number; live: boolean; inTune: boolean; tone: string }) {
  const W = 300, H = 168, cx = 150, cy = 158, R = 128;
  const rad = (deg: number) => ((deg - 90) * Math.PI) / 180;
  const pt = (deg: number, r: number) => ({ x: cx + r * Math.cos(rad(deg)), y: cy + r * Math.sin(rad(deg)) });
  const angle = (cents / 50) * 80;
  const arc = (from: number, to: number, r: number) => {
    const a = pt(from, r), b = pt(to, r);
    return `M ${a.x} ${a.y} A ${r} ${r} 0 ${to - from > 180 ? 1 : 0} 1 ${b.x} ${b.y}`;
  };
  const ticks: { deg: number; len: number; major: boolean }[] = [];
  for (let c = -50; c <= 50; c += 5) ticks.push({ deg: (c / 50) * 80, len: c === 0 ? 18 : c % 25 === 0 ? 12 : 6, major: c % 25 === 0 });
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto block" aria-hidden>
      {/* track */}
      <path d={arc(-80, 80, R)} fill="none" stroke="var(--separator)" strokeWidth={1.5} strokeLinecap="round" />
      {/* in-tune window ±5¢ */}
      <path d={arc(-8, 8, R)} fill="none" stroke="var(--gold)" strokeOpacity={inTune ? 0.95 : 0.35} strokeWidth={4} strokeLinecap="round" style={{ transition: "stroke-opacity 200ms" }} />
      {/* ticks */}
      {ticks.map((tk) => {
        const o = pt(tk.deg, R - 4), i = pt(tk.deg, R - 4 - tk.len);
        return <line key={tk.deg} x1={o.x} y1={o.y} x2={i.x} y2={i.y} stroke={tk.deg === 0 ? "var(--gold)" : "var(--label-3)"} strokeWidth={tk.major ? 1.6 : 1} strokeLinecap="round" />;
      })}
      {/* needle */}
      <motion.g
        animate={{ rotate: live ? angle : 0, opacity: live ? 1 : 0.28 }}
        transition={{ type: "spring", stiffness: 220, damping: 22, mass: 0.7 }}
        style={{ originX: `${cx}px`, originY: `${cy}px` }}
      >
        <line x1={cx} y1={cy - 10} x2={cx} y2={cy - R + 14} stroke={tone} strokeWidth={3} strokeLinecap="round"
          style={{ filter: inTune ? "drop-shadow(0 0 8px color-mix(in srgb, var(--gold) 70%, transparent))" : "none" }} />
      </motion.g>
      {/* pivot */}
      <circle cx={cx} cy={cy} r={7} fill="var(--lacquer-3)" stroke="var(--separator)" strokeWidth={1} />
      <circle cx={cx} cy={cy} r={2.5} fill={live ? tone : "var(--label-3)"} />
    </svg>
  );
}
