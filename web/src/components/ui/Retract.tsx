"use client";
/** The grab handle that pulls the transport down out of the way and back up again.
 *  Tap it, or drag it in the direction you want it to go. */
import { useRef } from "react";
import { setPrefs, usePrefs } from "@/lib/store/prefs";

export function useRetracted(): [boolean, (v: boolean) => void] {
  const collapsed = usePrefs().playerCollapsed;
  return [collapsed, (v: boolean) => setPrefs({ playerCollapsed: v })];
}

export function GrabHandle({ collapsed, onChange, label }: { collapsed: boolean; onChange: (v: boolean) => void; label: string }) {
  const start = useRef(0);
  const dragged = useRef(false);
  return (
    <button
      type="button"
      aria-label={label}
      aria-expanded={!collapsed}
      onPointerDown={(e) => { start.current = e.clientY; dragged.current = false; }}
      onPointerUp={(e) => {
        const dy = e.clientY - start.current;
        // a real drag goes where it is pushed; anything smaller falls through to the click below
        if (Math.abs(dy) < 8) return;
        dragged.current = true;
        onChange(dy > 0);
      }}
      // the click is what a tap, a keyboard Enter and a screen reader all end up sending
      onClick={() => { if (!dragged.current) onChange(!collapsed); }}
      className="press w-full h-6 -mt-1 mb-0.5 flex items-center justify-center touch-none cursor-pointer"
    >
      <span className="block w-9 h-1 rounded-full" style={{ background: "color-mix(in srgb, var(--ivory) 28%, transparent)" }} />
    </button>
  );
}
