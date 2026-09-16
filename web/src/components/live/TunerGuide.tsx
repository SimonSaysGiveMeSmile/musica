"use client";
import { midiName, splitNote } from "@/lib/audio/tuning";
import type { TuningString } from "@/lib/audio/tuning";

/** Headstock seen from the front. Low strings run to the left pegs, lowest nearest the nut; high strings to the
 *  right pegs, highest nearest the nut — the way a 3+3 (or 2+2) instrument is actually strung. The tuning
 *  buttons, out past the edge of the wood, are the tap targets. */
export function HeadstockGuide({ strings, active, locked, sounding, inTune, onTap, tileLabel }: {
  strings: TuningString[]; active: number | null; locked: number | null; sounding: number | null; inTune: boolean; onTap: (i: number) => void; tileLabel?: (label: string) => string;
}) {
  const n = strings.length, perSide = Math.ceil(n / 2);
  const W = 320, H = 172, cx = 160;
  const nutY = 150, nutW = 66;
  const wood = { left: 86, right: 234, top: 14 };
  const knobW = 48, knobH = 22;
  // silhouette: flares out of the neck, straight flanks, a crowned top with the classic centre dip
  const path = [
    `M ${cx - nutW / 2} ${nutY}`, `L ${wood.left} ${nutY - 44}`, `L ${wood.left} ${wood.top + 16}`,
    `Q ${wood.left} ${wood.top} ${wood.left + 16} ${wood.top}`, `L ${cx - 16} ${wood.top}`, `Q ${cx} ${wood.top + 10} ${cx + 16} ${wood.top}`,
    `L ${wood.right - 16} ${wood.top}`, `Q ${wood.right} ${wood.top} ${wood.right} ${wood.top + 16}`, `L ${wood.right} ${nutY - 44}`, "Z",
  ].join(" ");
  const rowBottom = nutY - 40, rowTop = wood.top + 26;
  const rowY = (k: number) => (perSide === 1 ? (rowBottom + rowTop) / 2 : rowBottom - (k * (rowBottom - rowTop)) / (perSide - 1));
  const pegFor = (i: number) => {
    const left = i < perSide;
    const k = left ? i : perSide - 1 - (i - perSide); // right side counts back down toward the nut
    return { left, y: rowY(k), post: left ? wood.left + 22 : wood.right - 22, knob: left ? 44 : W - 44, edge: left ? wood.left : wood.right };
  };
  const nutX = (i: number) => cx - nutW / 2 + ((i + 0.5) * nutW) / n;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto block select-none" role="group">
      <defs>
        <linearGradient id="hsWood" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="var(--walnut-hi)" />
          <stop offset="0.55" stopColor="var(--walnut-2)" />
          <stop offset="1" stopColor="var(--walnut)" />
        </linearGradient>
        <pattern id="hsGrain" width="5" height="40" patternUnits="userSpaceOnUse" patternTransform="rotate(84)">
          <rect width="1" height="40" fill="rgba(0,0,0,0.16)" />
          <rect x="2.6" width="0.6" height="40" fill="rgba(255,255,255,0.05)" />
        </pattern>
        <linearGradient id="hsBoard" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#1c1512" /><stop offset="0.5" stopColor="#2a201b" /><stop offset="1" stopColor="#1c1512" />
        </linearGradient>
      </defs>

      {/* fretboard stub below the nut, so the strings come from somewhere */}
      <rect x={cx - nutW / 2} y={nutY} width={nutW} height={H - nutY} fill="url(#hsBoard)" />
      {/* the wood: a cheap shadow, the face, the grain, an edge highlight */}
      <path d={path} transform="translate(0 2)" fill="rgba(0,0,0,0.35)" />
      <path d={path} fill="url(#hsWood)" />
      <path d={path} fill="url(#hsGrain)" opacity={0.8} />
      <path d={path} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth={1} />
      {/* the nut */}
      <rect x={cx - nutW / 2 - 2} y={nutY - 3} width={nutW + 4} height={6} rx={2} fill="#efe6d4" />

      {/* strings, posts, shafts (under the buttons) */}
      {strings.map((s, i) => {
        const p = pegFor(i);
        const hot = active === i || sounding === s.midi;
        const gold = (active === i && inTune) || sounding === s.midi;
        const stroke = hot ? "var(--gold)" : "var(--ivory)";
        const width = hot ? 2.2 : 0.8 + (n - 1 - i) * 0.16;
        return (
          <g key={s.label}>
            <line x1={nutX(i)} y1={H} x2={nutX(i)} y2={nutY} stroke={stroke} strokeOpacity={hot ? 0.9 : 0.4} strokeWidth={width} />
            <line x1={nutX(i)} y1={nutY} x2={p.post} y2={p.y} stroke={stroke} strokeOpacity={hot ? 1 : 0.4} strokeWidth={width} strokeLinecap="round"
              style={{ filter: gold ? "drop-shadow(0 0 5px color-mix(in srgb, var(--gold) 70%, transparent))" : "none" }} />
            <circle cx={p.post} cy={p.y} r={4.2} fill={hot ? "var(--gold)" : "#d9cfbb"} stroke="rgba(0,0,0,0.45)" strokeWidth={0.8} />
            <line x1={p.edge} y1={p.y} x2={p.knob} y2={p.y} stroke="#b9ae99" strokeWidth={3.5} strokeLinecap="round" />
          </g>
        );
      })}

      {/* tuning buttons: the controls */}
      {strings.map((s, i) => {
        const p = pegFor(i);
        const isLocked = locked === i, hot = active === i || sounding === s.midi;
        const note = splitNote(s.label);
        return (
          <g key={s.label} onClick={() => onTap(i)} className="cursor-pointer" role="button" tabIndex={0}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onTap(i); } }}
            aria-pressed={isLocked} aria-label={tileLabel ? tileLabel(s.label) : s.label}>
            <circle cx={p.knob} cy={p.y} r={26} fill="transparent" />
            {isLocked && <rect x={p.knob - knobW / 2 - 4} y={p.y - knobH / 2 - 4} width={knobW + 8} height={knobH + 8} rx={(knobH + 8) / 2} fill="none" stroke="var(--gold)" strokeWidth={1.5} opacity={0.9} />}
            {/* the tuning button, with its note engraved on it */}
            <rect x={p.knob - knobW / 2} y={p.y - knobH / 2} width={knobW} height={knobH} rx={knobH / 2} fill={hot ? "var(--gold)" : "var(--lacquer-3)"} stroke={hot ? "transparent" : "var(--separator)"} strokeWidth={1}
              style={{ filter: hot ? "drop-shadow(0 0 7px color-mix(in srgb, var(--gold) 55%, transparent))" : "none", transition: "fill 160ms" }} />
            <rect x={p.knob - knobW / 2 + 1} y={p.y - knobH / 2 + 1} width={knobW - 2} height={knobH / 2} rx={knobH / 2 - 1} fill="rgba(255,255,255,0.07)" style={{ pointerEvents: "none" }} />
            <text x={p.knob} y={p.y + 5} textAnchor="middle" fontSize={14} fontWeight={600} fill={hot ? "var(--on-accent)" : "var(--ivory)"} fontFamily="var(--font-sf-rounded)" style={{ pointerEvents: "none", transition: "fill 160ms" }}>
              {note.letter}{note.accidental && <tspan fontSize={10} dy={-4}>{note.accidental}</tspan>}<tspan fontSize={9.5} opacity={0.7} dy={note.accidental ? 7 : 3}>{note.octave}</tspan>
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/** Two octaves of keys, felt strip and all. Every key plays its reference tone; the detected key lights up. */
export function KeyboardGuide({ activeMidi, sounding, inTune, onTap }: { activeMidi: number | null; sounding: number | null; inTune: boolean; onTap: (midi: number) => void }) {
  // window follows the detected note, defaulting to C3..B4
  const base = activeMidi !== null ? Math.max(24, Math.min(96, Math.floor(activeMidi / 12) * 12 - 12)) : 48;
  const whites: number[] = [], blacks: number[] = [];
  for (let m = base; m < base + 24; m++) ([1, 3, 6, 8, 10].includes(m % 12) ? blacks : whites).push(m);
  const W = 320, pad = 6, ww = (W - pad * 2) / whites.length, top = 12, H = 98, bw = ww * 0.6, bh = H * 0.62;
  const whiteX = (m: number) => pad + whites.indexOf(m) * ww;
  const blackX = (m: number) => { let i = 0; for (const w of whites) { if (w > m) break; i++; } return pad + i * ww - bw / 2; };
  const state = (m: number) => (m === sounding ? "gold" : m === activeMidi ? (inTune ? "gold" : "warm") : null);
  return (
    <svg viewBox={`0 0 ${W} ${top + H + pad}`} className="w-full h-auto block select-none" role="group">
      <defs>
        <linearGradient id="kbWhite" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#e8dfcd" /><stop offset="0.12" stopColor="#f6f0e4" /><stop offset="1" stopColor="#ebe3d3" /></linearGradient>
        <linearGradient id="kbBlack" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#3a332d" /><stop offset="0.1" stopColor="#1d1916" /><stop offset="1" stopColor="#090807" /></linearGradient>
        <linearGradient id="kbGold" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="var(--gold-hi)" /><stop offset="1" stopColor="var(--gold)" /></linearGradient>
      </defs>
      <rect x={0} y={0} width={W} height={top + H + pad} rx={12} fill="#0e0c0a" />
      {/* the felt strip above the keys */}
      <rect x={pad} y={top - 5} width={W - pad * 2} height={3} fill="var(--felt)" />
      {whites.map((m) => {
        const st = state(m);
        return (
          <g key={m} onClick={() => onTap(m)} className="cursor-pointer" role="button" aria-label={midiName(m)}>
            <rect x={whiteX(m) + 0.7} y={top} width={ww - 1.4} height={H} rx={3} fill={st === "gold" ? "url(#kbGold)" : st === "warm" ? "var(--gold-lo)" : "url(#kbWhite)"} stroke="rgba(0,0,0,0.55)" strokeWidth={0.7} style={{ transition: "fill 120ms" }} />
            {m % 12 === 0 && <text x={whiteX(m) + ww / 2} y={top + H - 6} textAnchor="middle" fontSize={7.5} fontWeight={600} fill={st ? "var(--on-accent)" : "rgba(0,0,0,0.45)"} fontFamily="var(--font-sf-rounded)">{midiName(m)}</text>}
          </g>
        );
      })}
      {/* fallboard shadow across the top of the keys */}
      <rect x={pad} y={top} width={W - pad * 2} height={7} fill="rgba(0,0,0,0.22)" style={{ pointerEvents: "none" }} />
      {blacks.map((m) => {
        const st = state(m);
        return (
          <g key={m} onClick={() => onTap(m)} className="cursor-pointer" role="button" aria-label={midiName(m)}>
            <rect x={blackX(m)} y={top} width={bw} height={bh} rx={2.5} fill={st === "gold" ? "url(#kbGold)" : st === "warm" ? "var(--gold-lo)" : "url(#kbBlack)"} stroke="rgba(0,0,0,0.9)" strokeWidth={0.8} style={{ transition: "fill 120ms" }} />
            {!st && <rect x={blackX(m) + 2} y={top + bh - 8} width={bw - 4} height={3} rx={1.5} fill="rgba(255,255,255,0.05)" />}
          </g>
        );
      })}
    </svg>
  );
}
