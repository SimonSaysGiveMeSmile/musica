"use client";
import { useEffect, useRef } from "react";
import type { Analysis } from "@/lib/analysis/types";

const PX_PER_SEC = 56;

export function Timeline({ analysis, time, display, onSeek }: { analysis: Analysis; time: number; display: (s: string) => string; onSeek: (t: number) => void }) {
  const scroller = useRef<HTMLDivElement>(null);
  const width = analysis.duration * PX_PER_SEC;

  useEffect(() => {
    const el = scroller.current; if (!el) return;
    const x = time * PX_PER_SEC;
    const target = x - el.clientWidth * 0.35;
    if (Math.abs(el.scrollLeft - target) > el.clientWidth * 0.4) el.scrollTo({ left: target, behavior: "smooth" });
  }, [time]);

  return (
    <div>
      <div className="eyebrow mb-2">Chords on the beat grid · tap to jump</div>
      <div ref={scroller} className="overflow-x-auto no-scrollbar -mx-4 px-4 pb-2">
        <div className="relative h-[150px]" style={{ width }}>
          {/* beat ticks */}
          {analysis.beats.map((b, i) => (
            <span key={i} aria-hidden className="absolute top-0 bottom-0 w-px" style={{ left: b * PX_PER_SEC, background: i % 4 === analysis.downbeatPhase ? "color-mix(in srgb, var(--gold-hi) 40%, transparent)" : "var(--glass-line)" }} />
          ))}
          {/* chord blocks */}
          {analysis.chords.map((s, i) => {
            const hot = time >= s.start && time < s.end;
            const w = (s.end - s.start) * PX_PER_SEC;
            if (s.chord === "N") return null;
            return (
              <button
                key={i}
                onClick={() => onSeek(s.start)}
                className={`absolute top-6 h-[84px] rounded-[14px] border text-left px-2 pt-2 overflow-hidden transition-colors ${hot ? "border-gold-hi/70 text-on-accent" : "border-(--glass-line) text-ivory tint-1"}`}
                style={{ left: s.start * PX_PER_SEC + 1, width: Math.max(8, w - 2), background: hot ? "linear-gradient(180deg, var(--gold-hi), var(--gold))" : undefined }}
              >
                <span className="chordname text-[18px] leading-none">{w > 34 ? display(s.chord) : ""}</span>
                <span className={`block mt-1 text-[10px] ${hot ? "text-on-accent/70" : "text-ivory-3"}`}>{w > 54 ? `${Math.round((s.end - s.start) / (60 / analysis.bpm))} beats` : ""}</span>
                <span aria-hidden className="absolute bottom-0 left-0 right-0 h-1" style={{ background: `color-mix(in srgb, var(--gold-hi) ${Math.round(25 + s.strength * 60)}%, transparent)` }} />
              </button>
            );
          })}
          {/* playhead */}
          <span aria-hidden className="absolute top-2 bottom-2 w-[2px] rounded bg-ivory" style={{ left: time * PX_PER_SEC, boxShadow: "0 0 12px color-mix(in srgb, var(--ivory) 70%, transparent)" }} />
          {/* time ruler */}
          {Array.from({ length: Math.ceil(analysis.duration / 10) }, (_, i) => (
            <span key={i} className="absolute bottom-0 text-[10px] text-ivory-3 tabular-nums" style={{ left: i * 10 * PX_PER_SEC }}>{i * 10}s</span>
          ))}
        </div>
      </div>
      <p className="label-2 ios-footnote mt-2">Bar under each block shows how confident the analysis is for that chord.</p>
    </div>
  );
}
