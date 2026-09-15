import { chordMidiNotes, parseChord } from "@/lib/theory/chords";

/** Two-octave keyboard (C3..B4) highlighting the chord. */
export function PianoDiagram({ symbol, width = 200 }: { symbol: string; width?: number }) {
  const c = parseChord(symbol);
  const notes = new Set(c ? chordMidiNotes(c).map((n) => (n < 48 ? n + 12 : n > 71 ? n - 12 : n)) : []);
  const root = c ? 60 + c.root : -1;
  const whites: number[] = [], blacks: number[] = [];
  for (let m = 48; m <= 71; m++) ([1, 3, 6, 8, 10].includes(m % 12) ? blacks : whites).push(m);
  const ww = width / whites.length, H = width * 0.36, bw = ww * 0.62, bh = H * 0.62;
  const whiteX = (m: number) => whites.indexOf(m) * ww;
  const blackX = (m: number) => { let i = 0; for (const w of whites) { if (w > m) break; i++; } return i * ww - bw / 2; };
  return (
    <svg width={width} height={H + 8} viewBox={`0 0 ${width} ${H + 8}`} role="img" aria-label={`${symbol} on piano`}>
      <rect x={0} y={0} width={width} height={H + 8} rx={6} fill="#0a0908" />
      {whites.map((m) => {
        const on = notes.has(m);
        return <rect key={m} x={whiteX(m) + 0.6} y={4} width={ww - 1.2} height={H} rx={2.5}
          fill={on ? (m === root ? "var(--gold-hi)" : "var(--gold)") : "#efe7d8"} stroke="rgba(0,0,0,0.6)" strokeWidth={0.6} />;
      })}
      {blacks.map((m) => {
        const on = notes.has(m);
        return <rect key={m} x={blackX(m)} y={4} width={bw} height={bh} rx={2}
          fill={on ? (m === root ? "var(--gold-hi)" : "var(--gold)") : "#141210"} stroke="rgba(0,0,0,0.9)" strokeWidth={0.8} />;
      })}
    </svg>
  );
}
