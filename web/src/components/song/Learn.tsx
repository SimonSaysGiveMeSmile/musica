"use client";
import { useMemo } from "react";
import { evaluateOptions, suggestions, type CoverageOption, type Instrument } from "@/lib/theory/coverage";
import { toggleKnown } from "@/lib/store/prefs";
import { IconCheck, IconChevron } from "@/components/ui/Icons";
import { useT } from "@/lib/i18n";

export function Learn({ chords, instrument, known, transpose, capo, onApply, onChord }: {
  chords: string[]; instrument: Instrument; known: string[]; transpose: number; capo: number;
  onApply: (o: { capo: number; transpose: number }) => void; onChord: (c: string) => void;
}) {
  const { t } = useT();
  const options = useMemo(() => evaluateOptions(chords, known, instrument), [chords, known, instrument]);
  const current = options.find((o) => o.capo === capo && o.transpose === transpose) ?? options[0];
  const best = options[0];
  const top = options.filter((o, i) => i < 4 || (o.capo === 0 && o.transpose === 0)).slice(0, 5);
  const sugg = useMemo(() => suggestions(current?.unknown ?? [], known), [current, known]);
  const pct = Math.round((current?.coverage ?? 0) * 100);

  if (!chords.length) return <p className="label-2">{t("learn.noChords")}</p>;

  const where = (o: CoverageOption) => o.capo ? t("learn.capoShort", { n: o.capo }) : o.transpose ? t("learn.transposeShort", { n: `${o.transpose > 0 ? "+" : ""}${o.transpose}` }) : t("learn.asWritten");
  const reason = (o: CoverageOption) => o.unknown.length === 0
    ? `${where(o)} · ${t("learn.everyKnown")}`
    : `${where(o)} · ${t("learn.pctKnown", { pct: Math.round(o.coverage * 100) })}${o.swaps.length ? ` · ${o.swaps.join(", ")}` : ""}`;
  const label = (o: CoverageOption) => (o.capo === 0 && o.transpose === 0) ? t("learn.asWritten") : o.capo ? t("learn.capoOnFret", { n: o.capo }) : t("learn.transposeBy", { n: `${o.transpose > 0 ? "+" : ""}${o.transpose}` });

  return (
    <div className="space-y-5 lg:grid lg:grid-cols-2 lg:gap-6 lg:space-y-0">
      {/* Coverage */}
      <div className="inset-group p-5 flex items-center gap-5 relative lg:col-span-2">
        <Ring pct={pct} />
        <div className="min-w-0">
          <div className="eyebrow">{t("learn.youCanPlay")}</div>
          <div className="ios-title1">{t("learn.ofChords", { k: current.known.length, n: current.shapes.length })}</div>
          <div className="label-2 ios-footnote mt-1">{reason(current)}</div>
        </div>
      </div>

      {/* Options */}
      <div>
        <div className="eyebrow mb-2">{t("learn.makeEasier")}</div>
        <ul className="inset-group">
          {top.map((o) => {
            const active = o.capo === capo && o.transpose === transpose;
            return (
              <li key={`${o.capo}-${o.transpose}`}>
                <button onClick={() => onApply({ capo: o.capo, transpose: o.transpose })} className="row press w-full text-left">
                  <span className={`chordname ios-title3 w-14 shrink-0 tabular-nums ${active ? "text-gold-hi" : "text-ivory"}`}>{Math.round(o.coverage * 100)}%</span>
                  <span className="min-w-0 flex-1">
                    <span className="block ios-body">{label(o)}{o === best ? <span className="ml-2 ios-caption2 uppercase tracking-wide text-gold font-semibold">{t("learn.best")}</span> : null}</span>
                    <span className="block ios-footnote label-2 truncate">{o.shapes.join("  ")}</span>
                  </span>
                  {active ? <IconCheck className="text-gold-hi shrink-0" /> : <IconChevron className="label-3 shrink-0" width={18} height={18} />}
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      {/* To learn */}
      {sugg.length > 0 && (
        <div>
          <div className="eyebrow mb-2">{t("learn.leftToLearn")}</div>
          <ul className="inset-group">
            {sugg.map((s) => (
              <li key={s.chord} className="row">
                <button onClick={() => onChord(s.chord)} className="chordname press ios-title3 text-ivory w-14 text-left shrink-0">{s.chord}</button>
                <span className="flex-1 ios-footnote label-2">{s.kind === "playInstead" || s.kind === "simplifyTo" ? t(`learn.${s.kind}` as const, { name: s.easier ?? "" }) : t(`learn.${s.kind}` as const)}</span>
                <button onClick={() => toggleKnown(instrument, s.chord)} className="press ios-subhead font-semibold text-gold whitespace-nowrap">{t("learn.gotIt")}</button>
              </li>
            ))}
          </ul>
        </div>
      )}
      {sugg.length === 0 && <p className="text-gold ios-subhead">{t("learn.allInHands")}</p>}
    </div>
  );
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
