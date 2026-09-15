"use client";
import { useEffect, useRef } from "react";
import type { SheetLine } from "@/lib/lyrics/align";

export function ChordSheet({ lines, time, display, onSeek, onChord, known }: {
  lines: SheetLine[]; time: number; display: (s: string) => string; onSeek: (t: number) => void; onChord: (c: string) => void; known: Set<string>;
}) {
  const activeRef = useRef<HTMLDivElement>(null);
  const activeIdx = lines.findIndex((l) => time >= l.time && time < l.end);

  useEffect(() => {
    const el = activeRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    if (r.top < 140 || r.bottom > window.innerHeight - 260) el.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [activeIdx]);

  if (!lines.length) return <p className="label-2 ios-subhead mt-4">No lyrics for this song yet. Use the Beats view, or paste lyrics below.</p>;

  return (
    <div className="space-y-1 ios-body lg:text-[19px] lg:leading-[26px] lg:max-w-[64ch]">
      {lines.map((l, i) => {
        const active = i === activeIdx;
        const past = time >= l.end;
        return (
          <div
            key={i}
            ref={active ? activeRef : undefined}
            onClick={() => onSeek(l.time)}
            className={`relative rounded-[18px] px-3 py-2 -mx-1 transition-colors cursor-pointer ${active ? "lens" : "hover:bg-(--tint-1)"}`}
          >
            {active && <span aria-hidden className="absolute left-0 top-3 bottom-3 w-[3px] rounded-full" style={{ background: "linear-gradient(180deg, var(--gold-hi), var(--gold-lo))" }} />}
            {l.instrumental ? (
              <div className="flex flex-wrap gap-2 items-center py-0.5">
                <span className="eyebrow mr-1">Instrumental</span>
                {l.chords.map((c, k) => (
                  <ChordTag key={k} symbol={display(c.chord)} known={known} onChord={onChord} hot={active && time >= c.time && (l.chords[k + 1] ? time < l.chords[k + 1].time : true)} />
                ))}
              </div>
            ) : (
              <Line line={l} display={display} onChord={onChord} known={known} dim={past && !active} hotTime={active ? time : -1} />
            )}
          </div>
        );
      })}
    </div>
  );
}

function Line({ line, display, onChord, known, dim, hotTime }: { line: SheetLine; display: (s: string) => string; onChord: (c: string) => void; known: Set<string>; dim: boolean; hotTime: number }) {
  const text = line.text;
  const segs: { chord?: { symbol: string; time: number; hot: boolean }; text: string }[] = [];
  const chords = [...line.chords].sort((a, b) => a.at - b.at);
  let cursor = 0;
  if (!chords.length || chords[0].at > 0) segs.push({ text: text.slice(0, chords[0]?.at ?? text.length) });
  chords.forEach((c, i) => {
    const end = chords[i + 1]?.at ?? text.length;
    const hot = hotTime >= 0 && hotTime >= c.time && (chords[i + 1] ? hotTime < chords[i + 1].time : true);
    segs.push({ chord: { symbol: display(c.chord), time: c.time, hot }, text: text.slice(c.at, end) });
    cursor = end;
  });
  if (cursor < text.length && chords.length) segs[segs.length - 1].text += text.slice(cursor);
  return (
    <div className={`flex flex-wrap items-end ${dim ? "opacity-45" : ""}`}>
      {segs.map((s, i) => (
        <span key={i} className="inline-flex flex-col items-start whitespace-pre">
          <span className="h-[22px]">{s.chord && <ChordTag symbol={s.chord.symbol} known={known} onChord={onChord} hot={s.chord.hot} inline />}</span>
          <span>{s.text || " "}</span>
        </span>
      ))}
    </div>
  );
}

function ChordTag({ symbol, known, onChord, hot, inline }: { symbol: string; known: Set<string>; onChord: (c: string) => void; hot: boolean; inline?: boolean }) {
  const unknown = !known.has(symbol);
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onChord(symbol); }}
      className={`chordname press rounded-md px-1.5 ${inline ? "text-[14px] lg:text-[15px] h-[20px] -ml-1" : "text-[15px] h-7 px-2.5 rounded-full"} leading-none inline-flex items-center gap-1 transition-colors ${
        hot ? "gold-fill" : unknown ? "label-2" : "text-gold-hi"
      }`}
      title={unknown ? `${symbol} · not in your chords yet` : symbol}
    >
      {symbol}
      {unknown && !hot && <span aria-hidden className="w-1 h-1 rounded-full bg-felt-hi/80 self-start mt-0.5" />}
    </button>
  );
}
