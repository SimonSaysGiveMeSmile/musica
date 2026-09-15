"use client";
import { AnimatePresence, motion } from "motion/react";
import { useEffect } from "react";

export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title?: string; children: React.ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.button
            aria-label="Close"
            className="fixed inset-0 z-50 bg-black/35"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            role="dialog"
            className="fixed z-50 left-1/2 -translate-x-1/2 w-[min(560px,calc(100%-12px))] bottom-1.5 lg:bottom-10 glass-strong rounded-[38px] px-5 pt-2"
            style={{ paddingBottom: "calc(var(--sab) + 20px)" }}
            initial={{ y: "110%" }} animate={{ y: 0 }} exit={{ y: "110%" }}
            transition={{ type: "spring", stiffness: 420, damping: 38 }}
            drag="y" dragConstraints={{ top: 0 }} dragElastic={0.08}
            onDragEnd={(_, i) => { if (i.offset.y > 90 || i.velocity.y > 600) onClose(); }}
          >
            <div className="mx-auto w-9 h-[5px] rounded-full label-3 bg-current mb-3 mt-1 opacity-60" />
            {title && <h2 className="ios-title2 mb-3">{title}</h2>}
            {children}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
