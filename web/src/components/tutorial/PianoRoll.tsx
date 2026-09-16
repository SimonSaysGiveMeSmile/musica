"use client";
/** Notes falling onto a keyboard. The right hand is the accent colour, the left hand ivory;
 *  each block carries the finger to use. Drawn on a canvas at screen refresh rate from the
 *  transport's own clock, so nothing waits on React. */
import { useCallback, useEffect, useRef } from "react";
import type { Hand, TutorialNote } from "@/lib/tutorial/types";

const WHITE_PC = [0, 2, 4, 5, 7, 9, 11];
const isWhite = (m: number) => WHITE_PC.includes(((m % 12) + 12) % 12);
const whitesBelow = (midi: number, low: number) => { let n = 0; for (let m = low; m < midi; m++) if (isWhite(m)) n++; return n; };

/** The stretch of keyboard worth drawing: whole octaves around the notes, never more than five. */
export function keyRange(notes: TutorialNote[]): { low: number; high: number } {
  if (!notes.length) return { low: 48, high: 84 };
  let lo = Infinity, hi = -Infinity;
  for (const n of notes) { if (n.midi < lo) lo = n.midi; if (n.midi > hi) hi = n.midi; }
  lo = Math.floor(lo / 12) * 12;
  hi = Math.ceil((hi + 1) / 12) * 12 - 1;
  if (hi - lo > 60) { const mid = Math.round((lo + hi) / 2 / 12) * 12; lo = mid - 24; hi = mid + 35; }
  return { low: Math.max(21, lo), high: Math.min(108, hi) };
}

interface Palette { gold: string; goldHi: string; ink: string; ground: string; ground2: string; line: string; onAccent: string; faint: string }
function palette(el: HTMLElement): Palette {
  const css = getComputedStyle(el);
  const v = (name: string, fallback: string) => css.getPropertyValue(name).trim() || fallback;
  return {
    gold: v("--gold", "#c9a45c"), goldHi: v("--gold-hi", "#e8c77e"), ink: v("--ivory", "#f3ede2"),
    ground: v("--lacquer", "#0b0a09"), ground2: v("--lacquer-2", "#151311"),
    line: v("--separator", "rgba(255,255,255,0.14)"), onAccent: v("--on-accent", "#1a1408"),
    faint: v("--label-3", "rgba(255,255,255,0.46)"),
  };
}

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

export interface PianoRollProps {
  notes: TutorialNote[];
  /** Reads the playhead every frame. */
  getTime: () => number;
  lookahead: number;
  hands: "both" | Hand;
  sections: number[];
  beats?: number[];
  onKey?: (midi: number) => void;
}

export function PianoRoll({ notes, getTime, lookahead, hands, sections, beats, onKey }: PianoRollProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef({ notes, lookahead, hands, sections, beats, getTime });
  const geomRef = useRef({ low: 48, high: 84, ww: 10, keysY: 0, w: 0, h: 0 });

  const midiAt = useCallback((clientX: number, clientY: number) => {
    const c = canvasRef.current; if (!c) return null;
    const r = c.getBoundingClientRect();
    const { low, high, ww, keysY, h } = geomRef.current;
    const y = clientY - r.top;
    if (y < keysY || y > h) return null;
    const x = clientX - r.left;
    const blackH = (h - keysY) * 0.62;
    if (y - keysY < blackH) {                        // black keys sit on top, so test them first
      for (let m = low; m <= high; m++) {
        if (isWhite(m)) continue;
        const bx = whitesBelow(m, low) * ww - ww * 0.3;
        if (x >= bx && x <= bx + ww * 0.6) return m;
      }
    }
    const idx = Math.floor(x / ww);
    let n = 0;
    for (let m = low; m <= high; m++) { if (!isWhite(m)) continue; if (n === idx) return m; n++; }
    return null;
  }, []);

  // the draw loop reads the latest props from here rather than restarting on every render
  useEffect(() => { stateRef.current = { notes, lookahead, hands, sections, beats, getTime }; });

  useEffect(() => {
    const wrap = wrapRef.current, canvas = canvasRef.current;
    if (!wrap || !canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let pal = palette(wrap);
    let raf = 0;

    const resize = () => {
      const dpr = Math.min(2.5, window.devicePixelRatio || 1);
      const w = wrap.clientWidth, h = wrap.clientHeight;
      canvas.width = Math.max(1, Math.round(w * dpr));
      canvas.height = Math.max(1, Math.round(h * dpr));
      canvas.style.width = `${w}px`; canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      pal = palette(wrap);
      const { low, high } = keyRange(stateRef.current.notes);
      let whites = 0;
      for (let m = low; m <= high; m++) if (isWhite(m)) whites++;
      const keyH = Math.max(64, Math.min(112, h * 0.24));
      geomRef.current = { low, high, ww: w / Math.max(1, whites), keysY: h - keyH, w, h };
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    mq.addEventListener("change", resize);
    const obs = new MutationObserver(resize);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "data-accent"] });

    const draw = () => {
      const { notes: ns, lookahead: la, hands: hd, sections: secs, beats: bts, getTime: clock } = stateRef.current;
      const { low, high, ww, keysY, w, h } = geomRef.current;
      const t = clock();
      const pps = keysY / Math.max(0.5, la);
      const keyH = h - keysY;

      const bg = ctx.createLinearGradient(0, 0, 0, keysY);
      bg.addColorStop(0, pal.ground);
      bg.addColorStop(1, pal.ground2);
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, w, keysY);

      // darker lanes behind the black keys, so a note reads against the key it belongs to
      ctx.fillStyle = `color-mix(in srgb, ${pal.ground} 55%, transparent)`;
      for (let m = low; m <= high; m++) {
        if (isWhite(m)) continue;
        ctx.fillRect(whitesBelow(m, low) * ww - ww * 0.3, 0, ww * 0.6, keysY);
      }

      // bars, then sections on top of them
      ctx.lineWidth = 1;
      if (bts) {
        ctx.strokeStyle = `color-mix(in srgb, ${pal.ink} 7%, transparent)`;
        ctx.beginPath();
        for (const b of bts) {
          if (b < t || b > t + la) continue;
          const y = Math.round(keysY - (b - t) * pps) + 0.5;
          ctx.moveTo(0, y); ctx.lineTo(w, y);
        }
        ctx.stroke();
      }
      ctx.strokeStyle = `color-mix(in srgb, ${pal.gold} 30%, transparent)`;
      ctx.beginPath();
      for (const s of secs) {
        if (s < t || s > t + la) continue;
        const y = Math.round(keysY - (s - t) * pps) + 0.5;
        ctx.moveTo(0, y); ctx.lineTo(w, y);
      }
      ctx.stroke();

      // the notes
      const lit = new Map<number, Hand>();
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      for (const n of ns) {
        if (hd !== "both" && n.hand !== hd) continue;
        if (n.end < t - 0.1 || n.start > t + la) continue;
        const bottom = keysY - (n.start - t) * pps;
        const top = bottom - Math.max(0.06, n.end - n.start) * pps;
        if (top > keysY) continue;
        const white = isWhite(n.midi);
        const x = white ? whitesBelow(n.midi, low) * ww : whitesBelow(n.midi, low) * ww - ww * 0.3;
        const nw = white ? ww : ww * 0.6;
        const active = n.start <= t && n.end > t;
        if (active) lit.set(n.midi, n.hand);
        const base = n.hand === "r" ? pal.gold : pal.ink;
        const y0 = Math.min(top, keysY), y1 = Math.min(bottom, keysY);
        if (y1 - y0 < 0.5) continue;
        ctx.fillStyle = active
          ? (n.hand === "r" ? pal.goldHi : pal.ink)
          : `color-mix(in srgb, ${base} ${n.hand === "r" ? 88 : 62}%, transparent)`;
        roundRect(ctx, x + 1.2, y0, Math.max(2, nw - 2.4), y1 - y0, 5);
        ctx.fill();
        if (active) {
          ctx.save();
          ctx.shadowColor = n.hand === "r" ? pal.gold : pal.ink;
          ctx.shadowBlur = 14;
          ctx.fill();
          ctx.restore();
        }
        // a line along the top edge reads as the moment the key goes down
        ctx.fillStyle = `color-mix(in srgb, ${pal.ink} 40%, transparent)`;
        roundRect(ctx, x + 1.2, y0, Math.max(2, nw - 2.4), Math.min(2.5, y1 - y0), 1.2);
        ctx.fill();
        // the finger number, as large as the key allows — on a phone the keys are only ~13px wide
        if (y1 - y0 > 14 && nw > 9) {
          ctx.fillStyle = n.hand === "r" ? pal.onAccent : pal.ground;
          ctx.font = `700 ${Math.max(9, Math.min(13, nw * 0.82))}px ui-rounded, -apple-system, system-ui, sans-serif`;
          ctx.fillText(String(n.finger), x + nw / 2, y1 - 9);
        }
      }

      // the line the notes land on
      ctx.fillStyle = `color-mix(in srgb, ${pal.gold} 85%, transparent)`;
      ctx.fillRect(0, keysY - 2, w, 2);
      ctx.save();
      ctx.shadowColor = pal.gold; ctx.shadowBlur = 16;
      ctx.fillRect(0, keysY - 2, w, 2);
      ctx.restore();

      // the keyboard
      ctx.fillStyle = "#0e0c0a";
      ctx.fillRect(0, keysY, w, keyH);
      for (let m = low; m <= high; m++) {
        if (!isWhite(m)) continue;
        const x = whitesBelow(m, low) * ww;
        const on = lit.get(m);
        ctx.fillStyle = on ? (on === "r" ? pal.goldHi : `color-mix(in srgb, ${pal.gold} 45%, #efe7d8)`) : "#efe7d8";
        roundRect(ctx, x + 0.7, keysY + 3, ww - 1.4, keyH - 5, 3);
        ctx.fill();
        if (m % 12 === 0 && ww > 15) {
          ctx.fillStyle = "rgba(0,0,0,0.45)";
          ctx.font = `600 8px ui-rounded, -apple-system, system-ui, sans-serif`;
          ctx.fillText(`C${Math.floor(m / 12) - 1}`, x + ww / 2, keysY + keyH - 10);
        }
      }
      const blackH = keyH * 0.62;
      for (let m = low; m <= high; m++) {
        if (isWhite(m)) continue;
        const x = whitesBelow(m, low) * ww - ww * 0.3;
        const on = lit.get(m);
        ctx.fillStyle = on ? (on === "r" ? pal.goldHi : `color-mix(in srgb, ${pal.gold} 45%, #2a2420)`) : "#15120f";
        roundRect(ctx, x, keysY + 3, ww * 0.6, blackH, 2.5);
        ctx.fill();
      }

      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); obs.disconnect(); mq.removeEventListener("change", resize); };
  }, []);

  return (
    <div ref={wrapRef} className="relative w-full h-full overflow-hidden rounded-[26px]">
      <canvas
        ref={canvasRef}
        className="block touch-manipulation"
        onPointerDown={(e) => { const m = midiAt(e.clientX, e.clientY); if (m !== null) onKey?.(m); }}
      />
    </div>
  );
}
