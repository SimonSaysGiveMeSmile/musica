"use client";
/** Controls that get out of the way while you read. Scroll down and they slide off; scroll up, or
 *  tap the page, and they come back. Only scrolling the person does counts: the sheet following the
 *  song, or a tapped line scrolling into view, must not hide the player mid-song. */
import { useEffect, useState } from "react";

const HIDE_AFTER = 28;   // px of downward scroll before hiding
const SHOW_AFTER = 18;   // px of upward scroll before showing again
const INTENT_MS = 500;   // how long a wheel, touch or key press vouches for the scroll events that follow

export function useAutoHide(enabled: boolean): boolean {
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    if (!enabled) return;
    let last = window.scrollY, run = 0, intentUntil = 0;
    const intent = () => { intentUntil = performance.now() + INTENT_MS; };
    const onScroll = () => {
      const y = window.scrollY, dy = y - last; last = y;
      if (y <= 4) { run = 0; setHidden(false); return; }     // at the top there is nothing to hide for
      if (performance.now() > intentUntil) return;          // the page moved on its own
      run = Math.sign(dy) === Math.sign(run) ? run + dy : dy;
      if (run > HIDE_AFTER) setHidden(true); else if (run < -SHOW_AFTER) setHidden(false);
    };
    // a tap (a press that does not move) brings everything back, wherever it lands
    let down: { x: number; y: number } | null = null;
    const onDown = (e: PointerEvent) => { down = { x: e.clientX, y: e.clientY }; };
    const onUp = (e: PointerEvent) => {
      if (down && Math.hypot(e.clientX - down.x, e.clientY - down.y) < 8) setHidden(false);
      down = null;
    };
    const onKey = (e: KeyboardEvent) => { if (["ArrowDown", "ArrowUp", "PageDown", "PageUp", " ", "Home", "End"].includes(e.key)) intent(); };
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("wheel", intent, { passive: true });
    window.addEventListener("touchmove", intent, { passive: true });
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onDown, { passive: true });
    window.addEventListener("pointerup", onUp, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll); window.removeEventListener("wheel", intent);
      window.removeEventListener("touchmove", intent); window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onDown); window.removeEventListener("pointerup", onUp);
    };
  }, [enabled]);
  return enabled && hidden;
}
