"use client";
import { useEffect, useRef, useState } from "react";
import { fmtTime, type Loop } from "@/lib/audio/player";
import { IconLoop, IconMetronome, IconPause, IconPlay } from "@/components/ui/Icons";
import { GrabHandle, useRetracted } from "@/components/ui/Retract";
import { useT } from "@/lib/i18n";

type P = {
  playing: boolean; time: number; duration: number; rate: number; loop: Loop | null; metronome: boolean;
  toggle: () => void; seek: (t: number) => void; setRate: (r: number) => void; setLoop: (l: Loop | null) => void; setMetronome: (b: boolean) => void;
};

export function Player({ player, peaks, duration, beats, current, next }: { player: P; peaks?: number[]; duration: number; beats: number[]; current: string | null; next: string | null }) {
  const { t } = useT();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const [showSpeed, setShowSpeed] = useState(false);
  const [collapsed, setCollapsed] = useRetracted();
  const dur = player.duration || duration;
  const played = dur ? Math.min(100, (player.time / dur) * 100) : 0;

  // the sheet behind reserves exactly the height this card takes, whatever state it is in
  useEffect(() => {
    const el = cardRef.current;
    if (!el) return;
    const root = document.documentElement;
    const ro = new ResizeObserver(() => root.style.setProperty("--player-h", `${Math.round(el.getBoundingClientRect().height)}px`));
    ro.observe(el);
    return () => { ro.disconnect(); root.style.removeProperty("--player-h"); };
  }, []);

  // waveform
  useEffect(() => {
    const c = canvasRef.current; if (!c || !peaks || collapsed) return;
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
  }, [peaks, player.time, player.loop, dur, collapsed]);

  const onScrub = (e: React.PointerEvent<HTMLElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    player.seek(Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * dur);
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
    <div className="fixed left-1/2 -translate-x-1/2 w-[min(560px,100%)] z-40 px-3 lg:static lg:translate-x-0 lg:w-full lg:px-0" style={{ bottom: "calc(var(--sab) + 10px)" }}>
      <div ref={cardRef} className={`glass-strong rounded-[34px] px-3 lg:px-4 relative overflow-hidden ${collapsed ? "pt-3 pb-2" : "pt-1.5 pb-3 lg:pb-4"}`}>
        {/* collapsed, the progress runs along the card's own top edge instead of taking a row,
            with a finger-sized strip over it so you can still scrub without opening the player */}
        {collapsed && (
          <div onPointerDown={onScrub} onPointerMove={(e) => { if (e.buttons) onScrub(e); }}
            className="absolute inset-x-0 top-0 h-3 touch-none cursor-pointer" aria-label={t("player.seek")} role="slider"
            aria-valuemin={0} aria-valuemax={Math.round(dur)} aria-valuenow={Math.round(player.time)}>
            <div className="h-[3px] tint-2">
              <div className="h-full" style={{ width: `${played}%`, background: "var(--gold)" }} />
            </div>
          </div>
        )}
        <GrabHandle collapsed={collapsed} onChange={setCollapsed} label={collapsed ? t("player.expand") : t("player.collapse")} />
        {collapsed ? (
          <div className="flex items-center gap-3">
            <button onClick={player.toggle} aria-label={player.playing ? t("player.pause") : t("player.play")} className="press circle-btn !w-11 !h-11 gold-fill shrink-0">
              {player.playing ? <IconPause width={19} height={19} /> : <IconPlay width={19} height={19} />}
            </button>
            <button onClick={() => setCollapsed(false)} aria-label={t("player.expand")} className="press flex-1 min-w-0 flex items-baseline gap-2 text-left">
              {current ? (
                <>
                  <span className="chordname text-[26px] leading-none text-gold-hi shrink-0">{current}</span>
                  {next && <span className="chordname ios-footnote label-3 truncate">→ {next}</span>}
                </>
              ) : (
                <span className="chordname text-[22px] leading-none label-2 truncate">{next ? `→ ${next}` : t("player.now")}</span>
              )}
            </button>
            <span className="ios-caption label-2 tabular-nums shrink-0">{fmtTime(player.time)}</span>
          </div>
        ) : (
          <>
            {/* now / next */}
            <div className="flex items-end justify-between px-2 mb-2">
              <div>
                <div className="eyebrow">{t("player.now")}</div>
                <div className="chordname text-[36px] lg:text-[44px] leading-none text-gold-hi min-h-[36px]">{current ?? "—"}</div>
              </div>
              <div className="text-right">
                <div className="eyebrow">{t("player.next")}</div>
                <div className="chordname text-[20px] leading-none label-2 min-h-[20px]">{next ?? "—"}</div>
              </div>
            </div>
            <canvas ref={canvasRef} onPointerDown={onScrub} onPointerMove={(e) => { if (e.buttons) onScrub(e); }} className="w-full h-12 touch-none rounded-lg cursor-pointer" />
            <div className="flex items-center justify-between mt-2 px-1">
              <span className="ios-caption label-2 tabular-nums w-12">{fmtTime(player.time)}</span>
              <div className="flex items-center gap-2">
                <button aria-pressed={!!player.loop} onClick={setLoopHere} className={`press circle-btn ${player.loop ? "gold-fill" : "glass text-ivory"}`} title={t("player.loop")} aria-label={t("player.loop")}><IconLoop width={18} height={18} /></button>
                <button onClick={player.toggle} aria-label={player.playing ? t("player.pause") : t("player.play")} className="press circle-btn !w-16 !h-16 gold-fill">
                  {player.playing ? <IconPause width={26} height={26} /> : <IconPlay width={26} height={26} />}
                </button>
                <button aria-pressed={player.metronome} onClick={() => player.setMetronome(!player.metronome)} className={`press circle-btn ${player.metronome ? "gold-fill" : "glass text-ivory"}`} title={t("player.metronome")} aria-label={t("player.metronome")}><IconMetronome width={18} height={18} /></button>
              </div>
              <button onClick={() => setShowSpeed((s) => !s)} className="press ios-caption font-semibold tabular-nums w-12 text-right text-gold">{Math.round(player.rate * 100)}%</button>
            </div>
            {showSpeed && (
              <div className="px-2 pt-1 flex items-center gap-3">
                <span className="ios-caption2 label-2">50%</span>
                <input type="range" min={0.5} max={1} step={0.05} value={player.rate} onChange={(e) => player.setRate(Number(e.target.value))} style={{ ["--fill" as string]: `${((player.rate - 0.5) / 0.5) * 100}%` }} aria-label={t("player.speed")} />
                <span className="ios-caption2 label-2">100%</span>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
