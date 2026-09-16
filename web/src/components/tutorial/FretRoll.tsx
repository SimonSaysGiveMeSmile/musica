"use client";
/** The same falling idea for fretted instruments: one lane per string, each block carrying the
 *  fret to press, landing on the nut as it sounds. It draws either the chord being played —
 *  one shape per lane, muted strings crossed out — or note-by-note tablature with the finger
 *  to use, depending on what the tutorial holds. */
import { useEffect, useRef } from "react";
import { guitarVoicing, ukuleleVoicing } from "@/lib/theory/voicings";
import type { TutorialNote } from "@/lib/tutorial/types";

export interface ChordSpan { chord: string; start: number; end: number }

const STRINGS: Record<"guitar" | "ukulele", string[]> = {
  guitar: ["E", "A", "D", "G", "B", "e"],
  ukulele: ["G", "C", "E", "A"],
};

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

export interface FretRollProps {
  /** Note-by-note tablature. When empty, the chord lane is drawn instead. */
  notes?: TutorialNote[];
  chords: ChordSpan[];
  instrument: "guitar" | "ukulele";
  getTime: () => number;
  lookahead: number;
  sections: number[];
  beats?: number[];
}

export function FretRoll({ notes, chords, instrument, getTime, lookahead, sections, beats }: FretRollProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef({ notes, chords, instrument, getTime, lookahead, sections, beats });

  // the draw loop reads the latest props from here rather than restarting on every render
  useEffect(() => { stateRef.current = { notes, chords, instrument, getTime, lookahead, sections, beats }; });

  useEffect(() => {
    const wrap = wrapRef.current, canvas = canvasRef.current;
    if (!wrap || !canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let raf = 0;
    let pal = { gold: "#c9a45c", goldHi: "#e8c77e", ink: "#f3ede2", ground: "#0b0a09", ground2: "#151311", onAccent: "#1a1408" };
    let w = 0, h = 0;

    const resize = () => {
      const dpr = Math.min(2.5, window.devicePixelRatio || 1);
      w = wrap.clientWidth; h = wrap.clientHeight;
      canvas.width = Math.max(1, Math.round(w * dpr));
      canvas.height = Math.max(1, Math.round(h * dpr));
      canvas.style.width = `${w}px`; canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const css = getComputedStyle(wrap);
      const v = (n: string, f: string) => css.getPropertyValue(n).trim() || f;
      pal = {
        gold: v("--gold", "#c9a45c"), goldHi: v("--gold-hi", "#e8c77e"), ink: v("--ivory", "#f3ede2"),
        ground: v("--lacquer", "#0b0a09"), ground2: v("--lacquer-2", "#151311"), onAccent: v("--on-accent", "#1a1408"),
      };
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    mq.addEventListener("change", resize);
    const obs = new MutationObserver(resize);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "data-accent"] });

    const draw = () => {
      const { notes: ns, chords: cs, instrument: inst, getTime: clock, lookahead: la, sections: secs, beats: bts } = stateRef.current;
      const names = STRINGS[inst];
      const n = names.length;
      const nutH = 44;
      const rollH = h - nutH;
      const lane = w / n;
      const t = clock();
      const pps = rollH / Math.max(0.5, la);
      const tab = !!ns && ns.length > 0;

      const bg = ctx.createLinearGradient(0, 0, 0, rollH);
      bg.addColorStop(0, pal.ground); bg.addColorStop(1, pal.ground2);
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, w, rollH);

      // the strings themselves, thicker on the low side
      for (let i = 0; i < n; i++) {
        ctx.strokeStyle = `color-mix(in srgb, ${pal.ink} 14%, transparent)`;
        ctx.lineWidth = 2.2 - (i / n) * 1.4;
        ctx.beginPath();
        ctx.moveTo(lane * (i + 0.5), 0); ctx.lineTo(lane * (i + 0.5), rollH);
        ctx.stroke();
      }
      ctx.lineWidth = 1;
      if (bts) {
        ctx.strokeStyle = `color-mix(in srgb, ${pal.ink} 7%, transparent)`;
        ctx.beginPath();
        for (const b of bts) { if (b < t || b > t + la) continue; const y = Math.round(rollH - (b - t) * pps) + 0.5; ctx.moveTo(0, y); ctx.lineTo(w, y); }
        ctx.stroke();
      }
      ctx.strokeStyle = `color-mix(in srgb, ${pal.gold} 30%, transparent)`;
      ctx.beginPath();
      for (const s of secs) { if (s < t || s > t + la) continue; const y = Math.round(rollH - (s - t) * pps) + 0.5; ctx.moveTo(0, y); ctx.lineTo(w, y); }
      ctx.stroke();

      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const held: (number | null)[] = new Array(n).fill(null);

      if (tab) {
        for (const note of ns!) {
          if (note.string === undefined || note.string >= n) continue;
          if (note.end < t - 0.1 || note.start > t + la) continue;
          const bottom = rollH - (note.start - t) * pps;
          const top = bottom - Math.max(0.08, note.end - note.start - 0.04) * pps;   // a hair of daylight between strikes
          if (top > rollH) continue;
          const active = note.start <= t && note.end > t;
          const y0 = Math.min(top, rollH), y1 = Math.min(bottom, rollH);
          if (y1 - y0 < 0.5) continue;
          const fret = note.fret ?? 0;
          const i = note.string;
          const bw = lane * 0.62, x = lane * (i + 0.5) - bw / 2;
          if (active) held[i] = fret;
          if (fret === 0) {
            ctx.strokeStyle = active ? pal.goldHi : `color-mix(in srgb, ${pal.ink} 50%, transparent)`;
            ctx.lineWidth = 1.8;
            roundRect(ctx, x + 0.9, y0 + 0.9, bw - 1.8, Math.max(2, y1 - y0 - 1.8), 7);
            ctx.stroke();
          } else {
            ctx.fillStyle = active ? pal.goldHi : `color-mix(in srgb, ${pal.gold} 78%, transparent)`;
            roundRect(ctx, x, y0, bw, Math.max(2, y1 - y0), 7);
            ctx.fill();
            if (active) { ctx.save(); ctx.shadowColor = pal.gold; ctx.shadowBlur = 14; ctx.fill(); ctx.restore(); }
          }
          // The big number is the fret. The finger goes in a circle at the top of the block, so the
          // two numbers can never be read as one another.
          if (y1 - y0 > 15 && bw > 14) {
            ctx.fillStyle = fret === 0 ? (active ? pal.goldHi : `color-mix(in srgb, ${pal.ink} 60%, transparent)`) : pal.onAccent;
            ctx.font = `700 ${Math.min(16, bw * 0.55)}px ui-rounded, -apple-system, system-ui, sans-serif`;
            ctx.fillText(String(fret), x + bw / 2, y1 - 12);
            if (y1 - y0 > 40 && note.finger) {
              const cx = x + bw / 2, cy = y0 + 13;
              ctx.fillStyle = pal.ground;
              ctx.beginPath(); ctx.arc(cx, cy, 8.5, 0, Math.PI * 2); ctx.fill();
              ctx.strokeStyle = `color-mix(in srgb, ${pal.ink} 30%, transparent)`;
              ctx.lineWidth = 1;
              ctx.stroke();
              ctx.fillStyle = active ? pal.goldHi : `color-mix(in srgb, ${pal.ink} 72%, transparent)`;
              ctx.font = `600 10px ui-rounded, -apple-system, system-ui, sans-serif`;
              ctx.fillText(String(note.finger), cx, cy);
            }
          }
        }
      } else {
        for (const c of cs) {
          if (c.end < t - 0.1 || c.start > t + la || c.chord === "N") continue;
          const v = inst === "guitar" ? guitarVoicing(c.chord) : ukuleleVoicing(c.chord);
          if (!v) continue;
          const bottom = rollH - (c.start - t) * pps;
          const top = bottom - Math.max(0.2, c.end - c.start - 0.07) * pps;   // a hair of daylight between chords
          if (top > rollH) continue;
          const active = c.start <= t && c.end > t;
          const y0 = Math.min(top, rollH), y1 = Math.min(bottom, rollH);
          for (let i = 0; i < n; i++) {
            const fret = v.frets[i];
            const bw = lane * 0.52, x = lane * (i + 0.5) - bw / 2;
            if (fret === undefined || fret < 0) {                       // muted: a small cross where it lands
              if (y1 - y0 > 6) {
                ctx.strokeStyle = `color-mix(in srgb, ${pal.ink} 26%, transparent)`;
                ctx.lineWidth = 1.6;
                const cx = lane * (i + 0.5), cy = Math.max(y0 + 8, y1 - 10), s = 4;
                ctx.beginPath(); ctx.moveTo(cx - s, cy - s); ctx.lineTo(cx + s, cy + s); ctx.moveTo(cx + s, cy - s); ctx.lineTo(cx - s, cy + s); ctx.stroke();
              }
              continue;
            }
            if (active) held[i] = fret;
            if (fret === 0) {
              ctx.strokeStyle = active ? pal.goldHi : `color-mix(in srgb, ${pal.ink} 45%, transparent)`;
              ctx.lineWidth = 1.6;
              roundRect(ctx, x + 0.8, y0 + 0.8, bw - 1.6, Math.max(2, y1 - y0 - 1.6), 7);
              ctx.stroke();
            } else {
              ctx.fillStyle = active ? pal.goldHi : `color-mix(in srgb, ${pal.gold} 52%, transparent)`;
              roundRect(ctx, x, y0, bw, Math.max(2, y1 - y0), 7);
              ctx.fill();
            }
            if (y1 - y0 > 18 && bw > 16) {
              ctx.fillStyle = fret === 0 ? (active ? pal.goldHi : `color-mix(in srgb, ${pal.ink} 55%, transparent)`) : pal.onAccent;
              ctx.font = `600 ${Math.min(14, bw * 0.5)}px ui-rounded, -apple-system, system-ui, sans-serif`;
              ctx.fillText(String(fret), x + bw / 2, y1 - 11);
            }
          }
          if (y1 - y0 > 30) {                                            // the chord's name, once, on its own pill
            ctx.font = `600 15px ui-rounded, -apple-system, system-ui, sans-serif`;
            const tw = ctx.measureText(c.chord).width + 18;
            ctx.fillStyle = pal.ground;
            roundRect(ctx, w / 2 - tw / 2, y0 + 3, tw, 22, 11);
            ctx.fill();
            ctx.strokeStyle = active ? pal.goldHi : `color-mix(in srgb, ${pal.ink} 22%, transparent)`;
            ctx.lineWidth = 1;
            ctx.stroke();
            ctx.fillStyle = active ? pal.goldHi : `color-mix(in srgb, ${pal.ink} 70%, transparent)`;
            ctx.fillText(c.chord, w / 2, y0 + 15);
          }
        }
      }

      ctx.fillStyle = `color-mix(in srgb, ${pal.gold} 85%, transparent)`;
      ctx.fillRect(0, rollH - 2, w, 2);
      ctx.save(); ctx.shadowColor = pal.gold; ctx.shadowBlur = 16; ctx.fillRect(0, rollH - 2, w, 2); ctx.restore();

      // the nut: string names, and the fret being held right now
      ctx.fillStyle = "#0e0c0a";
      ctx.fillRect(0, rollH, w, nutH);
      ctx.fillStyle = "#efe6d4";
      ctx.fillRect(0, rollH, w, 3);
      for (let i = 0; i < n; i++) {
        const cx = lane * (i + 0.5);
        const f = held[i];
        if (f !== null) {
          ctx.fillStyle = pal.gold;
          ctx.beginPath(); ctx.arc(cx, rollH + 21, 12, 0, Math.PI * 2); ctx.fill();
        }
        ctx.fillStyle = f !== null ? pal.onAccent : `color-mix(in srgb, ${pal.ink} 55%, transparent)`;
        ctx.font = `600 12px ui-rounded, -apple-system, system-ui, sans-serif`;
        ctx.fillText(f !== null ? (f === 0 ? names[i] : String(f)) : names[i], cx, rollH + 22);
      }

      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); obs.disconnect(); mq.removeEventListener("change", resize); };
  }, []);

  return (
    <div ref={wrapRef} className="relative w-full h-full overflow-hidden rounded-[26px]">
      <canvas ref={canvasRef} className="block" />
    </div>
  );
}
