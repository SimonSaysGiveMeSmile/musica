"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "motion/react";
import { deleteSong, listSongs, type Song } from "@/lib/store/db";
import { LargeTitle } from "@/components/shell/LargeTitle";
import { IconChevron, IconTrash } from "@/components/ui/Icons";
import { fmtTime } from "@/lib/audio/player";
import { distinctChords } from "@/lib/analysis/postprocess";
import { useT } from "@/lib/i18n";

export function LibraryView() {
  const { t } = useT();
  const [songs, setSongs] = useState<Song[] | null>(null);
  useEffect(() => { listSongs().then(setSongs).catch(() => setSongs([])); }, []);

  return (
    <main className="page-pad-bottom">
      <LargeTitle eyebrow={t("library.eyebrow")} title={t("library.title")} />
      <section className="px-5 lg:px-10">
        {songs === null && <div className="space-y-2">{[0, 1, 2].map((i) => <div key={i} className="shimmer h-20 rounded-[22px]" />)}</div>}
        {songs?.length === 0 && (
          <div className="inset-group p-6 text-center">
            <div className="ios-title2">{t("library.empty")}</div>
            <p className="label-2 mt-1 ios-subhead">{t("library.emptyHint")}</p>
            <Link href="/" className="press inline-block mt-4 h-11 px-5 leading-[44px] rounded-full font-medium gold-fill">{t("library.findSong")}</Link>
          </div>
        )}
        <ul className="inset-group lg:grid lg:grid-cols-2">
          {songs?.map((s, i) => (
            <motion.li key={s.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }} className="row">
              <Link href={`/song/${encodeURIComponent(s.id)}`} className="press flex items-center gap-3 flex-1 min-w-0">
                <div className="wood w-14 h-14 rounded-[14px] overflow-hidden shrink-0 relative">
                  {s.thumbnail ? <img src={s.thumbnail} alt="" className="absolute inset-0 w-full h-full object-cover" /> : <div className="absolute inset-0 flex items-center justify-center chordname text-2xl text-ivory/90">{s.analysis?.key}</div>}
                </div>
                <div className="min-w-0">
                  <div className="ios-body truncate">{s.title}</div>
                  <div className="ios-footnote label-2 truncate">{s.artist ?? t("common.localFile")} · {fmtTime(s.durationSec)}</div>
                  <div className="mt-1 flex gap-1.5 items-center">
                    <span className="chordname ios-caption text-gold-hi">{s.analysis?.key}{s.analysis?.scale === "minor" ? "m" : ""}</span>
                    <span className="ios-caption label-2">{t("song.bpm", { n: Math.round(s.analysis?.bpm ?? 0) })}</span>
                    <span className="ios-caption label-2">· {t("library.chords", { n: s.analysis ? distinctChords(s.analysis).length : 0 })}</span>
                    {s.capo ? <span className="ios-caption label-2">· {t("library.capo", { n: s.capo })}</span> : null}
                  </div>
                </div>
              </Link>
              <button aria-label={`${t("common.delete")} ${s.title}`} onClick={async () => { await deleteSong(s.id); setSongs((l) => l?.filter((x) => x.id !== s.id) ?? null); }} className="press circle-btn label-3 hover:text-felt-hi"><IconTrash width={18} height={18} /></button>
              <IconChevron className="label-3 -ml-2" width={18} height={18} />
            </motion.li>
          ))}
        </ul>
      </section>
    </main>
  );
}
