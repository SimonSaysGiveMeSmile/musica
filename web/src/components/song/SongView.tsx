"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { getAudio, getSong, saveSong, type Song } from "@/lib/store/db";
import { usePlayer } from "@/lib/audio/player";
import { usePrefs, setPrefs } from "@/lib/store/prefs";
import { chordAt, distinctChords } from "@/lib/analysis/postprocess";
import { keyPrefersFlats, transposeKey, transposeSymbol, relativeKey } from "@/lib/theory/chords";
import type { Instrument } from "@/lib/theory/coverage";
import { Segmented } from "@/components/ui/Segmented";
import { Sheet } from "@/components/ui/Sheet";
import { IconBack, IconMinus, IconPlus } from "@/components/ui/Icons";
import { Player } from "./Player";
import { ChordSheet } from "./ChordSheet";
import { Timeline } from "./Timeline";
import { ChordGallery } from "./ChordGallery";
import { Learn } from "./Learn";
import { ChordDiagram, ChordNotes } from "@/components/chords/ChordDiagram";
import { alignSheet } from "@/lib/lyrics/align";
import { fetchLyrics, plainToLines } from "@/lib/lyrics/lrclib";

type View = "sheet" | "timeline" | "chords" | "learn";

export function SongView({ id }: { id: string }) {
  const router = useRouter();
  const prefs = usePrefs();
  const [song, setSong] = useState<Song | null | undefined>(undefined);
  const [src, setSrc] = useState<string | null>(null);
  const [view, setView] = useState<View>("sheet");
  const [openChord, setOpenChord] = useState<string | null>(null);
  const [editingLyrics, setEditingLyrics] = useState(false);
  const [lyricsDraft, setLyricsDraft] = useState("");
  const [lyricsBusy, setLyricsBusy] = useState(false);

  useEffect(() => {
    let url: string | null = null;
    (async () => {
      const s = await getSong(id);
      setSong(s ?? null);
      if (s?.hasAudio) {
        const blob = await getAudio(id);
        if (blob) { url = URL.createObjectURL(blob); setSrc(url); }
      }
    })();
    return () => { if (url) URL.revokeObjectURL(url); };
  }, [id]);

  const analysis = song?.analysis;
  const player = usePlayer(src, analysis?.beats, analysis?.downbeatPhase ?? 0);
  const instrument: Instrument = song?.instrument ?? prefs.instrument;
  const transpose = song?.transpose ?? 0;
  const capo = song?.capo ?? 0;
  const shift = transpose - capo; // what the player fingers
  const flats = analysis ? keyPrefersFlats(transposeKey(analysis.key, analysis.scale, shift), analysis.scale) : false;

  const update = useCallback((patch: Partial<Song>) => {
    setSong((s) => { if (!s) return s; const n = { ...s, ...patch }; saveSong(n); return n; });
  }, []);

  const display = useCallback((sym: string) => transposeSymbol(sym, shift, flats), [shift, flats]);

  const sheetLines = useMemo(() => {
    if (!analysis) return [];
    const lines = song?.lyrics?.lines ?? [];
    return alignSheet(lines, analysis.chords, analysis.duration);
  }, [analysis, song?.lyrics]);

  const current = analysis ? chordAt(analysis, player.time) : null;
  const chords = useMemo(() => (analysis ? distinctChords(analysis) : []), [analysis]);

  const saveLyrics = useCallback(() => {
    update({ lyrics: { synced: false, lines: plainToLines(lyricsDraft), source: "user" } });
    setEditingLyrics(false);
  }, [lyricsDraft, update]);

  const retryLyrics = useCallback(async () => {
    if (!song) return;
    setLyricsBusy(true);
    try { const l = await fetchLyrics(song.title, song.artist, song.durationSec); if (l) update({ lyrics: l }); }
    finally { setLyricsBusy(false); }
  }, [song, update]);

  if (song === undefined) return <div className="safe-top p-5 text-ivory-3">Opening…</div>;
  if (song === null || !analysis) {
    return (
      <main className="safe-top p-5">
        <button onClick={() => router.back()} className="press text-gold flex items-center gap-1"><IconBack /> Back</button>
        <p className="mt-6 text-ivory-2">This song isn&apos;t in your library on this device.</p>
      </main>
    );
  }

  const keyName = transposeKey(analysis.key, analysis.scale, transpose);
  const keyLabel = `${keyName}${analysis.scale === "minor" ? "m" : ""}`;

  const settingsStrip = (
    <>
      <Stepper label="Transpose" value={transpose} fmt={(v) => (v > 0 ? `+${v}` : `${v}`)} onChange={(v) => update({ transpose: Math.max(-11, Math.min(11, v)) })} />
      {instrument !== "piano" && <Stepper label="Capo" value={capo} fmt={(v) => `${v}`} onChange={(v) => update({ capo: Math.max(0, Math.min(9, v)) })} />}
      <div className="glass rounded-full h-11 p-[3px] flex items-center shrink-0">
        {(["guitar", "piano", "ukulele"] as Instrument[]).map((i) => (
          <button key={i} onClick={() => { update({ instrument: i }); setPrefs({ instrument: i }); }} className={`press h-full px-3.5 rounded-full ios-footnote capitalize ${instrument === i ? "lens text-ivory font-semibold" : "label-2 font-medium"}`}>{i}</button>
        ))}
      </div>
      <div className="hairline rounded-full h-11 px-3.5 flex items-center shrink-0 ios-footnote label-2 lg:hidden">
        relative {relativeKey(keyName, analysis.scale)} · {Math.round(analysis.keyStrength * 100)}% sure
      </div>
    </>
  );

  return (
    <main className="flex flex-col min-h-dvh lg:grid lg:grid-cols-[minmax(0,1fr)_380px] lg:gap-8 lg:px-10 lg:pt-7 lg:pb-16 lg:items-start">
      {/* Header */}
      <header className="song-header safe-top px-4 pt-2 pb-3 sticky top-0 z-30 lg:static lg:px-0 lg:pt-0 lg:col-span-2">
        <div className="flex items-center gap-2 lg:gap-4">
          <button onClick={() => router.push("/library")} aria-label="Back" className="press glass circle-btn text-ivory shrink-0"><IconBack /></button>
          <div className="min-w-0 flex-1">
            <div className="ios-headline lg:ios-title1 truncate">{song.title}</div>
            <div className="ios-footnote lg:ios-subhead label-2 truncate">{song.artist ?? (song.source === "file" ? "Local file" : "")}</div>
          </div>
          <div className="glass rounded-full px-3.5 h-11 flex items-center gap-2 ios-footnote" title={`Relative ${relativeKey(keyName, analysis.scale)} · ${Math.round(analysis.keyStrength * 100)}% confidence`}>
            <span className="chordname text-gold-hi ios-headline">{keyLabel}</span>
            <span className="label-2">{Math.round(analysis.bpm)} bpm</span>
            <span className="hidden lg:inline label-3">· rel. {relativeKey(keyName, analysis.scale)}</span>
          </div>
        </div>
        <div className="mt-3 lg:mt-5 lg:flex lg:items-center lg:gap-3">
          <div className="lg:w-[420px]">
            <Segmented id="song-view" value={view} onChange={setView} options={[
              { value: "sheet", label: "Sheet" }, { value: "timeline", label: "Beats" }, { value: "chords", label: "Chords" }, { value: "learn", label: "Learn" },
            ]} />
          </div>
          <div className="hidden lg:flex gap-2 flex-wrap">{settingsStrip}</div>
        </div>
      </header>

      {/* Key / capo / transpose strip (mobile) */}
      <section className="px-4 flex gap-2 overflow-x-auto no-scrollbar py-1 lg:hidden">
        {settingsStrip}
      </section>

      {/* Content */}
      <section className="flex-1 px-4 pt-3 pb-[calc(var(--sab)+190px)] lg:px-0 lg:pb-0 lg:min-w-0">
        {view === "sheet" && (
          <>
            <ChordSheet lines={sheetLines} time={player.time} display={display} onSeek={player.seek} onChord={setOpenChord} known={new Set(prefs.known[instrument])} />
            <div className="mt-6 flex flex-wrap gap-2 text-[13px]">
              {!song.lyrics && <button onClick={retryLyrics} disabled={lyricsBusy} className="press glass rounded-full h-10 px-4 ios-subhead text-ivory">{lyricsBusy ? "Searching…" : "Find lyrics again"}</button>}
              <button onClick={() => { setLyricsDraft(song.lyrics?.lines.map((l) => l.text).join("\n") ?? ""); setEditingLyrics(true); }} className="press glass rounded-full h-10 px-4 ios-subhead text-ivory">{song.lyrics ? "Edit lyrics" : "Paste lyrics"}</button>
              {song.lyrics && !song.lyrics.synced && <span className="self-center ios-footnote label-2">Lyrics are unsynced, chords are placed approximately.</span>}
            </div>
          </>
        )}
        {view === "timeline" && <Timeline analysis={analysis} time={player.time} display={display} onSeek={player.seek} />}
        {view === "chords" && <ChordGallery chords={chords} display={display} instrument={instrument} flats={flats} known={new Set(prefs.known[instrument])} current={current ? display(current.chord) : null} onChord={setOpenChord} />}
        {view === "learn" && (
          <Learn chords={chords} instrument={instrument} known={prefs.known[instrument]} transpose={transpose} capo={capo}
            onApply={(o) => update({ capo: o.capo, transpose: o.transpose })} onChord={setOpenChord} />
        )}
      </section>

      {/* Player: floating on mobile, docked on desktop */}
      <aside className="lg:sticky lg:top-7 lg:self-start lg:flex lg:flex-col lg:gap-4">
        <Player player={player} peaks={song.peaks} duration={analysis.duration} beats={analysis.beats} current={current ? display(current.chord) : null} next={nextChord(analysis, player.time, display)} />
        {current && current.chord !== "N" && (
          <div className="hidden lg:flex inset-group p-5 items-center gap-5">
            <ChordDiagram symbol={display(current.chord)} instrument={instrument} size={instrument === "piano" ? 130 : 104} />
            <div>
              <div className="eyebrow">Playing now</div>
              <button onClick={() => setOpenChord(display(current.chord))} className="chordname press text-[32px] text-gold-hi leading-none mt-1">{display(current.chord)}</button>
              <div className="mt-1"><ChordNotes symbol={display(current.chord)} flats={flats} /></div>
            </div>
          </div>
        )}
      </aside>

      {/* Chord sheet */}
      <Sheet open={!!openChord} onClose={() => setOpenChord(null)}>
        {openChord && (
          <div className="flex flex-col items-center pb-2">
            <div className="chordname text-[44px] text-gold-hi leading-none mt-1">{openChord}</div>
            <div className="mt-1"><ChordNotes symbol={openChord} flats={flats} /></div>
            <div className="mt-4"><ChordDiagram symbol={openChord} instrument={instrument} size={140} /></div>
            <button
              onClick={() => { const list = prefs.known[instrument]; const has = list.includes(openChord); setPrefs({ known: { ...prefs.known, [instrument]: has ? list.filter((c) => c !== openChord) : [...list, openChord] } }); }}
              className={`press mt-4 h-11 px-5 rounded-full font-medium ${prefs.known[instrument].includes(openChord) ? "glass text-ivory-2" : "gold-fill"}`}
            >
              {prefs.known[instrument].includes(openChord) ? "I know this one ✓" : "Mark as known"}
            </button>
          </div>
        )}
      </Sheet>

      <Sheet open={editingLyrics} onClose={() => setEditingLyrics(false)} title="Lyrics">
        <textarea value={lyricsDraft} onChange={(e) => setLyricsDraft(e.target.value)} rows={10} placeholder="Paste lyrics, one line per lyric line" className="w-full rounded-[18px] tint-1 border border-(--glass-line) p-3 text-[15px] outline-none focus:border-gold/50" />
        <div className="flex gap-2 mt-3">
          <button onClick={saveLyrics} className="press h-11 px-5 rounded-full font-medium gold-fill">Save</button>
          <button onClick={() => setEditingLyrics(false)} className="press h-11 px-5 rounded-full glass text-ivory">Cancel</button>
        </div>
      </Sheet>
    </main>
  );
}

function nextChord(analysis: NonNullable<Song["analysis"]>, t: number, display: (s: string) => string): string | null {
  const i = analysis.chords.findIndex((s) => s.start > t);
  if (i < 0) return null;
  const c = analysis.chords[i];
  return c.chord === "N" ? null : display(c.chord);
}

function Stepper({ label, value, fmt, onChange }: { label: string; value: number; fmt: (v: number) => string; onChange: (v: number) => void }) {
  return (
    <div className="glass rounded-full h-11 pl-3.5 pr-1 flex items-center gap-0.5 shrink-0">
      <span className="ios-footnote label-2">{label}</span>
      <button aria-label={`${label} down`} onClick={() => onChange(value - 1)} className="press h-9 w-9 rounded-full flex items-center justify-center text-ivory"><IconMinus width={16} height={16} /></button>
      <span className="chordname w-7 text-center ios-headline text-gold-hi">{fmt(value)}</span>
      <button aria-label={`${label} up`} onClick={() => onChange(value + 1)} className="press h-9 w-9 rounded-full flex items-center justify-center text-ivory"><IconPlus width={16} height={16} /></button>
    </div>
  );
}
