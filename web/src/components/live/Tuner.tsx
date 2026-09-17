"use client";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { motion, useMotionValueEvent, useSpring } from "motion/react";
import { onLive } from "@/lib/analysis/client";
import type { LiveFrame } from "@/lib/analysis/types";
import type { Instrument } from "@/lib/theory/coverage";
import { PitchSmoother, TUNINGS, midiName, playReference, readPitch, referencePlaying, splitNote, stopReference, type Reading } from "@/lib/audio/tuning";
import { setPrefs, usePrefs } from "@/lib/store/prefs";
import { useT } from "@/lib/i18n";
import { HeadstockGuide, KeyboardGuide } from "./TunerGuide";

/** One card: the note inside the gauge, the instrument you are tuning, and the controls. `action` is the
 *  mic button, rendered inside the card so the whole thing reads as one object. */
export function Tuner({ listening, instrument, action }: { listening: boolean; instrument: Instrument; action?: ReactNode }) {
  const { t } = useT();
  const prefs = usePrefs();
  const a4 = prefs.a4;
  const tunings = TUNINGS[instrument];
  const tuningName = (tn: (typeof tunings)[number]) => (tn.id === "dadgad" ? "DADGAD" : t(tn.name));
  const tuning = tunings.find((x) => x.id === prefs.tuning[instrument]) ?? tunings[0];
  const [locked, setLocked] = useState<number | null>(null);
  const [rawReading, setReading] = useState<Reading | null>(null);
  const [held, setHeld] = useState(false);     // in tune long enough to say so
  const [holdFrac, setHoldFrac] = useState(0); // how far through that hold, for the arc to fill
  const [shown, setShown] = useState<Reading | null>(null); // the reading the numbers use, refreshed a few times a second
  const shownAt = useRef(0);
  const [level, setLevel] = useState(0);
  const [noSound, setNoSound] = useState(false); // nothing heard for a while
  const heldSince = useRef<number | null>(null);
  const silentSince = useRef<number | null>(null);
  const [playing, setPlaying] = useState<number | null>(null);
  // three frames at 21 ms: enough to throw out a one-frame glitch, short enough to feel live
  const smoother = useRef(new PitchSmoother(3));
  const lastGood = useRef(0);
  const lastFrame = useRef(0);

  // reset per-session counters when listening starts or stops (adjust-state-during-render pattern)
  const [prevListening, setPrevListening] = useState(listening);
  if (prevListening !== listening) { setPrevListening(listening); setReading(null); setShown(null); setHeld(false); setHoldFrac(0); setNoSound(false); setLevel(0); }
  const reading = listening ? rawReading : null;

  useEffect(() => { smoother.current.reset(); heldSince.current = null; silentSince.current = null; if (!listening) stopReference(); }, [listening]);
  useEffect(() => () => stopReference(), []);

  // if frames stop arriving (interrupted context, ended track) the needle must not freeze on a stale reading
  useEffect(() => {
    if (!listening) return;
    const id = setInterval(() => { if (performance.now() - lastFrame.current > 1200) { setReading(null); setShown(null); setHeld(false); setHoldFrac(0); setLevel(0); } }, 400);
    return () => clearInterval(id);
  }, [listening]);

  // frames arrive faster than the screen refreshes; keep the newest and apply it once per paint
  const latest = useRef<LiveFrame | null>(null);
  const rafRef = useRef(0);
  useEffect(() => {
    const apply = (frame: LiveFrame) => {
    lastFrame.current = performance.now();
    if (referencePlaying()) return; // the mic is muted while our own tone sounds; those frames mean nothing
    const now = performance.now();
    setLevel(Math.min(1, frame.rms * 14));
    // "no sound" after 2.5 s of nothing, whatever the frame rate
    if (frame.rms < 0.0008) { if (silentSince.current === null) silentSince.current = now; }
    else silentSince.current = null;
    setNoSound(silentSince.current !== null && now - silentSince.current >= 2500);
    const good = frame.pitchConfidence > 0.5 && frame.rms > 0.0015 && frame.pitch > 30;
    if (good) {
      const f = smoother.current.push(frame.pitch);
      const r = readPitch(f, tuning, a4, locked);
      setReading(r);
      // the needle follows every frame; the numbers change eight times a second, or they blur
      if (now - shownAt.current >= 120) { shownAt.current = now; setShown(r); }
      lastGood.current = now;
      // "held steady" once it has sat within 5 cents for two thirds of a second — the arc fills on the way
      if (r && Math.abs(r.cents) <= 5) { if (heldSince.current === null) heldSince.current = now; }
      else heldSince.current = null;
      const frac = heldSince.current === null ? 0 : Math.min(1, (now - heldSince.current) / HOLD_MS);
      setHoldFrac(frac);
      setHeld(frac >= 1);
    } else if (now - lastGood.current > 900) {
      setReading(null); setShown(null); setHeld(false); setHoldFrac(0); heldSince.current = null; shownAt.current = 0; smoother.current.reset();
    }
    };
    const off = onLive((frame) => {
      latest.current = frame;
      if (rafRef.current) return;
      rafRef.current = requestAnimationFrame(() => { rafRef.current = 0; const f = latest.current; if (f) apply(f); });
    });
    return () => { off(); cancelAnimationFrame(rafRef.current); rafRef.current = 0; };
  }, [tuning, a4, locked]);

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

  // what sits inside the gauge when there is no note yet
  const idle = playing !== null ? t("tuner.playing", { note: midiName(playing) }) : !listening ? t("live.tapMic") : t("tuner.playNote");
  // one short line under the gauge
  const guidance = !reading ? "" : farOff ? t("tuner.farOff", { heard: midiName(Math.round(reading.midi)), target: reading.targetLabel })
    : inTune ? t("tuner.inTune") : reading.cents < 0 ? t("tuner.tuneUp") : t("tuner.tuneDown");
  const calm = shown && reading ? shown : reading;
  const readout = calm && !farOff ? `${calm.cents > 0 ? "+" : ""}${Math.round(calm.cents)}¢ · ${calm.freq.toFixed(1)} Hz · ` : "";
  const noAudio = listening && playing === null && noSound;
  const lockedLabel = locked !== null && !chromatic ? tuning.strings[locked].label : null;

  return (
    <div className="inset-group rounded-[30px] relative overflow-hidden px-5 pt-2 pb-4 lg:px-7 lg:pt-4 lg:pb-6 lg:grid lg:grid-cols-2 lg:gap-x-8 lg:items-start">
      <div aria-hidden className="absolute inset-0 pointer-events-none transition-opacity duration-300" style={{ opacity: inTune ? 1 : 0, background: "radial-gradient(70% 60% at 30% 30%, color-mix(in srgb, var(--gold) 14%, transparent), transparent 100%)" }} />

      {/* the gauge, with the note inside it */}
      <div className="relative mx-auto w-full max-w-[340px] lg:max-w-[400px] lg:col-start-1 lg:row-start-1">
        <Dial cents={cents} live={!!reading && !farOff} inTune={inTune} hold={holdFrac} tone={tone} />
        <div className="absolute inset-x-0 flex items-start justify-center" style={{ top: "31%", bottom: "6%" }}>
          {note ? (
            <div className="flex items-start gap-0.5">
              <motion.span key={chromatic ? reading?.targetLabel ?? "-" : reading?.stringIndex ?? "-"} initial={{ opacity: 0.4, y: 4 }} animate={{ opacity: 1, y: 0 }}
                className="chordname text-[84px] leading-none" style={{ color: tone }}>
                {note.letter}
              </motion.span>
              <span className="flex flex-col items-start pt-2 leading-none h-[76px]">
                <span className="chordname text-[28px]" style={{ color: tone }}>{note.accidental}</span>
                <span className="ios-subhead label-2 mt-auto">{note.octave}</span>
              </span>
            </div>
          ) : (
            <span className="ios-subhead label-3 text-center px-10 pt-6 leading-snug">{idle}</span>
          )}
        </div>
      </div>

      {/* readout, level, reserved status slot (never shifts the layout) */}
      <div className="relative lg:col-start-1 lg:row-start-2">
        <div className="ios-subhead h-5 truncate tabular-nums text-center" aria-live="polite" style={{ color: reading && !farOff ? tone : "var(--label-2)" }}>
          {readout}{guidance}
        </div>
        {/* before a note is found this shows the room's level, so a silent mic is obvious; with a note in tune it fills over the hold */}
        <div className="relative mt-2 mx-auto h-[3px] w-40 rounded-full tint-2 overflow-hidden transition-opacity duration-300" style={{ opacity: listening ? 1 : 0 }}>
          <div className="h-full rounded-full" style={{ width: `${(listening ? (reading ? holdFrac : level) : 0) * 100}%`, background: reading ? "var(--gold)" : "color-mix(in srgb, var(--ivory) 45%, transparent)", transition: "width 60ms, background 200ms" }} />
        </div>
        <div className="relative h-[22px] mt-1 text-center ios-footnote truncate px-2" aria-live="polite">
          <span className={`transition-opacity ${listening && held ? "opacity-100 text-gold" : noAudio ? "opacity-100 text-felt-hi" : "opacity-0"}`}>
            {noAudio ? t("tuner.noAudio") : t(chromatic ? "tuner.heldChromatic" : "tuner.held")}
          </span>
        </div>
      </div>

      {/* the instrument: pegs and keys are the buttons */}
      <div className="relative mt-2 lg:mt-0 lg:col-start-2 lg:row-start-1 lg:row-span-2">
        <div className="eyebrow text-center truncate mb-1">{lockedLabel ? t("tuner.lockedTo", { note: lockedLabel }) : chromatic ? t("tuner.chromatic") : t("tuner.strings")}</div>
        {!chromatic ? (
          <HeadstockGuide strings={tuning.strings} active={reading?.stringIndex ?? null} locked={locked} sounding={playing} inTune={inTune} onTap={tapString}
            tileLabel={(label) => t("tuner.stringTile", { note: label })} />
        ) : (
          <div className="pt-3"><KeyboardGuide activeMidi={reading ? reading.nearestMidi : null} sounding={playing} inTune={inTune} onTap={(m) => play(m)} /></div>
        )}
      </div>

      {/* tuning and reference pitch, one quiet row */}
      <div className="relative mt-3 flex items-center justify-between gap-2 lg:col-start-2 lg:row-start-3">
        {!chromatic && tunings.length > 1 ? (
          <span className="relative min-w-0 flex-1 max-w-[210px]">
            <select value={tuning.id} onChange={(e) => { setPrefs({ tuning: { ...prefs.tuning, [instrument]: e.target.value } }); setLocked(null); }}
              className="glass rounded-full h-9 w-full pl-3 pr-7 ios-footnote text-ivory appearance-none outline-none truncate" aria-label={t("tuner.tuning")}>
              {tunings.map((tn) => <option key={tn.id} value={tn.id}>{tuningName(tn)}</option>)}
            </select>
            <span aria-hidden className="absolute right-3 top-1/2 -translate-y-1/2 label-2 text-[10px]">▾</span>
          </span>
        ) : (
          <span className="ios-footnote label-2 truncate">{chromatic ? t("tuner.reference") : tuningName(tuning)}</span>
        )}
        <div className="flex items-center shrink-0" role="group" aria-label={t("tuner.reference")}>
          <button onClick={() => setPrefs({ a4: Math.max(415, a4 - 1) })} className="press circle-btn text-ivory ios-title3" aria-label={t("tuner.lower")}>−</button>
          <span className="chordname ios-subhead tabular-nums w-14 text-center text-gold">{a4} Hz</span>
          <button onClick={() => setPrefs({ a4: Math.min(466, a4 + 1) })} className="press circle-btn text-ivory ios-title3" aria-label={t("tuner.raise")}>+</button>
          {a4 !== 440 && <button onClick={() => setPrefs({ a4: 440 })} className="press circle-btn text-gold" aria-label={t("common.reset")}>↺</button>}
        </div>
      </div>

      {action && <div className="relative mt-3 lg:mt-4 lg:col-start-1 lg:row-start-3 lg:self-end">{action}</div>}
    </div>
  );
}

/** Arc gauge: the pointer rides the rim and the rim fills from centre to the pointer, so the middle of the
 *  gauge stays free for the note. Angles run -80° (flat) to +80° (sharp). The pointer is rotated with an SVG
 *  transform about the arc's centre, which every browser honours (CSS transform-origin on SVG does not). */
const HOLD_MS = 650;

function Dial({ cents, live, inTune, hold, tone }: { cents: number; live: boolean; inTune: boolean; hold: number; tone: string }) {
  const W = 300, H = 152, cx = 150, cy = 148, R = 134;
  const rad = (deg: number) => ((deg - 90) * Math.PI) / 180;
  const pt = (deg: number, r: number) => ({ x: cx + r * Math.cos(rad(deg)), y: cy + r * Math.sin(rad(deg)) });
  const arc = (from: number, to: number, r: number) => {
    const a = pt(from, r), b = pt(to, r);
    return `M ${a.x} ${a.y} A ${r} ${r} 0 ${to - from > 180 ? 1 : 0} 1 ${b.x} ${b.y}`;
  };
  const target = live ? (cents / 50) * 80 : 0;
  const spring = useSpring(0, { stiffness: 340, damping: 26, mass: 0.55 });
  const pointerRef = useRef<SVGGElement>(null);
  const fillRef = useRef<SVGPathElement>(null);
  useEffect(() => { spring.set(target); }, [target, spring]);
  useMotionValueEvent(spring, "change", (v) => {
    pointerRef.current?.setAttribute("transform", `rotate(${v} ${cx} ${cy})`);
    fillRef.current?.setAttribute("d", Math.abs(v) < 0.6 ? "" : arc(Math.min(0, v), Math.max(0, v), R));
  });
  const ticks: { deg: number; len: number; major: boolean }[] = [];
  for (let c = -50; c <= 50; c += 5) ticks.push({ deg: (c / 50) * 80, len: c === 0 ? 16 : c % 25 === 0 ? 11 : 5, major: c % 25 === 0 });
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto block" aria-hidden>
      <path d={arc(-80, 80, R)} fill="none" stroke="var(--separator)" strokeWidth={2} strokeLinecap="round" />
      <path ref={fillRef} d="" fill="none" stroke={tone} strokeOpacity={0.55} strokeWidth={3} strokeLinecap="round" />
      <path d={arc(-8, 8, R)} fill="none" stroke="var(--gold)" strokeOpacity={0.3} strokeWidth={4} strokeLinecap="round" />
      {/* the same arc, growing out from the centre while the note is held in tune: full means done */}
      <path d={arc(-8, 8, R)} fill="none" stroke="var(--gold)" strokeOpacity={0.95} strokeWidth={4} strokeLinecap="round" pathLength={1}
        strokeDasharray={`${Math.max(0.0001, hold)} 1`} strokeDashoffset={-(1 - hold) / 2} style={{ opacity: live && hold > 0 ? 1 : 0, transition: "opacity 150ms" }} />
      {ticks.map((tk) => {
        const o = pt(tk.deg, R - 6), i = pt(tk.deg, R - 6 - tk.len);
        return <line key={tk.deg} x1={o.x} y1={o.y} x2={i.x} y2={i.y} stroke={tk.deg === 0 ? "var(--gold)" : "var(--label-3)"} strokeWidth={tk.major ? 1.6 : 1} strokeLinecap="round" />;
      })}
      <text x={pt(-80, R).x + 4} y={cy - 4} fontSize={13} fill="var(--label-3)" fontFamily="var(--font-sf)">♭</text>
      <text x={pt(80, R).x - 4} y={cy - 4} fontSize={13} fill="var(--label-3)" fontFamily="var(--font-sf)" textAnchor="end">♯</text>
      <g ref={pointerRef} transform={`rotate(0 ${cx} ${cy})`} style={{ opacity: live ? 1 : 0.3, transition: "opacity 200ms" }}>
        <line x1={cx} y1={cy - R - 8} x2={cx} y2={cy - R + 20} stroke={tone} strokeWidth={4} strokeLinecap="round"
          style={{ filter: inTune ? "drop-shadow(0 0 8px color-mix(in srgb, var(--gold) 75%, transparent))" : "none" }} />
      </g>
    </svg>
  );
}
