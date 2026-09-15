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
            className="fixed inset-0 z-50 bg-black/40"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            role="dialog"
            className="fixed z-50 left-1/2 -translate-x-1/2 w-[min(560px,100%)] bottom-0 lg:bottom-10 glass-strong rounded-t-[32px] lg:rounded-[32px] px-5 pt-3"
            style={{ paddingBottom: "calc(var(--sab) + 20px)" }}
            initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
            transition={{ type: "spring", stiffness: 380, damping: 36 }}
            drag="y" dragConstraints={{ top: 0 }} dragElastic={0.08}
            onDragEnd={(_, i) => { if (i.offset.y > 90 || i.velocity.y > 600) onClose(); }}
          >
            <div className="mx-auto w-10 h-1.5 rounded-full bg-ivory-3/50 mb-3" />
            {title && <h2 className="display text-xl font-semibold mb-3">{title}</h2>}
            {children}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
