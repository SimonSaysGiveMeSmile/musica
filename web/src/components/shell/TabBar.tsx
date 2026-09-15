"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "motion/react";
import { IconLibrary, IconLive, IconMe, IconSearch } from "@/components/ui/Icons";
import { useT, type Key } from "@/lib/i18n";

const TABS: { href: string; label: Key; Icon: typeof IconLibrary }[] = [
  { href: "/library", label: "nav.library", Icon: IconLibrary },
  { href: "/live", label: "nav.live", Icon: IconLive },
  { href: "/me", label: "nav.me", Icon: IconMe },
];

/** iOS 26/27 tab bar: a glass capsule with a sliding lens, and Search as its own detached circle. */
export function TabBar() {
  const path = usePathname();
  const { t } = useT();
  if (path.startsWith("/song/")) return null;
  const searchActive = path === "/";
  return (
    <nav
      aria-label="Primary"
      className="fixed left-1/2 -translate-x-1/2 z-40 w-[min(430px,calc(100%-24px))] flex items-center gap-2 lg:hidden"
      style={{ bottom: "calc(var(--sab) + 4px - var(--ios-bottom-shim))" }}
    >
      <div className="glass-strong rounded-full p-1 flex items-center flex-1 relative">
        {TABS.map(({ href, label, Icon }) => {
          const active = path.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={`press relative flex flex-col items-center justify-center gap-[3px] h-[52px] flex-1 rounded-full transition-colors ${active ? "text-gold-hi" : "label-2"}`}
            >
              {active && (
                <motion.span layoutId="tab-lens" aria-hidden className="absolute inset-0 rounded-full lens" transition={{ type: "spring", stiffness: 520, damping: 38 }} />
              )}
              <Icon className="relative" width={24} height={24} strokeWidth={1.7} />
              <span className="relative ios-caption2 font-medium">{t(label)}</span>
            </Link>
          );
        })}
      </div>
      <Link
        href="/"
        aria-label={t("nav.search")}
        aria-current={searchActive ? "page" : undefined}
        className={`press glass-strong circle-btn !w-[60px] !h-[60px] shrink-0 ${searchActive ? "text-gold-hi" : "label-2"}`}
      >
        <span className={`circle-btn !w-[52px] !h-[52px] ${searchActive ? "lens" : ""}`}><IconSearch width={24} height={24} strokeWidth={1.9} /></span>
      </Link>
    </nav>
  );
}
