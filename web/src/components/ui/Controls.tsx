"use client";
/** The small settings controls the sheets share: an iOS switch and a row of pills. */

export function Switch({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <button role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)}
      className={`press relative w-[51px] h-[31px] rounded-full transition-colors shrink-0 ${on ? "gold-fill" : "tint-2"}`}>
      <span className="absolute top-[3px] w-[25px] h-[25px] rounded-full bg-white shadow transition-all" style={{ left: on ? 23 : 3 }} />
    </button>
  );
}

export function Pills<T extends string | number>({ value, options, onChange }: { value: T; options: { v: T; l: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="glass rounded-full h-9 p-[3px] flex items-center shrink-0">
      {options.map((o) => (
        <button key={o.v} onClick={() => onChange(o.v)} aria-pressed={value === o.v}
          className={`press h-full px-3 rounded-full ios-caption ${value === o.v ? "lens text-ivory font-semibold" : "label-2"}`}>{o.l}</button>
      ))}
    </div>
  );
}
