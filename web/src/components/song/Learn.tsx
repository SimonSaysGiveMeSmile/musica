"use client";
import { useMemo } from "react";
import { evaluateOptions, suggestions, type CoverageOption, type Instrument } from "@/lib/theory/coverage";
import { toggleKnown } from "@/lib/store/prefs";
import { IconCheck } from "@/components/ui/Icons";

export function Learn({ chords, instrument, known, transpose, capo, onApply, onChord }: {
  chords: string[]; instrument: Instrument; known: string[]; transpose: number; capo: number;
  onApply: (o: { capo: number; transpose: number }) => void; onChord: (c: string) => void;
}) {
  const options = useMemo(() => evaluateOptions(chords, known, instrument), [chords, known, instrument]);
  const current = options.find((o) => o.capo === capo && o.transpose === transpose) ?? options[0];
  const best = options[0];
  const top = options.filter((o, i) => i < 4 || (o.capo === 0 && o.transpose === 0)).slice(0, 5);
  const sugg = useMemo(() => suggestions(current?.unknown ?? [], known), [current, known]);
  const pct = Math.round((current?.coverage ?? 0) * 100);

  if (!chords.length) return <p className="text-ivory-3">No chords detected.</p>;

  return (
    <div className="space-y-5 lg:grid lg:grid-cols-2 lg:gap-6 lg:space-y-0">
      {/* Coverage */}
      <div className="lacquer rounded-[26px] p-5 flex items-center gap-5 relative overflow-hidden lg:col-span-2">
        <Ring pct={pct} />
        <div className="min-w-0">
          <div className="eyebrow">You can already play</div>
          <div className="display text-[28px] font-semibold leading-tight">{current.known.length} of {current.shapes.length} chords</div>
          <div className="text-ivory-3 text-[13px] mt-1">{current.reason}</div>
        </div>
      </div>

      {/* Options */}
      <div>
        <div className="eyebrow mb-2">Make it easier</div>
        <ul className="space-y-2">
          {top.map((o) => {
            const active = o.capo === capo && o.transpose === transpose;
            return (
              <li key={`${o.capo}-${o.transpose}`}>
                <button onClick={() => onApply({ capo: o.capo, transpose: o.transpose })} className={`press w-full text-left rounded-[20px] px-4 py-3 flex items-center gap-3 border ${active ? "border-gold-hi/50 bg-gold/[0.08]" : "border-(--glass-line) tint-1"}`}>
                  <span className={`chordname text-[20px] w-16 shrink-0 ${active ? "text-gold-hi" : "text-ivory"}`}>{Math.round(o.coverage * 100)}%</span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[14px] font-medium">{label(o)}{o === best ? <span className="ml-2 text-[10px] uppercase tracking-wider text-gold">best</span> : null}</span>
                    <span className="block text-[12px] text-ivory-3 truncate">{o.shapes.join("  ")}</span>
                  </span>
                  {active && <IconCheck className="text-gold-hi shrink-0" />}
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      {/* To learn */}
      {sugg.length > 0 && (
        <div>
          <div className="eyebrow mb-2">Left to learn</div>
          <ul className="space-y-2">
            {sugg.map((s) => (
              <li key={s.chord} className="rounded-[20px] px-4 py-3 tint-1 border border-(--glass-line) flex items-center gap-3">
                <button onClick={() => onChord(s.chord)} className="chordname press text-[22px] text-felt-hi w-16 text-left shrink-0">{s.chord}</button>
                <span className="flex-1 text-[13px] text-ivory-2">{s.note}</span>
                <button onClick={() => toggleKnown(instrument, s.chord)} className="press text-[12px] font-medium text-gold whitespace-nowrap">Got it</button>
              </li>
            ))}
          </ul>
        </div>
      )}
      {sugg.length === 0 && <p className="text-gold text-sm">Every chord here is in your hands. Go play it.</p>}
    </div>
  );
}

function label(o: CoverageOption) {
  if (o.capo === 0 && o.transpose === 0) return "As written";
  if (o.capo) return `Capo on fret ${o.capo}`;
  return `Transpose ${o.transpose > 0 ? "+" : ""}${o.transpose} semitones`;
}

function Ring({ pct }: { pct: number }) {
  const r = 34, c = 2 * Math.PI * r;
  return (
    <svg width={88} height={88} viewBox="0 0 88 88" className="shrink-0">
      <circle cx={44} cy={44} r={r} fill="none" stroke="var(--glass-line)" strokeWidth={7} />
      <circle cx={44} cy={44} r={r} fill="none" stroke="url(#g)" strokeWidth={7} strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - pct / 100)} transform="rotate(-90 44 44)" style={{ transition: "stroke-dashoffset 600ms cubic-bezier(.2,.8,.2,1)" }} />
      <defs><linearGradient id="g" x1="0" x2="1"><stop offset="0" style={{ stopColor: "var(--gold-lo)" }} /><stop offset="1" style={{ stopColor: "var(--gold-hi)" }} /></linearGradient></defs>
      <text x={44} y={49} textAnchor="middle" fontSize={18} fontWeight={700} fill="var(--ivory)" fontFamily="var(--font-display)">{pct}%</text>
    </svg>
  );
}
