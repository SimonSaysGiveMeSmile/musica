"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { motion, useMotionValueEvent, useSpring } from "motion/react";
import { onLive } from "@/lib/analysis/client";
import type { Instrument } from "@/lib/theory/coverage";
import { PitchSmoother, TUNINGS, midiName, playReference, readPitch, referencePlaying, splitNote, stopReference, type Reading } from "@/lib/audio/tuning";
import { setPrefs, usePrefs } from "@/lib/store/prefs";
import { useT } from "@/lib/i18n";
import { HeadstockGuide, KeyboardGuide } from "./TunerGuide";

/** One card: the note you are playing, how far off it sits, and the instrument to tune. */
export function Tuner({ listening, instrument }: { listening: boolean; instrument: Instrument }) {
  const { t } = useT();
  const prefs = usePrefs();
  const a4 = prefs.a4;
  const tunings = TUNINGS[instrument];
  const tuningName = (tn: (typeof tunings)[number]) => (tn.id === "dadgad" ? "DADGAD" : t(tn.name));
  const tuning = tunings.find((x) => x.id === prefs.tuning[instrument]) ?? tunings[0];
  const [locked, setLocked] = useState<number | null>(null);
  const [rawReading, setReading] = useState<Reading | null>(null);
  const [held, setHeld] = useState(0);
  const [level, setLevel] = useState(0);
  const [silentFor, setSilentFor] = useState(0);
  const [playing, setPlaying] = useState<number | null>(null);
  const smoother = useRef(new PitchSmoother(5));
  const lastGood = useRef(0);
  const lastFrame = useRef(0);

  // reset per-session counters when listening starts or stops (adjust-state-during-render pattern)
  const [prevListening, setPrevListening] = useState(listening);
  if (prevListening !== listening) { setPrevListening(listening); setReading(null); setHeld(0); setSilentFor(0); setLevel(0); }
  const reading = listening ? rawReading : null;

  useEffect(() => { smoother.current.reset(); if (!listening) stopReference(); }, [listening]);
  useEffect(() => () => stopReference(), []);

  // if frames stop arriving (interrupted context, ended track) the needle must not freeze on a stale reading
  useEffect(() => {
    if (!listening) return;
    const id = setInterval(() => { if (performance.now() - lastFrame.current > 1200) { setReading(null); setHeld(0); setLevel(0); } }, 400);
    return () => clearInterval(id);
  }, [listening]);

  useEffect(() => onLive((frame) => {
    lastFrame.current = performance.now();
    if (referencePlaying()) return; // the mic is muted while our own tone sounds; those frames mean nothing
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
    setPlaying(midi);
    try { await playReference(midi, a4); } finally { setPlaying((p) => (p === midi ? null : p)); }
  };
  const tapString = (i: number) => { setLocked(locked === i ? null : i); play(tuning.strings[i].midi); };

  const farOff = !!reading && Math.abs(reading.cents) > 50;
  const cents = reading ? Math.max(-50, Math.min(50, reading.cents)) : 0;
  const inTune = !!reading && Math.abs(Math.round(reading.cents)) <= 5;
  const tone = useMemo(() => (inTune ? "var(--gold)" : Math.abs(cents) < 15 ? "var(--ivory)" : "var(--felt-hi)"), [inTune, cents]);
  const chromatic = tuning.strings.length === 0;
  const note = reading ? splitNote(reading.targetLabel) : null;

  // one short line under the note; long diagnostics live in their own reserved slot
  const guidance = playing !== null ? t("tuner.playing", { note: midiName(playing) })
    : !listening ? t("live.tapMic")
    : farOff ? t("tuner.farOff", { heard: midiName(Math.round(reading!.midi)), target: reading!.targetLabel })
    : reading ? (inTune ? t("tuner.inTune") : reading.cents < 0 ? t("tuner.tuneUp") : t("tuner.tuneDown"))
    : t("tuner.playNote");
  const readout = reading && !farOff ? `${reading.cents > 0 ? "+" : ""}${Math.round(reading.cents)}¢ · ${reading.freq.toFixed(1)} Hz · ` : "";
  const noAudio = listening && playing === null && silentFor >= 30;
  const lockedLabel = locked !== null && !chromatic ? tuning.strings[locked].label : null;

  return (
    <div className="inset-group rounded-[30px] px-5 pt-4 pb-4 relative overflow-hidden flex flex-col">
      <div aria-hidden className="absolute inset-0 pointer-events-none transition-opacity duration-300" style={{ opacity: inTune ? 1 : 0, background: "radial-gradient(100% 90% at 50% 30%, color-mix(in srgb, var(--gold) 12%, transparent), transparent 100%)" }} />

      {/* the note */}
      <div className="relative text-center">
        <div className="flex items-start justify-center gap-0.5 h-[72px]">
          <motion.span key={chromatic ? reading?.targetLabel ?? "-" : reading?.stringIndex ?? "-"} initial={{ opacity: 0.4, y: 4 }} animate={{ opacity: 1, y: 0 }}
            className="chordname text-[68px] leading-none" style={{ color: reading ? tone : "var(--label-3)" }}>
            {note ? note.letter : "·"}
          </motion.span>
          {note && (
            <span className="flex flex-col items-start pt-1 leading-none">
              <span className="chordname text-[26px]" style={{ color: tone }}>{note.accidental}</span>
              <span className="ios-footnote label-2 mt-auto">{note.octave}</span>
            </span>
          )}
        </div>
        <div className="ios-subhead h-5 truncate tabular-nums" aria-live="polite" style={{ color: reading && !farOff ? tone : "var(--label-2)" }}>
          {readout}{guidance}
        </div>
      </div>

      {/* the dial */}
      <div className="relative mt-1 mx-auto w-full max-w-[300px]">
        <Dial cents={cents} live={!!reading && !farOff} inTune={inTune} tone={tone} />
        <div className="absolute inset-x-0 bottom-0 flex justify-between ios-caption2 label-3 px-1"><span>♭ 50</span><span>50 ♯</span></div>
      </div>

      {/* level + reserved status slot (never shifts the layout) */}
      <div className="relative mt-2 h-[3px] rounded-full tint-2 overflow-hidden"><div className="h-full" style={{ width: `${(listening ? level : 0) * 100}%`, background: "var(--gold)", transition: "width 80ms" }} /></div>
      <div className="relative h-[22px] mt-1 text-center ios-footnote" aria-live="polite">
        <span className={`transition-opacity ${listening && held >= 8 ? "opacity-100 text-gold" : noAudio ? "opacity-100 text-felt-hi" : "opacity-0"}`}>
          {noAudio ? t("tuner.noAudio") : t("tuner.held")}
        </span>
      </div>

      {/* the instrument: pegs and keys are the buttons */}
      <div className="relative mt-1">
        <div className="flex items-center justify-between mb-1 gap-3">
          <span className="eyebrow truncate">{lockedLabel ? t("tuner.lockedTo", { note: lockedLabel }) : chromatic ? t("tuner.chromatic") : t("tuner.strings")}</span>
          {!chromatic && tunings.length > 1 && (
            <span className="relative shrink-0">
              <select value={tuning.id} onChange={(e) => { setPrefs({ tuning: { ...prefs.tuning, [instrument]: e.target.value } }); setLocked(null); }}
                className="glass rounded-full h-9 pl-3 pr-8 ios-footnote text-ivory appearance-none outline-none" aria-label={t("tuner.tuning")}>
                {tunings.map((tn) => <option key={tn.id} value={tn.id}>{tuningName(tn)}</option>)}
              </select>
              <span aria-hidden className="absolute right-3 top-1/2 -translate-y-1/2 label-2 text-[10px]">▾</span>
            </span>
          )}
        </div>
        {!chromatic ? (
          <HeadstockGuide strings={tuning.strings} active={reading?.stringIndex ?? null} locked={locked} sounding={playing} inTune={inTune} onTap={tapString}
            tileLabel={(label) => t("tuner.stringTile", { note: label })} />
        ) : (
          <KeyboardGuide activeMidi={reading ? reading.nearestMidi : null} sounding={playing} inTune={inTune} onTap={(m) => play(m)} />
        )}
      </div>

      {/* reference pitch, one quiet line */}
      <div className="relative mt-3 flex items-center justify-between gap-3">
        <span className="ios-footnote label-2 whitespace-nowrap">{t("tuner.reference")}</span>
        <div className="flex items-center shrink-0">
          <button onClick={() => setPrefs({ a4: Math.max(415, a4 - 1) })} className="press circle-btn text-ivory ios-title3" aria-label={t("tuner.lower")}>−</button>
          <span className="chordname ios-subhead tabular-nums w-16 text-center text-gold">{a4} Hz</span>
          <button onClick={() => setPrefs({ a4: Math.min(466, a4 + 1) })} className="press circle-btn text-ivory ios-title3" aria-label={t("tuner.raise")}>+</button>
          <button onClick={() => setPrefs({ a4: 440 })} disabled={a4 === 440} className={`press circle-btn text-ivory transition-opacity ${a4 === 440 ? "opacity-25" : "opacity-100 text-gold"}`} aria-label={t("common.reset")}>↺</button>
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
