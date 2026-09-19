"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { getAudio, getSong, saveSong, type Song } from "@/lib/store/db";
import { usePlayer } from "@/lib/audio/player";
import { usePrefs, setPrefs } from "@/lib/store/prefs";
import { chordAt, distinctChords, firstVocalOnset, simplifyChords, vocalActivityIn } from "@/lib/analysis/postprocess";
import { CHORD_GRIDS, type ChordGrid } from "@/lib/store/prefs";
import { useAutoHide } from "@/lib/ui/autoHide";
import { Pills, Switch } from "@/components/ui/Controls";
import { keyPrefersFlats, transposeKey, transposeSymbol, relativeKey } from "@/lib/theory/chords";
import type { Instrument } from "@/lib/theory/coverage";
import { Segmented } from "@/components/ui/Segmented";
import { Sheet } from "@/components/ui/Sheet";
import { IconBack, IconMinus, IconNotes, IconPlus, IconSliders } from "@/components/ui/Icons";
import { Player } from "./Player";
import { ChordSheet } from "./ChordSheet";
import { Timeline } from "./Timeline";
import { ChordGallery } from "./ChordGallery";
import { Learn } from "./Learn";
import { ChordDiagram, ChordNotes } from "@/components/chords/ChordDiagram";
import { alignSheet, placeUnsyncedLines } from "@/lib/lyrics/align";
import { fetchLyrics, userLyrics } from "@/lib/lyrics/lrclib";
import { LANG_NAMES } from "@/lib/lyrics/lang";
import { leadInSeconds } from "@/lib/lyrics/align";
import { estimateOffset } from "@/lib/lyrics/sync";
import { useT } from "@/lib/i18n";

type View = "sheet" | "timeline" | "chords" | "learn";

export function SongView({ id }: { id: string }) {
  const router = useRouter();
  const prefs = usePrefs();
  const { t } = useT();
  const [song, setSong] = useState<Song | null | undefined>(undefined);
  const [src, setSrc] = useState<string | null>(null);
  const [view, setView] = useState<View>("sheet");
  const [openChord, setOpenChord] = useState<string | null>(null);
  const [editingLyrics, setEditingLyrics] = useState(false);
  const [lyricsDraft, setLyricsDraft] = useState("");
  const [lyricsBusy, setLyricsBusy] = useState(false);
  const [settings, setSettings] = useState(false);
  const hidden = useAutoHide(prefs.hideOnScroll);

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
  const instrument: Instrument = song?.instrument ?? prefs.instrument;
  const transpose = song?.transpose ?? 0;
  const capo = song?.capo ?? 0;
  // the recording follows the transpose setting; the capo only changes the fingering
  const pitch = useMemo(() => ({ semitones: transpose, enabled: prefs.audioTranspose }), [transpose, prefs.audioTranspose]);
  const player = usePlayer(src, analysis?.beats, analysis?.downbeatPhase ?? 0, pitch);
  const shift = transpose - capo; // what the player fingers
  const flats = analysis ? keyPrefersFlats(transposeKey(analysis.key, analysis.scale, shift), analysis.scale) : false;

  const update = useCallback((patch: Partial<Song>) => {
    setSong((s) => { if (!s) return s; const n = { ...s, ...patch }; saveSong(n); return n; });
  }, []);

  const display = useCallback((sym: string) => transposeSymbol(sym, shift, flats), [shift, flats]);

  // an accidental sync can leave a wild offset behind; anything beyond ±30 s is treated as none
  const rawOffset = song?.lyricsOffset ?? 0;
  const lyricsOffset = Math.abs(rawOffset) <= 30 ? rawOffset : 0;
  const offsetLines = useMemo(() => (song?.lyrics?.lines ?? []).map((l) => (l.time >= 0 ? { ...l, time: Math.max(0, l.time + lyricsOffset) } : l)), [song?.lyrics, lyricsOffset]);
  const leadIn = analysis ? leadInSeconds(song?.peaks, analysis.duration) : 0;
  /** Where each lyric line starts, for "one chord per line": synced lines as they are, unsynced ones where the sheet places them. */
  const lineTimes = useMemo(() => {
    if (!analysis || !offsetLines.length) return [];
    const synced = offsetLines.every((l) => l.time >= 0);
    const placed = synced ? offsetLines : placeUnsyncedLines(offsetLines, analysis.duration, song?.lyricAnchors, leadIn);
    return placed.filter((l) => l.text.trim()).map((l) => l.time);
  }, [analysis, offsetLines, song?.lyricAnchors, leadIn]);
  /** The chords the page shows: the analysis, simplified as far as the settings ask. */
  const shown = useMemo(() => (analysis ? { ...analysis, chords: simplifyChords(analysis, { grid: prefs.chordGrid, pick: prefs.chordPick, inKey: prefs.chordsInKey }, lineTimes) } : undefined), [analysis, prefs.chordGrid, prefs.chordPick, prefs.chordsInKey, lineTimes]);
  const sheetLines = useMemo(() => {
    if (!analysis || !shown) return [];
    return alignSheet(offsetLines, shown.chords, analysis.duration, (a, b) => vocalActivityIn(analysis, a, b), song?.lyricAnchors, leadIn);
  }, [analysis, shown, offsetLines, song?.lyricAnchors, leadIn]);
  const nudge = useCallback((d: number) => update({ lyricsOffset: Math.round(((song?.lyricsOffset ?? 0) + d) * 10) / 10, lyricsAutoSynced: false }), [song?.lyricsOffset, update]);
  /** Align the first sung line with the first detected singing. */
  const autoSync = () => {
    if (!analysis || !song?.lyrics) return;
    // 1. match phrase starts against detected vocal onsets
    const est = estimateOffset(song.lyrics.lines, analysis.vocals);
    if (est && est.score >= 0.2 && Math.abs(est.offset) <= 12) { update({ lyricsOffset: est.offset, lyricsAutoSynced: true }); return; }
    // 2. otherwise align the first line with the first sustained singing, if that is a modest correction
    const onset = firstVocalOnset(analysis);
    const first = song.lyrics.lines.find((l) => l.time >= 0 && l.text.trim());
    if (onset === null || !first) { update({ lyricsOffset: 0 }); return; }
    const off = Math.round((onset - first.time) * 10) / 10;
    update({ lyricsOffset: Math.abs(off) <= 12 ? off : 0 });
  };
  const canAutoSync = !!analysis?.vocals && firstVocalOnset(analysis) !== null;
  /** Unsynced lyrics: long-press pins that line to the current moment; later lines re-spread to the next pin. */
  const anchorLine = useCallback((lineIndex: number) => {
    if (!song) return;
    const next = { ...(song.lyricAnchors ?? {}), [lineIndex]: Math.round(player.time * 10) / 10 };
    update({ lyricAnchors: next });
  }, [song, player.time, update]);
  const anchorCount = Object.keys(song?.lyricAnchors ?? {}).length;
  /** Long-press on a line: make that line start right now. */
  const syncLineToNow = useCallback((originalTime: number) => {
    const off = Math.round((player.time - originalTime) * 10) / 10;
    if (Math.abs(off) <= 30) update({ lyricsOffset: off, lyricsAutoSynced: false });
  }, [player.time, update]);

  const current = shown ? chordAt(shown, player.time) : null;
  const chords = useMemo(() => (shown ? distinctChords(shown) : []), [shown]);

  const saveLyrics = useCallback(() => {
    update({ lyrics: userLyrics(lyricsDraft) });
    setEditingLyrics(false);
  }, [lyricsDraft, update]);

  const retryLyrics = useCallback(async () => {
    if (!song) return;
    setLyricsBusy(true);
    try {
      const l = await fetchLyrics(song.title, song.artist, song.durationSec, undefined, song.title);
      if (l) { const est = l.synced ? estimateOffset(l.lines, analysis?.vocals) : null; update({ lyrics: l, lyricsOffset: est?.confident ? est.offset : 0, lyricsAutoSynced: !!est?.confident, lyricAnchors: {} }); }
    }
    finally { setLyricsBusy(false); }
  }, [song, update]);

  if (song === undefined) return <div className="safe-top p-5 text-ivory-3">{t("song.opening")}</div>;
  if (song === null || !analysis || !shown) {
    return (
      <main className="safe-top p-5">
        <button onClick={() => router.back()} className="press text-gold flex items-center gap-1"><IconBack /> {t("common.back")}</button>
        <p className="mt-6 text-ivory-2">{t("song.notInLibrary")}</p>
      </main>
    );
  }

  const keyName = transposeKey(analysis.key, analysis.scale, transpose);
  const keyLabel = `${keyName}${analysis.scale === "minor" ? "m" : ""}`;
  const gridIndex = Math.max(0, CHORD_GRIDS.indexOf(prefs.chordGrid));
  const gridLabel = (g: ChordGrid) => t(`song.grid${g}` as "song.grid0");
  const changes = shown.chords.filter((c) => c.chord !== "N").length;

  const simplified = prefs.chordGrid !== 0 || prefs.chordsInKey;
  const settingsStrip = (
    <>
      {/* first in the strip: an icon while the chords are as detected, the level's name once they are simplified */}
      <button onClick={() => setSettings(true)} aria-label={t("song.settings")} data-simplified={simplified || undefined}
        className={`press h-11 flex items-center justify-center gap-2 shrink-0 ios-footnote ${simplified ? "gold-fill font-semibold rounded-full px-3.5" : "glass text-ivory circle-btn"}`}>
        <IconSliders width={17} height={17} />{simplified && (prefs.chordGrid === 0 ? t("song.inKey") : gridLabel(prefs.chordGrid))}
      </button>
      <Stepper label={t("song.transpose")} value={transpose} fmt={(v) => (v > 0 ? `+${v}` : `${v}`)} onChange={(v) => update({ transpose: Math.max(-11, Math.min(11, v)) })} />
      {instrument !== "piano" && <Stepper label={t("song.capo")} value={capo} fmt={(v) => `${v}`} onChange={(v) => update({ capo: Math.max(0, Math.min(9, v)) })} />}
      <div className="glass rounded-full h-11 p-[3px] flex items-center shrink-0">
        {(["guitar", "piano", "ukulele"] as Instrument[]).map((i) => (
          <button key={i} onClick={() => { update({ instrument: i }); setPrefs({ instrument: i }); }} className={`press h-full px-3.5 rounded-full ios-footnote capitalize ${instrument === i ? "lens text-ivory font-semibold" : "label-2 font-medium"}`}>{t(`song.${i}` as const)}</button>
        ))}
      </div>
      <div className="hairline rounded-full h-11 px-3.5 flex items-center shrink-0 ios-footnote label-2 lg:hidden">
        {t("song.relative", { key: relativeKey(keyName, analysis.scale), pct: Math.round(analysis.keyStrength * 100) })}
      </div>
    </>
  );

  return (
    <main className="flex flex-col min-h-dvh lg:grid lg:grid-cols-[minmax(0,1fr)_380px] lg:gap-8 lg:px-10 lg:pt-7 lg:pb-16 lg:items-start">
      {/* Header */}
      <header className={`song-header safe-top px-4 pt-2 pb-3 sticky top-0 z-30 lg:static lg:px-0 lg:pt-0 lg:col-span-2 dock ${hidden ? "dock-hide-up" : ""}`} data-hidden={hidden || undefined}>
        <div className="flex items-center gap-2 lg:gap-4">
          <button onClick={() => router.push("/library")} aria-label={t("common.back")} className="press glass circle-btn text-ivory shrink-0"><IconBack /></button>
          <div className="min-w-0 flex-1">
            <div className="ios-headline lg:ios-title1 truncate">{song.title}</div>
            <div className="ios-footnote lg:ios-subhead label-2 truncate">{song.artist ?? (song.source === "file" ? t("common.localFile") : "")}</div>
          </div>
          <div className="glass rounded-full px-3.5 h-11 flex items-center gap-2 ios-footnote" title={t("song.relative", { key: relativeKey(keyName, analysis.scale), pct: Math.round(analysis.keyStrength * 100) })}>
            <span className="chordname text-gold-hi ios-headline">{keyLabel}</span>
            <span className="label-2">{t("song.bpm", { n: Math.round(analysis.bpm) })}</span>
            <span className="hidden lg:inline label-3">· {t("song.rel", { key: relativeKey(keyName, analysis.scale) })}</span>
          </div>
        </div>
        <div className="mt-3 lg:mt-5 lg:flex lg:items-center lg:gap-3">
          <div className="lg:w-[420px]">
            <Segmented id="song-view" value={view} onChange={setView} options={[
              { value: "sheet", label: t("song.sheet") }, { value: "timeline", label: t("song.beats") }, { value: "chords", label: t("song.chords") }, { value: "learn", label: t("song.learn") },
            ]} />
          </div>
          <button onClick={() => router.push(`/song/${id}/tutorial`)} className="press gold-fill rounded-full h-11 px-4 mt-3 lg:mt-0 flex items-center gap-2 ios-subhead font-semibold shrink-0 w-full lg:w-auto justify-center">
            <IconNotes width={18} height={18} /> {t("tut.open")}
          </button>
          <div className="hidden lg:flex gap-2 flex-wrap">{settingsStrip}</div>
        </div>
      </header>

      {/* Key / capo / transpose strip (mobile) */}
      <section className="px-4 flex gap-2 overflow-x-auto no-scrollbar py-1 lg:hidden">
        {settingsStrip}
      </section>

      {/* Content */}
      {/* the floating player sits over this, so the page reserves exactly as much room as it takes */}
      <section className="flex-1 px-4 pt-3 player-pad-bottom lg:px-0 lg:min-w-0">
        {view === "sheet" && (
          <>
            <ChordSheet lines={sheetLines} time={player.time} display={display} onSeek={player.seek} onChord={setOpenChord} known={new Set(prefs.known[instrument])} lang={song.lyrics?.lang} playing={player.playing} onSync={song.lyrics?.synced ? (t) => syncLineToNow(t - lyricsOffset) : undefined} onAnchor={song.lyrics && !song.lyrics.synced ? anchorLine : undefined} />
            {song.lyrics && !song.lyrics.synced && (
              <div className="mt-5 inset-group">
                <div className="row">
                  <span className="ios-body flex-1">{t("sheet.sync")}</span>
                  <span className="ios-footnote label-2 tabular-nums">{t("sheet.anchors", { n: anchorCount })}</span>
                  {anchorCount > 0 && <button onClick={() => update({ lyricAnchors: {} })} className="press ios-footnote text-gold ml-2">{t("common.reset")}</button>}
                </div>
                <div className="row !min-h-0 py-2"><span className="ios-caption label-3">{t("sheet.anchorHint")}</span></div>
              </div>
            )}
            {song.lyrics?.synced && (
              <div className="mt-5 inset-group">
                <div className="row">
                  <span className="ios-body flex-1">{t("sheet.sync")}</span>
                  <button onClick={() => nudge(-0.2)} className="press glass rounded-full h-9 px-3 ios-footnote text-ivory">{t("sheet.earlier")}</button>
                  <span className="chordname ios-subhead tabular-nums w-14 text-center text-gold-hi">{t("sheet.offset", { n: `${lyricsOffset > 0 ? "+" : ""}${lyricsOffset.toFixed(1)}` })}</span>
                  <button onClick={() => nudge(0.2)} className="press glass rounded-full h-9 px-3 ios-footnote text-ivory">{t("sheet.later")}</button>
                  {canAutoSync && <button onClick={autoSync} className="press gold-fill rounded-full h-9 px-3 ios-footnote">{t("sheet.auto")}</button>}
                  {lyricsOffset !== 0 && <button onClick={() => update({ lyricsOffset: 0 })} className="press ios-footnote text-gold ml-1">{t("common.reset")}</button>}
                </div>
                <div className="row !min-h-0 py-2"><span className="ios-caption label-3">{song.lyricsAutoSynced && lyricsOffset !== 0 ? `${t("sheet.autoSynced", { n: `${lyricsOffset > 0 ? "+" : ""}${lyricsOffset.toFixed(1)}` })} · ` : ""}{t("sheet.syncHint")}</span></div>
              </div>
            )}
            <div className="mt-4 flex flex-wrap gap-2 text-[13px]">
              {!song.lyrics && <button onClick={retryLyrics} disabled={lyricsBusy} className="press glass rounded-full h-10 px-4 ios-subhead text-ivory">{lyricsBusy ? t("song.searching") : t("song.findLyricsAgain")}</button>}
              <button onClick={() => { setLyricsDraft(song.lyrics?.lines.map((l) => l.text).join("\n") ?? ""); setEditingLyrics(true); }} className="press glass rounded-full h-10 px-4 ios-subhead text-ivory">{song.lyrics ? t("song.editLyrics") : t("song.pasteLyrics")}</button>
              {song.lyrics?.lang && song.lyrics.lang !== "und" && <span className="self-center ios-footnote label-3">{t("sheet.lyricsIn", { lang: LANG_NAMES[song.lyrics.lang] })}</span>}
              {song.lyrics && !song.lyrics.synced && <span className="self-center ios-footnote label-2">{t("song.unsynced")}</span>}
            </div>
          </>
        )}
        {view === "timeline" && <Timeline analysis={shown} time={player.time} display={display} onSeek={player.seek} />}
        {view === "chords" && <ChordGallery chords={chords} display={display} instrument={instrument} flats={flats} known={new Set(prefs.known[instrument])} current={current ? display(current.chord) : null} onChord={setOpenChord} />}
        {view === "learn" && (
          <Learn chords={chords} instrument={instrument} known={prefs.known[instrument]} transpose={transpose} capo={capo}
            onApply={(o) => update({ capo: o.capo, transpose: o.transpose })} onChord={setOpenChord} />
        )}
      </section>

      {/* Player: floating on mobile, docked on desktop */}
      <aside className="lg:sticky lg:top-7 lg:self-start lg:flex lg:flex-col lg:gap-4">
        <Player player={player} peaks={song.peaks} duration={analysis.duration} beats={analysis.beats} current={current ? display(current.chord) : null} next={nextChord(shown, player.time, display)} hidden={hidden} shift={prefs.audioTranspose ? transpose : 0} />
        {current && current.chord !== "N" && (
          <div className="hidden lg:flex inset-group p-5 items-center gap-5">
            <ChordDiagram symbol={display(current.chord)} instrument={instrument} size={instrument === "piano" ? 130 : 104} />
            <div>
              <div className="eyebrow">{t("song.playingNow")}</div>
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
              {prefs.known[instrument].includes(openChord) ? t("song.knowThisOne") : t("song.markKnown")}
            </button>
          </div>
        )}
      </Sheet>

      <Sheet open={settings} onClose={() => setSettings(false)} title={t("song.settings")}>
        <div className="inset-group">
          <div className="row">
            <span className="ios-body flex-1">{t("song.simplify")}</span>
            <span className="chordname ios-subhead text-gold-hi">{gridLabel(prefs.chordGrid)}</span>
          </div>
          <div className="row !min-h-0 pt-0 pb-2 flex-col items-stretch gap-0">
            <input type="range" min={0} max={CHORD_GRIDS.length - 1} step={1} value={gridIndex}
              onChange={(e) => setPrefs({ chordGrid: CHORD_GRIDS[Number(e.target.value)] })}
              style={{ ["--fill" as string]: `${(gridIndex / (CHORD_GRIDS.length - 1)) * 100}%` }} aria-label={t("song.simplify")} aria-valuetext={gridLabel(prefs.chordGrid)} />
            {/* one tick under each stop, where the thumb actually lands (its 22px travel less than the track) */}
            <div className="relative h-2" aria-hidden>
              {CHORD_GRIDS.map((g, i) => (
                <span key={String(g)} className="absolute top-0 w-1 h-1 rounded-full -translate-x-1/2" style={{ left: `calc(11px + (100% - 22px) * ${i / (CHORD_GRIDS.length - 1)})`, background: i <= gridIndex ? "var(--gold)" : "var(--label-3)", opacity: i <= gridIndex ? 1 : 0.5 }} />
              ))}
            </div>
            <div className="flex justify-between ios-caption2 label-3 px-0.5"><span>{t("song.grid0")}</span><span>{t("song.gridline")}</span></div>
          </div>
          <div className="row !min-h-0 py-2">
            <span className="ios-caption label-3 flex-1">{prefs.chordGrid === "line" && !lineTimes.length ? t("song.gridLineNeedsLyrics") : t("song.simplifyHint")}</span>
            <span className="ios-caption tabular-nums text-gold shrink-0">{t("song.changes", { n: changes })}</span>
          </div>
          {prefs.chordGrid !== 0 && (
            <>
              <div className="row">
                <span className="ios-body flex-1">{t("song.pick")}</span>
                <Pills value={prefs.chordPick} options={[{ v: "longest" as const, l: t("song.pickLongest") }, { v: "first" as const, l: t("song.pickFirst") }]} onChange={(v) => setPrefs({ chordPick: v })} />
              </div>
              <div className="row !min-h-0 py-2"><span className="ios-caption label-3">{t("song.pickHint")}</span></div>
            </>
          )}
          <label className="row">
            <span className="ios-body flex-1">{t("song.inKey")}</span>
            <Switch on={prefs.chordsInKey} onChange={(v) => setPrefs({ chordsInKey: v })} label={t("song.inKey")} />
          </label>
          <div className="row !min-h-0 py-2"><span className="ios-caption label-3">{t("song.inKeyHint", { key: keyLabel })}</span></div>
        </div>
        <div className="inset-group mt-4">
          <label className="row">
            <span className="ios-body flex-1">{t("song.audioTranspose")}</span>
            <Switch on={prefs.audioTranspose} onChange={(v) => setPrefs({ audioTranspose: v })} label={t("song.audioTranspose")} />
          </label>
          <div className="row !min-h-0 py-2"><span className="ios-caption label-3">{t("song.audioTransposeHint")}</span></div>
        </div>
        <div className="inset-group mt-4">
          <label className="row">
            <span className="ios-body flex-1">{t("song.hideOnScroll")}</span>
            <Switch on={prefs.hideOnScroll} onChange={(v) => setPrefs({ hideOnScroll: v })} label={t("song.hideOnScroll")} />
          </label>
          <div className="row !min-h-0 py-2"><span className="ios-caption label-3">{t("song.hideOnScrollHint")}</span></div>
        </div>
      </Sheet>

      <Sheet open={editingLyrics} onClose={() => setEditingLyrics(false)} title={t("song.lyricsTitle")}>
        <textarea value={lyricsDraft} onChange={(e) => setLyricsDraft(e.target.value)} rows={10} placeholder={t("song.lyricsPlaceholder")} className="w-full rounded-[18px] tint-1 border border-(--glass-line) p-3 text-[15px] outline-none focus:border-gold/50" />
        <div className="flex gap-2 mt-3">
          <button onClick={saveLyrics} className="press h-11 px-5 rounded-full font-medium gold-fill">{t("common.save")}</button>
          <button onClick={() => setEditingLyrics(false)} className="press h-11 px-5 rounded-full glass text-ivory">{t("common.cancel")}</button>
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
