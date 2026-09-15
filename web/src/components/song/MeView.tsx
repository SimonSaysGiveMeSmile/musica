"use client";
import { useRef, useState } from "react";
import { usePrefs, setPrefs, toggleKnown, ACCENTS, type Theme } from "@/lib/store/prefs";
import { IconCheck } from "@/components/ui/Icons";
import { LANGS, useT } from "@/lib/i18n";
import { InstallRow } from "@/components/ui/InstallGuide";
import { LargeTitle } from "@/components/shell/LargeTitle";
import { Segmented } from "@/components/ui/Segmented";
import type { Instrument } from "@/lib/theory/coverage";
import { QUALITY_SUFFIX, type Quality } from "@/lib/theory/chords";
import { Sheet } from "@/components/ui/Sheet";
import { ChordDiagram, ChordNotes } from "@/components/chords/ChordDiagram";

const ROOTS = ["C", "D", "E", "F", "G", "A", "B", "C#", "Eb", "F#", "Ab", "Bb"];
const QUALS: Quality[] = ["maj", "min", "7", "m7", "maj7", "sus4"];

export function MeView() {
  const prefs = usePrefs();
  const { t } = useT();
  const inst = prefs.instrument;
  const known = new Set(prefs.known[inst]);
  const [peek, setPeek] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const roots = showAll ? ROOTS : ROOTS.slice(0, 7);

  return (
    <main className="page-pad-bottom">
      <LargeTitle eyebrow={t("me.eyebrow")} title={t("me.title")} right={<span className="chordname text-gold-hi ios-title2 pb-1">{known.size}</span>} />
      <section className="px-5 lg:px-10 space-y-4 lg:max-w-[760px]">
        <Segmented id="inst" value={inst} onChange={(v) => setPrefs({ instrument: v as Instrument })} options={[
          { value: "guitar", label: t("song.guitar") }, { value: "piano", label: t("song.piano") }, { value: "ukulele", label: t("song.ukulele") },
        ]} />
        <p className="label-2 ios-footnote px-1">{t("me.hint")}</p>

        <div className="keyboard hairline rounded-[26px] p-3 overflow-x-auto no-scrollbar">
          <div className="grid gap-1.5" style={{ gridTemplateColumns: `36px repeat(${QUALS.length}, minmax(52px, 1fr))` }}>
            <div />
            {QUALS.map((q) => <div key={q} className="text-center eyebrow py-1" style={{ color: "#8f8778" }}>{QUALITY_SUFFIX[q] || "maj"}</div>)}
            {roots.map((r) => (
              <Row key={r} root={r} known={known} onToggle={(c) => toggleKnown(inst, c)} onPeek={setPeek} />
            ))}
          </div>
          <button onClick={() => setShowAll((s) => !s)} className="press mt-3 text-sm font-medium" style={{ color: "#c9a45c" }}>{showAll ? t("me.fewerRoots") : t("me.showSharps")}</button>
        </div>

        <div className="flex gap-2">
          <button onClick={() => setPrefs({ known: { ...prefs.known, [inst]: [] } })} className="press glass rounded-full h-10 px-4 ios-subhead text-ivory">{t("me.clear")}</button>
          <button onClick={() => setPrefs({ known: { ...prefs.known, [inst]: ROOTS.flatMap((r) => QUALS.map((q) => r + QUALITY_SUFFIX[q])) } })} className="press glass rounded-full h-10 px-4 ios-subhead text-ivory">{t("me.knowAll")}</button>
        </div>

        {/* Appearance */}
        <div className="pt-6">
          <div className="inset-group"><InstallRow /></div>
        </div>

        <div id="appearance" className="pt-2">
          <div className="eyebrow mb-2 px-4">{t("me.appearance")}</div>
          <div className="inset-group">
            <div className="row flex-col !items-stretch gap-2 py-3">
              <div className="ios-body">{t("me.theme")}</div>
              <Segmented id="theme" value={prefs.theme} onChange={(v) => setPrefs({ theme: v as Theme })} options={[
                { value: "system", label: t("me.system") }, { value: "light", label: t("me.light") }, { value: "dark", label: t("me.dark") },
              ]} />
            </div>
            <div className="row flex-col !items-stretch gap-2 py-3">
              <div className="ios-body">{t("me.accent")}</div>
              <div className="flex flex-wrap gap-2">
                {ACCENTS.map((a) => {
                  const on = prefs.accent === a.id;
                  return (
                    <button
                      key={a.id}
                      onClick={() => setPrefs({ accent: a.id })}
                      aria-pressed={on}
                      aria-label={t("me.accentLabel", { name: t(`accent.${a.id}` as const) })}
                      title={t(`accent.${a.id}` as const)}
                      className={`press h-11 pl-1.5 pr-3.5 rounded-full flex items-center gap-2 ios-footnote transition-colors ${on ? "lens text-ivory font-semibold" : "glass label-2"}`}
                    >
                      <span className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: `linear-gradient(160deg, ${a.swatch}, color-mix(in srgb, ${a.swatch} 60%, black))`, boxShadow: "inset 0 1px 0 rgba(255,255,255,0.4)" }}>
                        {on && <IconCheck width={16} height={16} style={{ color: "#1a1408" }} />}
                      </span>
                      {t(`accent.${a.id}` as const)}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="row flex-col !items-stretch gap-2 py-3">
              <div className="ios-body">{t("me.language")}</div>
              <div className="flex flex-wrap gap-2">
                <button onClick={() => setPrefs({ language: "auto" })} aria-pressed={prefs.language === "auto"}
                  className={`press h-10 px-4 rounded-full ios-footnote transition-colors ${prefs.language === "auto" ? "lens text-ivory font-semibold" : "glass label-2"}`}>
                  {t("me.system")}
                </button>
                {LANGS.map((l) => {
                  const on = prefs.language === l.id;
                  return (
                    <button key={l.id} onClick={() => setPrefs({ language: l.id })} aria-pressed={on} lang={l.id}
                      className={`press h-10 px-4 rounded-full ios-footnote transition-colors ${on ? "lens text-ivory font-semibold" : "glass label-2"}`}>
                      {l.native}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </section>

      <Sheet open={!!peek} onClose={() => setPeek(null)}>
        {peek && (
          <div className="flex flex-col items-center pb-2">
            <div className="chordname text-[40px] text-gold-hi leading-none">{peek}</div>
            <div className="mt-1"><ChordNotes symbol={peek} /></div>
            <div className="mt-4"><ChordDiagram symbol={peek} instrument={inst} size={140} /></div>
            <button onClick={() => { toggleKnown(inst, peek); setPeek(null); }} className="press mt-4 h-11 px-5 rounded-full font-medium gold-fill">
              {known.has(peek) ? t("song.forgetChord") : t("song.markKnown")}
            </button>
          </div>
        )}
      </Sheet>
    </main>
  );
}

function Row({ root, known, onToggle, onPeek }: { root: string; known: Set<string>; onToggle: (c: string) => void; onPeek: (c: string) => void }) {
  return (
    <>
      <div className="chordname text-[15px] flex items-center justify-center" style={{ color: "#cfc6b6" }}>{root}</div>
      {QUALS.map((q) => {
        const c = root + QUALITY_SUFFIX[q];
        const on = known.has(c);
        return <KeyTile key={c} symbol={c} on={on} onToggle={() => onToggle(c)} onPeek={() => onPeek(c)} />;
      })}
    </>
  );
}

function KeyTile({ symbol, on, onToggle, onPeek }: { symbol: string; on: boolean; onToggle: () => void; onPeek: () => void }) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const long = useRef(false);
  return (
    <button
      onPointerDown={() => { long.current = false; timer.current = setTimeout(() => { long.current = true; onPeek(); }, 420); }}
      onPointerUp={() => { if (timer.current) clearTimeout(timer.current); if (!long.current) onToggle(); }}
      onPointerLeave={() => { if (timer.current) clearTimeout(timer.current); }}
      onContextMenu={(e) => e.preventDefault()}
      aria-pressed={on}
      className="press chordname h-12 rounded-[10px] text-[14px] select-none transition-colors"
      style={on
        ? { background: "linear-gradient(180deg, #f6efe0, #e6dcc6)", color: "#1a1408", boxShadow: "inset 0 -3px 0 rgba(0,0,0,0.15), 0 2px 6px rgba(0,0,0,0.5)" }
        : { background: "linear-gradient(180deg, #232019, #14120f)", color: "#cfc6b6", boxShadow: "inset 0 1px 0 rgba(255,255,255,0.05), inset 0 -3px 0 rgba(0,0,0,0.5)" }}
    >
      {symbol}
    </button>
  );
}
