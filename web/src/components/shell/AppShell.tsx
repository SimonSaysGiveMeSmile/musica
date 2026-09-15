"use client";
import { useEffect } from "react";
import { TabBar } from "./TabBar";
import { SideRail } from "./SideRail";
import { warmWorker } from "@/lib/analysis/client";
import { applyTheme, getPrefs, usePrefs } from "@/lib/store/prefs";
import { applyLang, resolveLang } from "@/lib/i18n";

export function AppShell({ children }: { children: React.ReactNode }) {
  const prefs = usePrefs();
  useEffect(() => { applyLang(resolveLang(prefs.language)); }, [prefs.language]);
  useEffect(() => {
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
    applyTheme(getPrefs());
    // iOS 26 standalone: after the keyboard closes the viewport can stay shrunk; a display flip makes iOS re-measure.
    const standalone = (navigator as Navigator & { standalone?: boolean }).standalone || window.matchMedia("(display-mode: standalone)").matches;
    const heal = () => setTimeout(() => {
      if (!standalone) return;
      const root = document.getElementById("app-root");
      if (!root) return;
      root.style.display = "none"; void root.offsetHeight; root.style.display = "";
    }, 160);
    document.addEventListener("focusout", heal);
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onScheme = () => applyTheme(getPrefs());
    mq.addEventListener("change", onScheme);
    const t = setTimeout(warmWorker, 1500);
    return () => {
      clearTimeout(t); mq.removeEventListener("change", onScheme);
      document.removeEventListener("focusout", heal);
    };
  }, []);
  return (
    <>
      <div className="ambient" aria-hidden />
      <div id="app-root" className="relative z-10 flex-1 flex w-full lg:max-w-[1280px] lg:mx-auto">
        <SideRail />
        <div className="flex-1 flex flex-col min-w-0 mx-auto w-full max-w-[560px] lg:max-w-none">
          {children}
        </div>
      </div>
      <TabBar />
    </>
  );
}
