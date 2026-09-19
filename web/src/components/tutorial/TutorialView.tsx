"use client";
/** The tutorial screen: notes falling onto the instrument, a transport that rewinds by the bar
 *  and can loop the phrase you are working on, and a microphone that pauses the song the moment
 *  you stop playing. The transport pulls down out of the way when you want the room. */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { getAudio, getSong, saveSong, type Song } from "@/lib/store/db";
import { usePlayer, fmtTime } from "@/lib/audio/player";
import { useSynthPlayer, previewNote, countIn, cancelCountIn } from "@/lib/audio/synth";
import { usePlayDetect } from "@/lib/audio/playDetect";
import { setPrefs, usePrefs } from "@/lib/store/prefs";
import { chordAt } from "@/lib/analysis/postprocess";
import { transposeSymbol, keyPrefersFlats, transposeKey } from "@/lib/theory/chords";
import type { Instrument } from "@/lib/theory/coverage";
import { sectionAt } from "@/lib/tutorial/sections";
import { generateTutorial, tutorialFromScore } from "@/lib/tutorial/generate";
import { isScoreFile, parseScoreFile, SCORE_ACCEPT } from "@/lib/tutorial/score";
import type { Hand } from "@/lib/tutorial/types";
import { Sheet } from "@/components/ui/Sheet";
import { Pills, Switch } from "@/components/ui/Controls";
import { Segmented } from "@/components/ui/Segmented";
import { GrabHandle, useRetracted } from "@/components/ui/Retract";
import { IconBack, IconLive, IconLoop, IconNotes, IconPause, IconPlay, IconRewind, IconSectionBack, IconSliders } from "@/components/ui/Icons";
import { PianoRoll } from "./PianoRoll";
import { FretRoll, type ChordSpan } from "./FretRoll";
import { useT } from "@/lib/i18n";

const FALL = [{ id: "slow", look: 4.5 }, { id: "medium", look: 3 }, { id: "fast", look: 2 }] as const;
const REWINDS = [3, 5, 10];

export function TutorialView({ id }: { id: string }) {
  const router = useRouter();
  const prefs = usePrefs();
  const { t } = useT();
  const [song, setSong] = useState<Song | null | undefined>(undefined);
  const [src, setSrc] = useState<string | null>(null);
  const [settings, setSettings] = useState(false);
  const [busy, setBusy] = useState<null | { pct: number }>(null);
  const [note, setNote] = useState<string | null>(null);
  const [counting, setCounting] = useState(false);
  const [collapsed, setCollapsed] = useRetracted();
  const fileRef = useRef<HTMLInputElement>(null);

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
  const tutorial = song?.tutorial;
  const instrument: Instrument = song?.instrument ?? prefs.instrument;
  const fretted = instrument !== "piano";
  const notes = useMemo(() => tutorial?.notes ?? [], [tutorial]);
  // tutorials made before a tutorial knew about instruments were all piano
  const madeFor = tutorial?.instrument ?? "piano";
  const matches = !tutorial || madeFor === instrument;

  // a score will not line up with the recording, so those tutorials play their own notes
  const preferNotes = !song?.hasAudio || tutorial?.source === "score";
  const [notesOverride, setNotesOverride] = useState<boolean | null>(null);
  const [prevPrefer, setPrevPrefer] = useState(preferNotes);
  if (prevPrefer !== preferNotes) { setPrevPrefer(preferNotes); setNotesOverride(null); }
  const useNotes = notesOverride ?? preferNotes;

  const audioPlayer = usePlayer(useNotes ? null : src, analysis?.beats, analysis?.downbeatPhase ?? 0);
  const notesDuration = useMemo(() => notes.reduce((m, n) => Math.max(m, n.end), 0) || (analysis?.duration ?? 0), [notes, analysis]);
  const synth = useSynthPlayer(useNotes ? notes : [], notesDuration);
  const player = useNotes ? synth : audioPlayer;
  const duration = (useNotes ? notesDuration : audioPlayer.duration) || analysis?.duration || notesDuration;

  const update = useCallback((patch: Partial<Song>) => {
    setSong((s) => { if (!s) return s; const n = { ...s, ...patch }; saveSong(n); return n; });
  }, []);

  /* ---------------- which lane a fretted tutorial shows ---------------- */
  const tabNotes = useMemo(() => (matches && fretted ? notes.filter((n) => n.string !== undefined) : []), [matches, fretted, notes]);
  // the chord lane is what a fretted tutorial opens on, and what it falls back to: asking for
  // tablature must never take the chords away from a song that has no tablature to show
  const lane: "chords" | "notes" = prefs.tutorialLane === "notes" && tabNotes.length > 0 ? "notes" : "chords";

  /* ---------------- stop when the player stops ---------------- */
  const pausedByUs = useRef(false);
  const [autoPaused, setAutoPaused] = useState(false);
  /** Remember that the pause was ours, so we know we are allowed to start again. */
  const markPaused = useCallback((v: boolean) => { pausedByUs.current = v; setAutoPaused(v); }, []);
  const playingRef = useRef(player.playing);
  const toggleRef = useRef(player.toggle);
  // the detector fires from a timer, so it reads the transport through refs kept fresh here
  useEffect(() => { playingRef.current = player.playing; toggleRef.current = player.toggle; });

  const onIdle = useCallback(() => {
    if (!playingRef.current) return;
    markPaused(true);
    toggleRef.current();
  }, [markPaused]);
  const onActive = useCallback(() => {
    if (!pausedByUs.current || playingRef.current) return;
    markPaused(false);
    toggleRef.current();          // you are already playing: no count-in, just catch up
  }, [markPaused]);

  const wantMic = prefs.autoPause && !!tutorial;
  const detect = usePlayDetect({ enabled: wantMic, sensitivity: prefs.pauseSensitivity, instrument, onIdle, onActive });
  const setAutoPause = useCallback((on: boolean) => { markPaused(false); setPrefs({ autoPause: on }); }, [markPaused]);

  /* ---------------- transport helpers ---------------- */
  const sections = useMemo(() => (tutorial?.sections?.length ? tutorial.sections : [0]), [tutorial]);

  /** The phrase being repeated, fixed the moment looping starts so it does not crawl forward. */
  const [loop, setLoop] = useState<{ a: number; b: number } | null>(null);
  const loopRef = useRef(loop);
  useEffect(() => { loopRef.current = loop; });
  const setLoopAround = useCallback((at: number) => {
    const here = sectionAt(sections, at);
    const next = sections.find((s) => s > here.start + 0.25);
    setLoop({ a: here.start, b: next ?? duration });
  }, [sections, duration]);

  const jump = useCallback((to: number) => {
    markPaused(false);
    player.seek(Math.max(0, to));
    if (prefs.loopSection) setLoopAround(to);
  }, [player, markPaused, prefs.loopSection, setLoopAround]);

  const rewind = useCallback(() => jump(player.now() - prefs.rewindSec), [jump, player, prefs.rewindSec]);
  const backSection = useCallback(() => {
    const here = sectionAt(sections, player.now());
    // like a track-back button: to the top of this section, or to the one before if we just got here
    jump(player.now() - here.start > 1.5 ? here.start : here.prev);
  }, [jump, player, sections]);

  const toggleLoop = useCallback(() => {
    const on = !prefs.loopSection;
    if (on) setLoopAround(player.now()); else setLoop(null);
    setPrefs({ loopSection: on });
  }, [prefs.loopSection, player, setLoopAround]);

  // keep the playhead inside the phrase while looping
  useEffect(() => {
    if (!prefs.loopSection || !player.playing) return;
    const seek = player.seek, now = player.now;
    const timer = setInterval(() => {
      const lp = loopRef.current;
      if (lp && now() >= lp.b - 0.02) seek(lp.a);
    }, 50);
    return () => clearInterval(timer);
  }, [prefs.loopSection, player.playing, player.seek, player.now]);

  const manualToggle = useCallback(async () => {
    markPaused(false);
    if (player.playing) { cancelCountIn(); setCounting(false); player.toggle(); return; }
    if (prefs.loopSection) setLoopAround(player.now());
    if (prefs.countIn) {
      setCounting(true);
      const finished = await countIn(analysis?.bpm ?? 100);
      setCounting(false);
      if (!finished) return;           // the count was cancelled: the user changed their mind
    }
    player.toggle();
  }, [player, markPaused, prefs.countIn, prefs.loopSection, setLoopAround, analysis]);
  useEffect(() => () => cancelCountIn(), []);

  /* ---------------- making the tutorial ---------------- */
  const build = useCallback(async (mode: "arrange" | "transcribe") => {
    if (!song?.hasAudio) { setNote(t("tut.needsAudio")); return; }
    setBusy({ pct: 0 });
    setNote(null);
    try {
      const blob = await getAudio(song.id);
      if (!blob) throw new Error("no audio");
      const built = await generateTutorial(blob, { mode, instrument, analysis, onProgress: (pct) => setBusy({ pct }) });
      if (!built.notes.length) { setNote(t("tut.noNotes")); setBusy(null); return; }
      update({ tutorial: built });
      setSettings(false);
    } catch {
      setNote(t("tut.failed"));
    } finally { setBusy(null); }
  }, [song, analysis, instrument, update, t]);

  const importScore = useCallback(async (file: File) => {
    if (!isScoreFile(file)) { setNote(t("tut.scoreFailed")); return; }
    setBusy({ pct: 0 });
    try {
      const parsed = await parseScoreFile(file);
      const built = tutorialFromScore(parsed, instrument, analysis);
      if (!built.notes.length) { setNote(t("tut.noNotes")); return; }
      update({ tutorial: built });
      setNote(t("tut.scoreLoaded", { title: parsed.title || file.name }));
      setSettings(false);
    } catch (e) {
      setNote((e as Error).message || t("tut.scoreFailed"));
    } finally { setBusy(null); }
  }, [analysis, instrument, update, t]);

  /* ---------------- chord lanes for fretted instruments ---------------- */
  const shift = (song?.transpose ?? 0) - (song?.capo ?? 0);
  const flats = analysis ? keyPrefersFlats(transposeKey(analysis.key, analysis.scale, shift), analysis.scale) : false;
  const chordSpans: ChordSpan[] = useMemo(() => {
    if (!analysis || !fretted) return [];
    const out: ChordSpan[] = [];
    for (const c of analysis.chords) {
      if (c.chord === "N") continue;
      const sym = transposeSymbol(c.chord, shift, flats);
      const last = out[out.length - 1];
      if (last && last.chord === sym && c.start - last.end < 0.12) { last.end = c.end; continue; }
      out.push({ chord: sym, start: c.start, end: c.end });
    }
    return out;
  }, [analysis, fretted, shift, flats]);

  const getTime = useCallback(() => player.now(), [player]);
  const look = FALL.find((f) => f.look === prefs.tutorialSpeed)?.look ?? 3;
  const pianoReady = !fretted && matches && notes.length > 0;
  const fretReady = fretted && (lane === "notes" ? tabNotes.length > 0 : chordSpans.length > 0);
  const current = analysis && fretted ? chordAt(analysis, player.time) : null;
  const canBuild = !!song?.hasAudio;

  if (song === undefined) return <div className="safe-top p-5 text-ivory-3">{t("song.opening")}</div>;
  if (song === null) {
    return (
      <main className="safe-top p-5">
        <button onClick={() => router.back()} className="press text-gold flex items-center gap-1"><IconBack /> {t("common.back")}</button>
        <p className="mt-6 text-ivory-2">{t("song.notInLibrary")}</p>
      </main>
    );
  }

  // "melody + chords" is the piano shape; a fretted arrangement is the melody alone
  const sourceLabel = tutorial && matches && (!fretted || lane === "notes")
    ? ` · ${fretted && tutorial.source === "arrange" ? t("tut.melodyLine") : t(`tut.src.${tutorial.source}` as const)}`
    : "";

  return (
    <main className="h-dvh flex flex-col overflow-hidden" style={{ paddingBottom: "calc(var(--sab) + 6px)" }}>
      {/* header */}
      <header className="safe-top px-4 pt-1 pb-2 flex items-center gap-3 shrink-0 lg:px-8">
        <button onClick={() => router.push(`/song/${id}`)} aria-label={t("common.back")} className="press glass circle-btn text-ivory shrink-0"><IconBack /></button>
        <div className="min-w-0 flex-1">
          <div className="ios-headline truncate">{song.title}</div>
          <div className="ios-caption label-2 truncate">{t("tut.title")}{sourceLabel}</div>
        </div>
        {song.hasAudio && notes.length > 0 && matches && (!fretted || lane === "notes") && (
          <button onClick={() => setNotesOverride(!useNotes)} aria-pressed={useNotes} title={t("tut.playNotes")}
            className={`press circle-btn shrink-0 ${useNotes ? "gold-fill" : "glass text-ivory"}`}><IconNotes width={18} height={18} /></button>
        )}
        <button onClick={() => setSettings(true)} aria-label={t("tut.settings")} className="press glass circle-btn text-ivory shrink-0"><IconSliders width={18} height={18} /></button>
      </header>

      {/* hands, or which lane the fretboard shows */}
      {pianoReady && (
        <div className="px-4 lg:px-8 pb-2 flex items-center gap-2 shrink-0">
          <div className="flex-1 max-w-[280px]">
            <Segmented id="tut-hands" value={prefs.handsMode} onChange={(v) => setPrefs({ handsMode: v })}
              options={[{ value: "both", label: t("tut.both") }, { value: "l", label: t("tut.left") }, { value: "r", label: t("tut.right") }]} />
          </div>
          <div className="ml-auto flex items-center gap-1.5 ios-caption label-2">
            <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: "var(--gold)" }} />{t("tut.right")}
            <span className="inline-block w-2.5 h-2.5 rounded-full ml-1.5" style={{ background: "color-mix(in srgb, var(--ivory) 62%, transparent)" }} />{t("tut.left")}
          </div>
        </div>
      )}

      {/* the roll */}
      <section className="flex-1 min-h-0 px-3 lg:px-8 relative">
        <div className="inset-group h-full relative">
          {pianoReady && (
            <PianoRoll notes={notes} getTime={getTime} lookahead={look} hands={prefs.handsMode as "both" | Hand}
              sections={sections} beats={analysis?.beats} onKey={(m) => previewNote(m)} />
          )}
          {fretReady && (
            <FretRoll notes={lane === "notes" ? tabNotes : undefined} chords={chordSpans}
              instrument={instrument === "ukulele" ? "ukulele" : "guitar"} getTime={getTime}
              lookahead={look} sections={sections} beats={analysis?.beats} />
          )}
          {!pianoReady && !fretReady && (
            <div className="h-full flex flex-col items-center justify-center text-center px-6 gap-4 overflow-y-auto no-scrollbar py-6">
              {busy ? (
                <>
                  <div className="chordname text-[40px] text-gold tabular-nums">{Math.round(busy.pct * 100)}%</div>
                  <div className="w-52 h-1 rounded-full tint-2 overflow-hidden"><div className="h-full" style={{ width: `${busy.pct * 100}%`, background: "var(--gold)", transition: "width 200ms" }} /></div>
                  <p className="ios-subhead label-2">{t("tut.building")}</p>
                  <p className="ios-caption label-3 max-w-[280px]">{t("tut.buildingLong")}</p>
                </>
              ) : (
                <>
                  <p className="ios-title3">{t("tut.generate")}</p>
                  <p className="ios-footnote label-2 max-w-[300px]">{fretted ? t("tut.frettedIntro") : t("tut.pianoIntro")}</p>
                  <div className="flex flex-col gap-2 w-full max-w-[320px] mt-1">
                    {canBuild && <Choice title={fretted ? t("tut.melodyLine") : t("tut.arrange")} hint={fretted ? t("tut.melodyLineHint") : t("tut.arrangeHint")} onClick={() => build("arrange")} primary />}
                    {canBuild && <Choice title={t("tut.transcribe")} hint={fretted ? t("tut.transcribeFretHint") : t("tut.transcribeHint")} onClick={() => build("transcribe")} />}
                    <Choice title={t("tut.import")} hint={t("tut.importHint")} onClick={() => fileRef.current?.click()} />
                  </div>
                  {!canBuild && <p className="ios-caption label-3">{t("tut.needsAudio")}</p>}
                </>
              )}
            </div>
          )}

          {/* made for another instrument, or counting in. The chord lane does not use the stored
              tutorial at all, so it is only worth saying when those notes are what you asked for. */}
          {tutorial && !matches && !busy && (!fretted || prefs.tutorialLane === "notes") && (
            <div className="absolute inset-x-0 top-3 flex justify-center px-4 pointer-events-none">
              <div className="glass-strong rounded-[20px] px-4 py-2.5 text-center pointer-events-auto max-w-[340px]">
                <p className="ios-caption label-2">{t("tut.madeFor", { instrument: t(`song.${madeFor}` as const) })}</p>
                <button onClick={() => build("arrange")} className="press ios-footnote text-gold font-semibold mt-1">{t("tut.rebuild")}</button>
              </div>
            </div>
          )}
          {counting && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="glass-strong rounded-full w-24 h-24 flex items-center justify-center">
                <span className="chordname text-[30px] text-gold-hi">{t("tut.ready")}</span>
              </div>
            </div>
          )}

          {/* auto-pause overlay */}
          {(pianoReady || fretReady) && prefs.autoPause && detect.listening && !player.playing && autoPaused && (
            <div className="absolute inset-x-0 top-4 flex justify-center pointer-events-none">
              <div className="glass-strong rounded-full px-4 h-10 flex items-center gap-2.5 ios-footnote text-ivory">
                <IconLive width={16} height={16} />
                {t("tut.waiting")}
                <span className="w-10 h-1 rounded-full tint-2 overflow-hidden"><span className="block h-full" style={{ width: `${detect.level * 100}%`, background: "var(--gold)" }} /></span>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* transport */}
      <div className="px-3 pt-2 lg:px-8 shrink-0">
        <div className="glass-strong rounded-[28px] px-3 pt-1.5 pb-2.5">
          <GrabHandle collapsed={collapsed} onChange={setCollapsed} label={collapsed ? t("player.expand") : t("player.collapse")} />
          {collapsed ? (
            <div className="flex items-center gap-3">
              <button onClick={manualToggle} aria-label={player.playing ? t("player.pause") : t("player.play")} className="press circle-btn !w-11 !h-11 gold-fill shrink-0">
                {player.playing ? <IconPause width={19} height={19} /> : <IconPlay width={19} height={19} />}
              </button>
              <div className="flex-1 min-w-0">
                <div className="h-1 rounded-full tint-2 overflow-hidden"><div className="h-full rounded-full" style={{ width: `${duration ? Math.min(100, (player.time / duration) * 100) : 0}%`, background: "var(--gold)" }} /></div>
              </div>
              <span className="ios-caption label-2 tabular-nums shrink-0">{fmtTime(player.time)}</span>
              <button onClick={rewind} className="press glass circle-btn !w-11 !h-11 text-ivory shrink-0" aria-label={t("tut.rewindBy", { n: prefs.rewindSec })}><IconRewind width={17} height={17} /></button>
            </div>
          ) : (
            <>
              <Scrubber duration={duration} time={player.time} sections={sections} loop={prefs.loopSection ? loop : null} onSeek={jump} />
              <div className="flex items-center justify-between mt-2">
                <span className="ios-caption label-2 tabular-nums w-11">{fmtTime(player.time)}</span>
                <div className="flex items-center gap-2">
                  <button onClick={backSection} className="press glass circle-btn text-ivory" aria-label={t("tut.prevSection")}><IconSectionBack width={18} height={18} /></button>
                  <button onClick={rewind} className="press glass circle-btn text-ivory relative" aria-label={t("tut.rewindBy", { n: prefs.rewindSec })}>
                    <IconRewind width={18} height={18} />
                    <span className="absolute -bottom-0.5 right-1 ios-caption2 text-gold tabular-nums">{prefs.rewindSec}</span>
                  </button>
                  <button onClick={manualToggle} aria-label={player.playing ? t("player.pause") : t("player.play")} className="press circle-btn !w-[58px] !h-[58px] gold-fill">
                    {player.playing ? <IconPause width={24} height={24} /> : <IconPlay width={24} height={24} />}
                  </button>
                  <button onClick={toggleLoop} aria-pressed={prefs.loopSection} aria-label={t("tut.loop")}
                    className={`press circle-btn ${prefs.loopSection ? "gold-fill" : "glass text-ivory"}`}><IconLoop width={18} height={18} /></button>
                  <button onClick={() => setAutoPause(!prefs.autoPause)} aria-pressed={prefs.autoPause} aria-label={t("tut.autoPause")}
                    className={`press circle-btn ${prefs.autoPause ? (detect.listening ? "gold-fill" : "glass text-gold") : "glass text-ivory opacity-60"}`}>
                    <IconLive width={18} height={18} />
                  </button>
                </div>
                <button onClick={() => player.setRate(player.rate <= 0.55 ? 1 : Math.round((player.rate - 0.15) * 100) / 100)}
                  className="press ios-caption font-semibold tabular-nums w-11 text-right text-gold" aria-label={t("player.speed")}>
                  {Math.round(player.rate * 100)}%
                </button>
              </div>
              {(note || detect.error) && (
                <p className="ios-caption text-center mt-1.5 text-felt-hi">{detect.error ? t(detect.error === "denied" ? "tut.micDenied" : "tut.micLost") : note}</p>
              )}
            </>
          )}
        </div>
      </div>

      <input ref={fileRef} type="file" accept={SCORE_ACCEPT} className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) importScore(f); }} />

      <Sheet open={settings} onClose={() => setSettings(false)} title={t("tut.settings")}>
        <div className="inset-group">
          <label className="row">
            <span className="ios-body flex-1">{t("tut.autoPause")}</span>
            <Switch on={prefs.autoPause} onChange={setAutoPause} />
          </label>
          <div className="row !min-h-0 py-2"><span className="ios-caption label-3">{t("tut.autoPauseHint")}</span></div>
          {prefs.autoPause && (
            <div className="row">
              <span className="ios-body flex-1">{t("tut.sensitivity")}</span>
              <Pills value={prefs.pauseSensitivity} options={[{ v: 1, l: t("tut.sens1") }, { v: 2, l: t("tut.sens2") }, { v: 3, l: t("tut.sens3") }]} onChange={(v) => setPrefs({ pauseSensitivity: v as 1 | 2 | 3 })} />
            </div>
          )}
          <label className="row">
            <span className="ios-body flex-1">{t("tut.countIn")}</span>
            <Switch on={prefs.countIn} onChange={(v) => setPrefs({ countIn: v })} />
          </label>
          <div className="row !min-h-0 py-2"><span className="ios-caption label-3">{t("tut.countInHint")}</span></div>
        </div>

        <div className="inset-group mt-4">
          <label className="row">
            <span className="ios-body flex-1">{t("tut.loop")}</span>
            <Switch on={prefs.loopSection} onChange={() => toggleLoop()} />
          </label>
          <div className="row !min-h-0 py-2"><span className="ios-caption label-3">{t("tut.loopHint")}</span></div>
          <div className="row">
            <span className="ios-body flex-1">{t("tut.rewind")}</span>
            <Pills value={prefs.rewindSec} options={REWINDS.map((r) => ({ v: r, l: t("tut.seconds", { n: r }) }))} onChange={(v) => setPrefs({ rewindSec: v })} />
          </div>
          <div className="row">
            <span className="ios-body flex-1">{t("tut.fall")}</span>
            <Pills value={prefs.tutorialSpeed} options={FALL.map((f) => ({ v: f.look, l: t(`tut.${f.id}` as const) }))} onChange={(v) => setPrefs({ tutorialSpeed: v })} />
          </div>
        </div>

        <div className="inset-group mt-4">
          {fretted && (
            <div className="row">
              <span className="ios-body flex-1">{t("tut.lane")}</span>
              <Pills value={lane} options={[{ v: "chords" as const, l: t("tut.laneChords") }, { v: "notes" as const, l: t("tut.laneNotes") }]}
                onChange={(v) => setPrefs({ tutorialLane: v })} />
            </div>
          )}
          {canBuild && (
            <>
              <button onClick={() => build("arrange")} disabled={!!busy} className="row press w-full text-left">
                <span className="ios-body flex-1">{fretted ? t("tut.melodyLine") : t("tut.arrange")}</span><span className="ios-footnote text-gold">{t("tut.make")}</span>
              </button>
              <button onClick={() => build("transcribe")} disabled={!!busy} className="row press w-full text-left">
                <span className="ios-body flex-1">{t("tut.transcribe")}</span><span className="ios-footnote text-gold">{t("tut.make")}</span>
              </button>
            </>
          )}
          <button onClick={() => fileRef.current?.click()} disabled={!!busy} className="row press w-full text-left">
            <span className="ios-body flex-1">{t("tut.import")}</span><span className="ios-footnote text-gold">{t("tut.choose")}</span>
          </button>
          {tutorial && (!fretted || tutorial.dropped > 0) && (
            <div className="row !min-h-0 py-2">
              <span className="ios-caption label-3">
                {[
                  fretted ? "" : t("tut.fingers"),
                  tutorial.dropped > 0 ? t(fretted ? "tut.droppedFret" : "tut.dropped", { n: tutorial.dropped }) : "",
                ].filter(Boolean).join(" · ")}
              </span>
            </div>
          )}
        </div>
        {current && current.chord !== "N" && <p className="ios-caption label-3 mt-4 text-center">{t("tut.fretHint")}</p>}
      </Sheet>
    </main>
  );
}

function Choice({ title, hint, onClick, primary }: { title: string; hint: string; onClick: () => void; primary?: boolean }) {
  return (
    <button onClick={onClick} className={`press rounded-[20px] px-4 py-3 text-left ${primary ? "gold-fill" : "glass text-ivory"}`}>
      <div className="ios-subhead font-semibold">{title}</div>
      <div className={`ios-caption mt-0.5 ${primary ? "opacity-70" : "label-2"}`}>{hint}</div>
    </button>
  );
}

function Scrubber({ duration, time, sections, loop, onSeek }: { duration: number; time: number; sections: number[]; loop: { a: number; b: number } | null; onSeek: (t: number) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const at = (clientX: number) => {
    const el = ref.current; if (!el || !duration) return;
    const r = el.getBoundingClientRect();
    onSeek(Math.max(0, Math.min(1, (clientX - r.left) / r.width)) * duration);
  };
  const pct = duration ? Math.min(1, time / duration) * 100 : 0;
  return (
    <div ref={ref} onPointerDown={(e) => at(e.clientX)} onPointerMove={(e) => { if (e.buttons) at(e.clientX); }}
      className="relative h-6 flex items-center cursor-pointer touch-none">
      <div className="relative w-full h-1.5 rounded-full tint-2 overflow-hidden">
        {loop && duration > 0 && (
          <div className="absolute inset-y-0 rounded-full" style={{ left: `${(loop.a / duration) * 100}%`, width: `${((loop.b - loop.a) / duration) * 100}%`, background: "color-mix(in srgb, var(--gold) 28%, transparent)" }} />
        )}
        <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${pct}%`, background: "var(--gold)" }} />
      </div>
      {/* phrase marks: enough to aim at, too quiet to read as a ruler */}
      {duration > 0 && sections.map((s) => (
        <span key={s} aria-hidden className="absolute w-px h-1.5 rounded-full" style={{ left: `${(s / duration) * 100}%`, background: "color-mix(in srgb, var(--ivory) 18%, transparent)" }} />
      ))}
    </div>
  );
}
