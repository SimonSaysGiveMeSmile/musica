"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "motion/react";
import { deleteSong, listSongs, type Song } from "@/lib/store/db";
import { LargeTitle } from "@/components/shell/LargeTitle";
import { IconTrash } from "@/components/ui/Icons";
import { fmtTime } from "@/lib/audio/player";
import { distinctChords } from "@/lib/analysis/postprocess";

export function LibraryView() {
  const [songs, setSongs] = useState<Song[] | null>(null);
  useEffect(() => { listSongs().then(setSongs).catch(() => setSongs([])); }, []);

  return (
    <main className="page-pad-bottom">
      <LargeTitle eyebrow="On this device" title="Library" />
      <section className="px-5 lg:px-10">
        {songs === null && <div className="space-y-2">{[0, 1, 2].map((i) => <div key={i} className="shimmer h-20 rounded-[22px]" />)}</div>}
        {songs?.length === 0 && (
          <div className="lacquer rounded-[26px] p-6 text-center">
            <div className="display text-2xl font-semibold">Nothing here yet</div>
            <p className="text-ivory-3 mt-1 text-sm">Analyze a song from the Search tab and it will live here, offline.</p>
            <Link href="/" className="press inline-block mt-4 h-11 px-5 leading-[44px] rounded-full font-medium gold-fill">Find a song</Link>
          </div>
        )}
        <ul className="grid gap-2 lg:grid-cols-2 lg:gap-3">
          {songs?.map((s, i) => (
            <motion.li key={s.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }} className="lacquer rounded-[22px] p-2 flex items-center gap-3">
              <Link href={`/song/${encodeURIComponent(s.id)}`} className="press flex items-center gap-3 flex-1 min-w-0">
                <div className="wood w-16 h-16 rounded-[16px] overflow-hidden shrink-0 relative">
                  {s.thumbnail ? <img src={s.thumbnail} alt="" className="absolute inset-0 w-full h-full object-cover" /> : <div className="absolute inset-0 flex items-center justify-center chordname text-2xl text-ivory/90">{s.analysis?.key}</div>}
                </div>
                <div className="min-w-0">
                  <div className="font-semibold text-[15px] truncate">{s.title}</div>
                  <div className="text-ivory-3 text-[13px] truncate">{s.artist ?? "Local file"} · {fmtTime(s.durationSec)}</div>
                  <div className="mt-1 flex gap-1.5 items-center">
                    <span className="chordname text-[12px] text-gold-hi">{s.analysis?.key}{s.analysis?.scale === "minor" ? "m" : ""}</span>
                    <span className="text-[11px] text-ivory-3">{Math.round(s.analysis?.bpm ?? 0)} bpm</span>
                    <span className="text-[11px] text-ivory-3">· {s.analysis ? distinctChords(s.analysis).length : 0} chords</span>
                    {s.capo ? <span className="text-[11px] text-ivory-3">· capo {s.capo}</span> : null}
                  </div>
                </div>
              </Link>
              <button aria-label={`Delete ${s.title}`} onClick={async () => { await deleteSong(s.id); setSongs((l) => l?.filter((x) => x.id !== s.id) ?? null); }} className="press h-10 w-10 rounded-full flex items-center justify-center text-ivory-3 hover:text-felt-hi"><IconTrash width={18} height={18} /></button>
            </motion.li>
          ))}
        </ul>
      </section>
    </main>
  );
}
