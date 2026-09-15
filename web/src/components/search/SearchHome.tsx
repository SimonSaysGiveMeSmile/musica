"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { detectLink, resolveUrl, searchSongs, type Resolved, type SearchResult } from "@/lib/api";
import { ingestFile, ingestResolved, type IngestState } from "@/lib/ingest";
import { listSongs, type Song } from "@/lib/store/db";
import { IconFile, IconLink, IconSearch, IconSpark } from "@/components/ui/Icons";
import { fmtTime } from "@/lib/audio/player";
import { IngestProgress } from "./IngestProgress";
import Link from "next/link";
import { useT } from "@/lib/i18n";
import { Credit } from "@/components/ui/Credit";

export function SearchHome() {
  const router = useRouter();
  const { t } = useT();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<SearchResult[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ingest, setIngest] = useState<IngestState | null>(null);
  const [ingestTitle, setIngestTitle] = useState("");
  const [recent, setRecent] = useState<Song[]>([]);
  const abortRef = useRef<AbortController | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => { listSongs().then((s) => setRecent(s.slice(0, 4))).catch(() => {}); }, [ingest?.stage]);

  const finish = useCallback((id: string) => { router.push(`/song/${encodeURIComponent(id)}`); }, [router]);

  const startResolved = useCallback(async (r: Resolved) => {
    setError(null); setIngestTitle(r.title);
    try { const id = await ingestResolved(r, setIngest); finish(id); }
    catch (e) { setIngest({ stage: "error", pct: 0, detail: "", error: (e as Error).message }); }
  }, [finish]);

  const submit = useCallback(async () => {
    const text = q.trim();
    if (!text) return;
    setError(null);
    const kind = detectLink(text);
    if (kind) {
      setIngest({ stage: "fetching", pct: 0.01, detail: kind === "spotify" ? "ingest.readingSpotify" : "ingest.readingYouTube" });
      setIngestTitle(kind === "spotify" ? t("ingest.spotifyTrack") : t("ingest.youtubeVideo"));
      try { const r = await resolveUrl(text); await startResolved(r); }
      catch (e) { setIngest({ stage: "error", pct: 0, detail: "", error: (e as Error).message }); }
      return;
    }
    abortRef.current?.abort();
    const ac = new AbortController(); abortRef.current = ac;
    setSearching(true); setResults(null);
    try { setResults(await searchSongs(text, ac.signal)); }
    catch (e) { if ((e as Error).name !== "AbortError") setError(t("home.searchUnavailable")); }
    finally { setSearching(false); }
  }, [q, startResolved, t]);

  const pickFile = useCallback(async (f: File | undefined) => {
    if (!f) return;
    setError(null); setIngestTitle(f.name);
    try { const id = await ingestFile(f, setIngest); finish(id); }
    catch (e) { setIngest({ stage: "error", pct: 0, detail: "", error: (e as Error).message }); }
  }, [finish]);

  const busy = !!ingest && ingest.stage !== "error" && ingest.stage !== "done";

  return (
    <main className="page-pad-bottom lg:px-10 lg:max-w-[980px]">
      {/* Hero */}
      <section className="safe-top px-5 lg:px-0 pt-6 pb-2 relative">
        <div aria-hidden className="absolute top-0 right-0 w-[320px] h-[260px] pointer-events-none" style={{ background: "radial-gradient(closest-side, color-mix(in srgb, var(--gold) 16%, transparent), transparent)" }} />
        <h1 className="ios-large-title rise">Musica</h1>
        <p className="ios-title2 lg:text-[34px] lg:leading-[41px] mt-2 rise max-w-[22ch]" style={{ animationDelay: "60ms" }}>
          {t("home.tagline1")} <span className="gold-text">{t("home.tagline2")}</span>
        </p>
        <p className="label-2 mt-2 ios-subhead max-w-[38ch] rise" style={{ animationDelay: "120ms" }}>
          {t("home.intro")}
        </p>
      </section>

      {/* Input */}
      <section className="px-5 lg:px-0 mt-4 rise lg:max-w-[640px]" style={{ animationDelay: "180ms" }}>
        <form onSubmit={(e) => { e.preventDefault(); submit(); }} className="glass rounded-full p-1.5 pl-2 flex items-center gap-2">
          <span className="pl-2 label-2">{detectLink(q) ? <IconLink /> : <IconSearch />}</span>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t("home.placeholder")}
            inputMode="search"
            enterKeyHint="search"
            autoCapitalize="off"
            autoCorrect="off"
            className="flex-1 bg-transparent border-0 outline-none h-11 ios-body placeholder:text-(--label-3) min-w-0 appearance-none"
          />
          <button type="submit" disabled={busy || !q.trim()} className="press h-11 px-4 rounded-full ios-headline gold-fill disabled:opacity-40">
            {detectLink(q) ? t("home.analyze") : t("home.search")}
          </button>
        </form>
        <div className="flex gap-2 mt-3">
          <button type="button" onClick={() => fileRef.current?.click()} disabled={busy} className="press glass rounded-full h-10 px-4 flex items-center gap-2 ios-subhead text-ivory disabled:opacity-40">
            <IconFile width={18} height={18} /> {t("home.useFile")}
          </button>
          <button type="button" onClick={async () => { try { const t = await navigator.clipboard.readText(); if (t) setQ(t); } catch {} }} disabled={busy} className="press glass rounded-full h-10 px-4 flex items-center gap-2 ios-subhead text-ivory disabled:opacity-40">
            <IconLink width={18} height={18} /> {t("home.pasteLink")}
          </button>
          <input ref={fileRef} type="file" accept="audio/*,.m4a,.mp3,.wav,.flac,.ogg,.aac" className="hidden" onChange={(e) => pickFile(e.target.files?.[0])} />
        </div>
        {error && <p className="mt-3 text-felt-hi ios-footnote">{error}</p>}
      </section>

      {/* Progress */}
      <AnimatePresence>
        {ingest && (
          <motion.section key="ingest" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="px-5 lg:px-0 mt-5 lg:max-w-[640px]">
            <IngestProgress state={ingest} title={ingestTitle} onDismiss={() => setIngest(null)} />
          </motion.section>
        )}
      </AnimatePresence>

      {/* Results */}
      {(searching || results) && (
        <section className="px-5 lg:px-0 mt-6">
          <div className="eyebrow mb-3">{t("home.results")}</div>
          {searching && <div className="grid gap-2 lg:grid-cols-2">{[0, 1, 2, 3].map((i) => <div key={i} className="shimmer h-[72px] rounded-[20px]" />)}</div>}
          {results && results.length === 0 && <p className="label-2">{t("home.nothingFound")}</p>}
          <ul className="grid gap-2 lg:grid-cols-2">
            {results?.map((r, i) => (
              <motion.li key={r.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => startResolved({ id: r.id, title: r.title, duration: r.duration, thumbnail: r.thumbnail, source: "youtube", ...( { channel: r.channel } as object) })}
                  className="press w-full inset-group p-2 flex items-center gap-3 text-left disabled:opacity-50"
                >
                  <Thumb src={r.thumbnail} alt="" />
                  <div className="min-w-0 flex-1">
                    <div className="ios-subhead font-semibold truncate">{r.title}</div>
                    <div className="ios-footnote label-2 truncate">{r.channel} · {fmtTime(r.duration)}</div>
                  </div>
                  <span className="text-gold pr-2"><IconSpark width={18} height={18} /></span>
                </button>
              </motion.li>
            ))}
          </ul>
        </section>
      )}

      {/* Recent */}
      {!results && !searching && recent.length > 0 && (
        <section className="px-5 lg:px-0 mt-8 rise" style={{ animationDelay: "240ms" }}>
          <div className="flex items-baseline justify-between mb-3">
            <div className="eyebrow">{t("home.recentlyPlayed")}</div>
            <Link href="/library" className="text-gold ios-subhead">{t("nav.library")}</Link>
          </div>
          <div className="flex gap-3 overflow-x-auto no-scrollbar -mx-5 px-5 lg:mx-0 lg:px-0 snap-x">
            {recent.map((s) => (
              <Link key={s.id} href={`/song/${encodeURIComponent(s.id)}`} className="press snap-start shrink-0 w-[150px] lg:w-[180px]">
                <div className="wood rounded-[20px] aspect-square overflow-hidden relative">
                  {s.thumbnail ? <img src={s.thumbnail} alt="" className="absolute inset-0 w-full h-full object-cover opacity-90" /> : <div className="absolute inset-0 flex items-center justify-center display text-4xl font-bold text-ivory/80">{s.analysis?.key}</div>}
                  <div className="absolute bottom-2 left-2 glass rounded-full px-2 py-0.5 ios-caption2 font-semibold">{s.analysis?.key}{s.analysis?.scale === "minor" ? "m" : ""} · {Math.round(s.analysis?.bpm ?? 0)}</div>
                </div>
                <div className="mt-2 ios-subhead font-semibold truncate">{s.title}</div>
                <div className="ios-footnote label-2 truncate">{s.artist ?? t("common.localFile")}</div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {!results && !searching && recent.length === 0 && !ingest && (
        <section className="px-5 lg:px-0 mt-10 rise lg:max-w-[640px]" style={{ animationDelay: "240ms" }}>
          <div className="inset-group p-5">
            <div className="eyebrow mb-2">{t("home.howItWorks")}</div>
            <ol className="space-y-2 ios-subhead label-2">
              <li><span className="text-gold font-semibold">1.</span> {t("home.how1")}</li>
              <li><span className="text-gold font-semibold">2.</span> {t("home.how2")}</li>
              <li><span className="text-gold font-semibold">3.</span> {t("home.how3")}</li>
            </ol>
          </div>
        </section>
      )}

      <footer className="px-5 lg:px-0 mt-14 text-center lg:text-left">
        <p className="ios-footnote label-3"><Credit /></p>
      </footer>
    </main>
  );
}

function Thumb({ src, alt }: { src?: string; alt: string }) {
  return (
    <div className="w-14 h-14 rounded-[14px] overflow-hidden bg-walnut shrink-0">
      {src && <img src={src} alt={alt} className="w-full h-full object-cover" loading="lazy" />}
    </div>
  );
}
