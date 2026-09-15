import type { Voicing } from "@/lib/theory/voicings";

/** Generic fret diagram for 6-string guitar or 4-string ukulele. */
export function FretDiagram({ voicing, strings, size = 96, label }: { voicing: Voicing | null; strings: 6 | 4; size?: number; label?: string }) {
  const W = size, H = size * 1.2;
  const padX = W * 0.14, padTop = H * 0.2, padBot = H * 0.08;
  const gw = W - padX * 2, gh = H - padTop - padBot;
  const nFrets = 4;
  const sx = (i: number) => padX + (gw * i) / (strings - 1);
  const fy = (f: number) => padTop + (gh * f) / nFrets;
  if (!voicing) {
    return (
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="text-ivory">
        <text x={W / 2} y={H / 2} textAnchor="middle" fill="currentColor" opacity={0.5} fontSize={12}>no shape</text>
      </svg>
    );
  }
  const base = voicing.baseFret;
  const nut = base === 1;
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="text-ivory" role="img" aria-label={label ? `${label} chord diagram` : "chord diagram"}>
      {/* board */}
      <rect x={padX - 4} y={padTop - 2} width={gw + 8} height={gh + 4} rx={6} fill="rgba(74,50,34,0.72)" />
      {[...Array(nFrets + 1)].map((_, f) => (
        <line key={f} x1={padX} x2={padX + gw} y1={fy(f)} y2={fy(f)} stroke={nut && f === 0 ? "#f3ede2" : "rgba(243,237,226,0.4)"} strokeWidth={nut && f === 0 ? 4 : 1.2} strokeLinecap="round" />
      ))}
      {[...Array(strings)].map((_, s) => (
        <line key={s} x1={sx(s)} x2={sx(s)} y1={fy(0)} y2={fy(nFrets)} stroke="var(--gold-hi)" strokeOpacity={0.75} strokeWidth={0.8 + (strings - s) * 0.18} />
      ))}
      {!nut && <text x={padX - 8} y={fy(0.5) + 4} textAnchor="end" fontSize={11} fill="currentColor" opacity={0.8} fontWeight={600}>{base}</text>}
      {/* barre */}
      {voicing.barre && (
        <rect x={sx(voicing.barre.from) - 7} y={fy(voicing.barre.fret - base + 0.5) - 7} width={sx(voicing.barre.to) - sx(voicing.barre.from) + 14} height={14} rx={7} fill="var(--gold)" opacity={0.95} />
      )}
      {voicing.frets.map((f, s) => {
        if (f < 0) return <text key={s} x={sx(s)} y={padTop - 7} textAnchor="middle" fontSize={11} fill="currentColor" opacity={0.6}>×</text>;
        if (f === 0) return <circle key={s} cx={sx(s)} cy={padTop - 10} r={3.5} fill="none" stroke="currentColor" strokeWidth={1.4} opacity={0.85} />;
        const rel = f - base + 1;
        if (voicing.barre && f === voicing.barre.fret && s >= voicing.barre.from && s <= voicing.barre.to) return null;
        const finger = voicing.fingers?.[s];
        return (
          <g key={s}>
            <circle cx={sx(s)} cy={fy(rel - 0.5)} r={7} fill="var(--gold-hi)" stroke="rgba(0,0,0,0.5)" strokeWidth={1} />
            {finger ? <text x={sx(s)} y={fy(rel - 0.5) + 3.5} textAnchor="middle" fontSize={9} fontWeight={700} fill="var(--on-accent)">{finger}</text> : null}
          </g>
        );
      })}
    </svg>
  );
}
