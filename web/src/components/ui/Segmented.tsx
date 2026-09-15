"use client";
import { motion } from "motion/react";

/** iOS segmented control: glass track, a sliding lens under the selected segment. */
export function Segmented<T extends string>({ value, options, onChange, id }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; id: string }) {
  return (
    <div role="tablist" className="glass rounded-full p-[3px] flex relative">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(o.value)}
            className={`relative flex-1 h-9 rounded-full ios-subhead transition-colors ${active ? "text-ivory font-semibold" : "label-2 font-medium"}`}
          >
            {active && (
              <motion.span layoutId={`seg-${id}`} className="absolute inset-0 rounded-full lens" transition={{ type: "spring", stiffness: 520, damping: 40 }} />
            )}
            <span className="relative">{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}
