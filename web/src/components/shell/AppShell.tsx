"use client";
import { useEffect } from "react";
import { TabBar } from "./TabBar";
import { SideRail } from "./SideRail";
import { warmWorker } from "@/lib/analysis/client";
import { applyTheme, getPrefs } from "@/lib/store/prefs";

export function AppShell({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
    applyTheme(getPrefs());
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onScheme = () => applyTheme(getPrefs());
    mq.addEventListener("change", onScheme);
    const t = setTimeout(warmWorker, 1500);
    return () => { clearTimeout(t); mq.removeEventListener("change", onScheme); };
  }, []);
  return (
    <>
      <div className="ambient" aria-hidden />
      <div className="relative z-10 flex-1 flex w-full lg:max-w-[1280px] lg:mx-auto">
        <SideRail />
        <div className="flex-1 flex flex-col min-w-0 mx-auto w-full max-w-[560px] lg:max-w-none">
          {children}
        </div>
      </div>
      <TabBar />
    </>
  );
}
