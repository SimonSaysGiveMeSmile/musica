"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { motion, useMotionValueEvent, useSpring } from "motion/react";
import { HeadstockGuide, KeyboardGuide } from "./TunerGuide";
import { onLive } from "@/lib/analysis/client";
import type { Instrument } from "@/lib/theory/coverage";
import { PitchSmoother, TUNINGS, playReference, readPitch, type Reading } from "@/lib/audio/tuning";
import { useT } from "@/lib/i18n";

const A4_KEY = "musica.tuner.a4";

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
    <div className="inset-group rounded-[30px] px-5 pt-4 pb-4 relative overflow-hidden flex flex-col">
      <div aria-hidden className="absolute inset-0 pointer-events-none transition-opacity duration-300" style={{ opacity: inTune ? 1 : 0, background: "radial-gradient(100% 90% at 50% 30%, color-mix(in srgb, var(--gold) 12%, transparent), transparent 100%)" }} />

      {/* the note */}
      <div className="relative text-center">
        <div className="flex items-baseline justify-center gap-1">
          <motion.span key={reading?.targetLabel ?? "-"} initial={{ opacity: 0.4, y: 4 }} animate={{ opacity: 1, y: 0 }} className="chordname text-[68px] leading-none" style={{ color: reading ? tone : "var(--label-3)" }}>
            {reading ? reading.targetLabel.replace(/\d+$/, "") : "·"}
          </motion.span>
          <span className="ios-title2 label-2">{reading ? reading.targetLabel.match(/\d+$/)?.[0] : ""}</span>
        </div>
        <div className="ios-subhead mt-1 tabular-nums" style={{ color: reading ? tone : "var(--label-2)" }}>
          {reading ? `${reading.cents > 0 ? "+" : ""}${Math.round(reading.cents)}¢ · ${reading.freq.toFixed(1)} Hz` : status}
        </div>
      </div>

      {/* the dial: a VU-meter arc, ±50 cents across 160°, needle sprung from the base */}
      <div className="relative mt-1 mx-auto w-full max-w-[300px]">
        <Dial cents={cents} live={!!reading} inTune={inTune} tone={tone} />
        <div className="absolute inset-x-0 bottom-0 flex justify-between ios-caption2 label-3 px-1"><span>♭ 50</span><span>50 ♯</span></div>
      </div>

      {/* input level */}
      <div className="relative mt-2 h-[3px] rounded-full tint-2 overflow-hidden"><div className="h-full" style={{ width: `${(listening ? level : 0) * 100}%`, background: "var(--gold)", transition: "width 80ms" }} /></div>
      {listening && held >= 8 && <div className="relative mt-2 text-center ios-footnote text-gold">{t("tuner.held")}</div>}

      {/* the instrument: pegs and keys are the buttons */}
      <div className="relative mt-3">
        <div className="flex items-center justify-between mb-1">
          <span className="eyebrow">{chromatic ? t("tuner.chromatic") : t("tuner.strings")}</span>
          {!chromatic && tunings.length > 1 && (
            <select value={tuningId} onChange={(e) => { setTuningId(e.target.value); setLocked(null); }} className="glass rounded-full h-8 px-3 ios-footnote text-ivory bg-transparent outline-none" aria-label={t("tuner.tuning")}>
              {tunings.map((tn) => <option key={tn.id} value={tn.id} className="text-black">{tuningName(tn)}</option>)}
            </select>
          )}
        </div>
        {!chromatic ? (
          <HeadstockGuide strings={tuning.strings} active={reading?.stringIndex ?? null} locked={locked} sounding={playing} inTune={inTune}
            onTap={(i) => { setLocked(locked === i ? null : i); play(tuning.strings[i].midi); }} />
        ) : (
          <KeyboardGuide activeMidi={reading ? reading.nearestMidi : null} sounding={playing} inTune={inTune} onTap={(m) => play(m)} />
        )}
      </div>

      {/* reference pitch, one quiet line */}
      <div className="relative mt-3 flex items-center justify-between">
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


/** Arc gauge. Angles run from -80° (flat) to +80° (sharp); 0 is straight up. The needle is rotated with an
 *  SVG transform about the pivot point itself, which every browser honours (CSS transform-origin on SVG does not). */
function Dial({ cents, live, inTune, tone }: { cents: number; live: boolean; inTune: boolean; tone: string }) {
  const W = 300, H = 158, cx = 150, cy = 150, R = 124;
  const rad = (deg: number) => ((deg - 90) * Math.PI) / 180;
  const pt = (deg: number, r: number) => ({ x: cx + r * Math.cos(rad(deg)), y: cy + r * Math.sin(rad(deg)) });
  const target = live ? (cents / 50) * 80 : 0;
  const spring = useSpring(0, { stiffness: 220, damping: 22, mass: 0.7 });
  const needleRef = useRef<SVGGElement>(null);
  useEffect(() => { spring.set(target); }, [target, spring]);
  useMotionValueEvent(spring, "change", (v) => { needleRef.current?.setAttribute("transform", `rotate(${v} ${cx} ${cy})`); });
  const arc = (from: number, to: number, r: number) => {
    const a = pt(from, r), b = pt(to, r);
    return `M ${a.x} ${a.y} A ${r} ${r} 0 ${to - from > 180 ? 1 : 0} 1 ${b.x} ${b.y}`;
  };
  const ticks: { deg: number; len: number; major: boolean }[] = [];
  for (let c = -50; c <= 50; c += 5) ticks.push({ deg: (c / 50) * 80, len: c === 0 ? 18 : c % 25 === 0 ? 12 : 6, major: c % 25 === 0 });
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto block" aria-hidden>
      <path d={arc(-80, 80, R)} fill="none" stroke="var(--separator)" strokeWidth={1.5} strokeLinecap="round" />
      <path d={arc(-8, 8, R)} fill="none" stroke="var(--gold)" strokeOpacity={inTune ? 0.95 : 0.35} strokeWidth={4} strokeLinecap="round" style={{ transition: "stroke-opacity 200ms" }} />
      {ticks.map((tk) => {
        const o = pt(tk.deg, R - 4), i = pt(tk.deg, R - 4 - tk.len);
        return <line key={tk.deg} x1={o.x} y1={o.y} x2={i.x} y2={i.y} stroke={tk.deg === 0 ? "var(--gold)" : "var(--label-3)"} strokeWidth={tk.major ? 1.6 : 1} strokeLinecap="round" />;
      })}
      <g ref={needleRef} transform={`rotate(0 ${cx} ${cy})`} style={{ opacity: live ? 1 : 0.28, transition: "opacity 200ms" }}>
        <line x1={cx} y1={cy - 10} x2={cx} y2={cy - R + 14} stroke={tone} strokeWidth={3} strokeLinecap="round"
          style={{ filter: inTune ? "drop-shadow(0 0 8px color-mix(in srgb, var(--gold) 70%, transparent))" : "none" }} />
      </g>
      <circle cx={cx} cy={cy} r={7} fill="var(--lacquer-3)" stroke="var(--separator)" strokeWidth={1} />
      <circle cx={cx} cy={cy} r={2.5} fill={live ? tone : "var(--label-3)"} />
    </svg>
  );
}
