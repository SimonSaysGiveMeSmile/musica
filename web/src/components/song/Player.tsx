"use client";
import { useEffect, useRef, useState } from "react";
import { fmtTime, type Loop } from "@/lib/audio/player";
import { IconLoop, IconMetronome, IconPause, IconPlay } from "@/components/ui/Icons";

type P = {
  playing: boolean; time: number; duration: number; rate: number; loop: Loop | null; metronome: boolean;
  toggle: () => void; seek: (t: number) => void; setRate: (r: number) => void; setLoop: (l: Loop | null) => void; setMetronome: (b: boolean) => void;
};

export function Player({ player, peaks, duration, beats, current, next }: { player: P; peaks?: number[]; duration: number; beats: number[]; current: string | null; next: string | null }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [showSpeed, setShowSpeed] = useState(false);
  const dur = player.duration || duration;

  // waveform
  useEffect(() => {
    const c = canvasRef.current; if (!c || !peaks) return;
    const dpr = window.devicePixelRatio || 1;
    const w = c.clientWidth, h = c.clientHeight;
    c.width = w * dpr; c.height = h * dpr;
    const ctx = c.getContext("2d")!; ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);
    const css = getComputedStyle(document.documentElement);
    const hi = css.getPropertyValue("--gold-hi").trim() || "#e8c77e";
    const ink = css.getPropertyValue("--ivory").trim() || "#f3ede2";
    const mix = (col: string, pct: number) => `color-mix(in srgb, ${col} ${pct}%, transparent)`;
    const n = peaks.length; const bw = w / n;
    const played = dur ? player.time / dur : 0;
    const lp = player.loop;
    for (let i = 0; i < n; i++) {
      const v = Math.min(1, peaks[i] * 1.4);
      const x = i * bw; const bh = Math.max(2, v * h * 0.9);
      const frac = i / n;
      const inLoop = lp && dur ? frac >= lp.a / dur && frac <= lp.b / dur : true;
      ctx.fillStyle = frac <= played ? (inLoop ? hi : mix(hi, 35)) : (inLoop ? mix(ink, 22) : mix(ink, 9));
      ctx.fillRect(x, (h - bh) / 2, Math.max(1, bw - 0.6), bh);
    }
  }, [peaks, player.time, player.loop, dur]);

  const onScrub = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    player.seek(((e.clientX - r.left) / r.width) * dur);
  };

  const setLoopHere = () => {
    if (player.loop) { player.setLoop(null); return; }
    // loop the current 4-beat bar (or 8s) around the playhead
    const t = player.time;
    let i = beats.findIndex((b) => b > t); if (i < 0) i = beats.length - 1;
    const start = beats[Math.max(0, i - 1)] ?? t;
    const end = beats[Math.min(beats.length - 1, i + 7)] ?? Math.min(dur, t + 8);
    player.setLoop({ a: start, b: Math.max(start + 1, end) });
    player.seek(start);
  };

  return (
    <div className="fixed left-1/2 -translate-x-1/2 w-[min(560px,100%)] z-40 px-3 lg:static lg:translate-x-0 lg:w-full lg:px-0" style={{ bottom: "calc(var(--sab) + 10px - var(--ios-bottom-shim))" }}>
      <div className="glass-strong rounded-[34px] p-3 lg:p-4">
        {/* now / next */}
        <div className="flex items-end justify-between px-2 mb-2">
          <div>
            <div className="eyebrow">Now</div>
            <div className="chordname text-[36px] lg:text-[44px] leading-none text-gold-hi min-h-[36px]">{current ?? "—"}</div>
          </div>
          <div className="text-right">
            <div className="eyebrow">Next</div>
            <div className="chordname text-[20px] leading-none label-2 min-h-[20px]">{next ?? "—"}</div>
          </div>
        </div>
        <canvas ref={canvasRef} onPointerDown={onScrub} onPointerMove={(e) => { if (e.buttons) onScrub(e); }} className="w-full h-12 touch-none rounded-lg cursor-pointer" />
        <div className="flex items-center justify-between mt-2 px-1">
          <span className="ios-caption label-2 tabular-nums w-12">{fmtTime(player.time)}</span>
          <div className="flex items-center gap-2">
            <button aria-pressed={!!player.loop} onClick={setLoopHere} className={`press circle-btn ${player.loop ? "gold-fill" : "glass text-ivory"}`} title="Loop this bar"><IconLoop width={18} height={18} /></button>
            <button onClick={player.toggle} aria-label={player.playing ? "Pause" : "Play"} className="press circle-btn !w-16 !h-16 gold-fill">
              {player.playing ? <IconPause width={26} height={26} /> : <IconPlay width={26} height={26} />}
            </button>
            <button aria-pressed={player.metronome} onClick={() => player.setMetronome(!player.metronome)} className={`press circle-btn ${player.metronome ? "gold-fill" : "glass text-ivory"}`} title="Metronome"><IconMetronome width={18} height={18} /></button>
          </div>
          <button onClick={() => setShowSpeed((s) => !s)} className="press ios-caption font-semibold tabular-nums w-12 text-right text-gold">{Math.round(player.rate * 100)}%</button>
        </div>
        {showSpeed && (
          <div className="px-2 pt-1 flex items-center gap-3">
            <span className="ios-caption2 label-2">50%</span>
            <input type="range" min={0.5} max={1} step={0.05} value={player.rate} onChange={(e) => player.setRate(Number(e.target.value))} style={{ ["--fill" as string]: `${((player.rate - 0.5) / 0.5) * 100}%` }} aria-label="Playback speed" />
            <span className="ios-caption2 label-2">100%</span>
          </div>
        )}
      </div>
    </div>
  );
}
