"use client";
import { motion } from "motion/react";
import type { IngestState } from "@/lib/ingest";
import { IconClose } from "@/components/ui/Icons";

const STEPS: { key: IngestState["stage"][]; label: string }[] = [
  { key: ["fetching"], label: "Pull" },
  { key: ["decoding"], label: "Decode" },
  { key: ["analyzing"], label: "Listen" },
  { key: ["lyrics", "saving", "done"], label: "Lyrics" },
];

export function IngestProgress({ state, title, onDismiss }: { state: IngestState; title: string; onDismiss: () => void }) {
  const isError = state.stage === "error";
  const idx = STEPS.findIndex((s) => s.key.includes(state.stage));
  return (
    <div className="inset-group p-4 relative">
      <div aria-hidden className="absolute inset-x-0 top-0 h-px gold-line opacity-70" />
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="eyebrow">{isError ? "Could not analyze" : "Analyzing"}</div>
          <div className="ios-headline truncate mt-1">{title}</div>
        </div>
        {(isError || state.stage === "done") && (
          <button onClick={onDismiss} aria-label="Dismiss" className="press text-ivory-3 -mr-1 -mt-1 p-1"><IconClose /></button>
        )}
      </div>
      {isError ? (
        <p className="text-felt-hi ios-footnote mt-3">{state.error}</p>
      ) : (
        <>
          <div className="mt-4 h-1.5 rounded-full tint-2 overflow-hidden">
            <motion.div className="h-full rounded-full" style={{ background: "linear-gradient(90deg, var(--gold-lo), var(--gold-hi))" }} animate={{ width: `${Math.round(state.pct * 100)}%` }} transition={{ type: "spring", stiffness: 120, damping: 24 }} />
          </div>
          <div className="mt-3 flex items-center justify-between">
            <div className="flex gap-3">
              {STEPS.map((s, i) => (
                <span key={s.label} className={`ios-caption font-medium ${i < idx ? "text-gold" : i === idx ? "text-ivory" : "text-ivory-3"}`}>{s.label}</span>
              ))}
            </div>
            <span className="label-2 ios-caption">{state.detail}</span>
          </div>
        </>
      )}
    </div>
  );
}
