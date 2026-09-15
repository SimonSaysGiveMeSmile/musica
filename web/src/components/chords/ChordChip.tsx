"use client";
export function ChordChip({ symbol, active, known, onClick, size = "md" }: { symbol: string; active?: boolean; known?: boolean; onClick?: () => void; size?: "sm" | "md" | "lg" }) {
  const dims = size === "lg" ? "h-12 px-4 text-[20px]" : size === "sm" ? "h-7 px-2 text-[13px]" : "h-9 px-3 text-[15px]";
  return (
    <button
      type="button"
      onClick={onClick}
      className={`chordname press inline-flex items-center rounded-full border transition-all ${dims} ${
        active
          ? "gold-fill border-transparent"
          : known === false
            ? "text-felt-hi border-felt-hi/40 bg-felt/15"
            : "text-ivory border-(--glass-line) tint-1"
      }`}
    >
      {symbol}
    </button>
  );
}
