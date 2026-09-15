"use client";
import { useState, useSyncExternalStore } from "react";
import { Sheet } from "./Sheet";
import { IconShare, IconPlus, IconCheck } from "./Icons";
import { useT } from "@/lib/i18n";
import { setPrefs, usePrefs } from "@/lib/store/prefs";

type Platform = "ios" | "android" | "wechat" | "desktop";

const SERVER_PLATFORM = { platform: "desktop" as Platform, installed: false };
let clientPlatform: { platform: Platform; installed: boolean } | null = null;
function readPlatform() {
  if (clientPlatform) return clientPlatform;
  const ua = navigator.userAgent;
  const installed = (navigator as Navigator & { standalone?: boolean }).standalone === true || window.matchMedia("(display-mode: standalone)").matches;
  const platform: Platform = /MicroMessenger/i.test(ua) ? "wechat" : /iPhone|iPad|iPod/i.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1) ? "ios" : /Android/i.test(ua) ? "android" : "desktop";
  clientPlatform = { platform, installed };
  return clientPlatform;
}
/** Platform + installed state; server snapshot is a neutral default so hydration matches, then the client value takes over. */
export function usePlatform() {
  return useSyncExternalStore(() => () => {}, readPlatform, () => SERVER_PLATFORM);
}

/** The step list, reused by the card and the Me row. */
export function InstallSteps({ platform }: { platform: Platform }) {
  const { t } = useT();
  const ios = [
    { icon: <IconShare width={18} height={18} />, text: t("install.ios1") },
    { icon: <IconPlus width={18} height={18} />, text: t("install.ios2") },
    { icon: <IconCheck width={18} height={18} />, text: t("install.ios3") },
  ];
  const android = [
    { icon: <span className="ios-headline">⋮</span>, text: t("install.android1") },
    { icon: <IconPlus width={18} height={18} />, text: t("install.android2") },
  ];
  const steps = platform === "android" ? android : ios;
  return (
    <div>
      {platform === "wechat" && <p className="ios-footnote text-gold mb-3">{t("install.wechat")}</p>}
      {platform === "desktop" && <p className="ios-footnote label-2 mb-3">{t("install.desktop")}</p>}
      <ol className="inset-group">
        {steps.map((s, i) => (
          <li key={i} className="row">
            <span className="chordname ios-headline text-gold-hi w-6 shrink-0 tabular-nums">{i + 1}</span>
            <span className="circle-btn !w-9 !h-9 glass text-ivory shrink-0">{s.icon}</span>
            <span className="ios-subhead">{s.text}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

/** Home-page card: only on phones that have not installed the app, dismissible. */
export function InstallCard() {
  const { t } = useT();
  const prefs = usePrefs();
  const { platform, installed } = usePlatform();
  const [open, setOpen] = useState(false);
  if (installed || platform === "desktop" || prefs.installDismissed) return null;
  return (
    <section className="px-5 lg:px-0 mt-6 lg:max-w-[640px] rise" style={{ animationDelay: "200ms" }}>
      <div className="inset-group p-4">
        <div className="flex items-start gap-3">
          <span className="circle-btn gold-fill shrink-0"><IconShare width={20} height={20} /></span>
          <div className="min-w-0 flex-1">
            <div className="ios-headline">{t("install.title")}</div>
            <div className="ios-footnote label-2 mt-0.5">{t("install.subtitle")}</div>
          </div>
        </div>
        <div className="flex gap-2 mt-3">
          <button onClick={() => setOpen(true)} className="press gold-fill rounded-full h-10 px-4 ios-subhead font-semibold">{t("install.show")}</button>
          <button onClick={() => setPrefs({ installDismissed: true })} className="press glass rounded-full h-10 px-4 ios-subhead text-ivory">{t("install.later")}</button>
        </div>
      </div>
      <Sheet open={open} onClose={() => setOpen(false)} title={t("install.title")}>
        <InstallSteps platform={platform} />
      </Sheet>
    </section>
  );
}

/** Me-page row: always available. */
export function InstallRow() {
  const { t } = useT();
  const { platform, installed } = usePlatform();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)} className="row press w-full text-left">
        <span className="circle-btn !w-9 !h-9 glass text-gold-hi shrink-0"><IconShare width={18} height={18} /></span>
        <span className="ios-body flex-1">{t("install.meRow")}</span>
        {installed ? <span className="ios-footnote text-gold flex items-center gap-1"><IconCheck width={14} height={14} /> {t("install.installed")}</span> : <span className="label-3">›</span>}
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title={t("install.title")}>
        <InstallSteps platform={platform} />
      </Sheet>
    </>
  );
}
