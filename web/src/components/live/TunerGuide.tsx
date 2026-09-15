"use client";
import { midiName, splitNote } from "@/lib/audio/tuning";
import type { TuningString } from "@/lib/audio/tuning";

/** Headstock with tappable tuning pegs. 3+3 for guitar, 2+2 for ukulele: the left pegs carry the low
 *  strings from the nut upward, the right pegs the high strings, as on the instrument. */
export function HeadstockGuide({ strings, active, locked, sounding, inTune, onTap, tileLabel }: {
  strings: TuningString[]; active: number | null; locked: number | null; sounding: number | null; inTune: boolean; onTap: (i: number) => void; tileLabel?: (label: string) => string;
}) {
  const n = strings.length, perSide = Math.ceil(n / 2);
  const W = 320, H = 150;
  const nutY = 136, nutX0 = 112, nutX1 = 208;
  const topY = 14;
  const pegLX = 52, pegRX = 268;
  // headstock silhouette: narrow at the nut, wider toward the top, gently crowned
  const path = `M ${nutX0} ${nutY} L 82 ${topY + 16} Q 82 ${topY} 98 ${topY} L 222 ${topY} Q 238 ${topY} 238 ${topY + 16} L ${nutX1} ${nutY} Z`;
  const pegY = (k: number) => nutY - 22 - (k * (nutY - 22 - topY - 22)) / Math.max(1, perSide - 1);
  const pegFor = (i: number) => (i < perSide ? { x: pegLX, y: pegY(i), side: "L" as const } : { x: pegRX, y: pegY(i - perSide), side: "R" as const });
  const nutX = (i: number) => nutX0 + ((i + 0.5) * (nutX1 - nutX0)) / n;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto block select-none" role="group">
      <path d={path} fill="var(--walnut)" opacity={0.9} />
      <path d={path} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={1} />
      <rect x={nutX0 - 2} y={nutY - 3} width={nutX1 - nutX0 + 4} height={6} rx={2} fill="#efe7d8" />
      {strings.map((s, i) => {
        const p = pegFor(i);
        const isActive = active === i;
        const hot = isActive || sounding === s.midi;
        const gold = (isActive && inTune) || sounding === s.midi;
        // string: nut slot -> post (just inside the peg)
        const postX = p.side === "L" ? p.x + 16 : p.x - 16;
        return (
          <g key={s.label}>
            <line x1={nutX(i)} y1={nutY} x2={postX} y2={p.y} stroke={hot ? "var(--gold)" : "var(--ivory)"} strokeOpacity={hot ? 1 : 0.32} strokeWidth={hot ? 2.2 : 0.9 + (n - i) * 0.12} strokeLinecap="round"
              style={{ filter: gold ? "drop-shadow(0 0 5px color-mix(in srgb, var(--gold) 70%, transparent))" : "none" }} />
            <circle cx={postX} cy={p.y} r={3} fill="#e6dcc6" />
          </g>
        );
      })}
      {strings.map((s, i) => {
        const p = pegFor(i);
        const isActive = active === i, isLocked = locked === i, hot = isActive || sounding === s.midi;
        const labelX = p.side === "L" ? p.x - 26 : p.x + 26;
        return (
          <g key={s.label} onClick={() => onTap(i)} className="cursor-pointer" role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onTap(i); } }} aria-pressed={isLocked} aria-label={tileLabel ? tileLabel(s.label) : s.label}>
            {/* generous invisible hit area */}
            <circle cx={p.x} cy={p.y} r={24} fill="transparent" />
            {/* peg button: a lacquered knob, gold when it is the string in play */}
            <circle cx={p.x} cy={p.y} r={14} fill={hot ? "var(--gold)" : "var(--lacquer-3)"} stroke={isLocked ? "var(--gold)" : "rgba(255,255,255,0.14)"} strokeWidth={isLocked ? 2 : 1} />
            <circle cx={p.x} cy={p.y} r={5} fill={hot ? "var(--on-accent)" : "var(--ivory-3)"} opacity={0.9} />
            <text x={labelX} y={p.y + 5} textAnchor="middle" fontSize={14} fontWeight={600} fill={hot ? "var(--gold)" : "var(--ivory)"} fontFamily="var(--font-sf-rounded)" style={{ pointerEvents: "none" }}>
              {splitNote(s.label).letter}<tspan fontSize={10} dy={-4}>{splitNote(s.label).accidental}</tspan><tspan fontSize={9} fill="var(--label-2)" dy={5}>{splitNote(s.label).octave}</tspan>
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/** Two-octave keyboard where every key plays its reference tone; the detected key lights up. */
export function KeyboardGuide({ activeMidi, sounding, inTune, onTap }: { activeMidi: number | null; sounding: number | null; inTune: boolean; onTap: (midi: number) => void }) {
  // window follows the detected note, defaulting to C3..B4
  const base = activeMidi !== null ? Math.max(24, Math.min(96, Math.floor(activeMidi / 12) * 12 - 12)) : 48;
  const whites: number[] = [], blacks: number[] = [];
  for (let m = base; m < base + 24; m++) ([1, 3, 6, 8, 10].includes(m % 12) ? blacks : whites).push(m);
  const W = 320, ww = W / whites.length, H = 96, bw = ww * 0.62, bh = H * 0.6;
  const whiteX = (m: number) => whites.indexOf(m) * ww;
  const blackX = (m: number) => { let i = 0; for (const w of whites) { if (w > m) break; i++; } return i * ww - bw / 2; };
  const fill = (m: number, off: string) => (m === sounding ? "var(--gold)" : m === activeMidi ? (inTune ? "var(--gold)" : "var(--gold-lo)") : off);
  return (
    <svg viewBox={`0 0 ${W} ${H + 10}`} className="w-full h-auto block select-none" role="group">
      <rect x={0} y={0} width={W} height={H + 10} rx={8} fill="#0a0908" />
      {whites.map((m) => (
        <g key={m} onClick={() => onTap(m)} className="cursor-pointer" role="button" aria-label={midiName(m)}>
          <rect x={whiteX(m) + 0.6} y={5} width={ww - 1.2} height={H} rx={3} fill={fill(m, "#efe7d8")} stroke="rgba(0,0,0,0.6)" strokeWidth={0.6} />
          {m % 12 === 0 && <text x={whiteX(m) + ww / 2} y={H - 3} textAnchor="middle" fontSize={7} fill="rgba(0,0,0,0.5)" fontFamily="var(--font-sf)">{midiName(m)}</text>}
        </g>
      ))}
      {blacks.map((m) => (
        <rect key={m} onClick={() => onTap(m)} className="cursor-pointer" role="button" aria-label={midiName(m)} x={blackX(m)} y={5} width={bw} height={bh} rx={2} fill={fill(m, "#141210")} stroke="rgba(0,0,0,0.9)" strokeWidth={0.8} />
      ))}
    </svg>
  );
}
