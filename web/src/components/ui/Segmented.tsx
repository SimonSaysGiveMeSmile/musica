"use client";
import { motion } from "motion/react";

export function Segmented<T extends string>({ value, options, onChange, id }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; id: string }) {
  return (
    <div role="tablist" className="glass rounded-full p-1 flex relative">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(o.value)}
            className={`relative flex-1 h-9 rounded-full text-[13px] font-medium transition-colors ${active ? "text-on-accent" : "text-ivory-2"}`}
          >
            {active && (
              <motion.span
                layoutId={`seg-${id}`}
                className="absolute inset-0 rounded-full"
                style={{ background: "linear-gradient(180deg, var(--gold-hi), var(--gold))", boxShadow: "inset 0 1px 0 rgba(255,255,255,0.35)" }}
                transition={{ type: "spring", stiffness: 500, damping: 40 }}
              />
            )}
            <span className="relative">{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}
