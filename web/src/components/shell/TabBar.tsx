"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { IconLibrary, IconLive, IconMe, IconSearch } from "@/components/ui/Icons";

const TABS = [
  { href: "/", label: "Search", Icon: IconSearch },
  { href: "/library", label: "Library", Icon: IconLibrary },
  { href: "/live", label: "Live", Icon: IconLive },
  { href: "/me", label: "Me", Icon: IconMe },
];

export function TabBar() {
  const path = usePathname();
  if (path.startsWith("/song/")) return null;
  return (
    <nav
      aria-label="Primary"
      className="fixed left-1/2 -translate-x-1/2 z-40 w-[min(420px,calc(100%-32px))] lg:hidden"
      style={{ bottom: "calc(var(--sab) + 14px)" }}
    >
      <div className="glass-strong rounded-full px-2 py-2 flex items-center justify-between relative">
        {TABS.map(({ href, label, Icon }) => {
          const active = href === "/" ? path === "/" : path.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={`press relative flex flex-col items-center justify-center gap-0.5 h-12 flex-1 rounded-full transition-colors ${
                active ? "text-gold-hi" : "text-ivory-3 hover:text-ivory-2"
              }`}
            >
              {active && (
                <span
                  aria-hidden
                  className="absolute inset-0 rounded-full"
                  style={{
                    background: "linear-gradient(180deg, color-mix(in srgb, var(--gold-hi) 14%, transparent), color-mix(in srgb, var(--gold) 5%, transparent))",
                    boxShadow: "inset 0 1px 0 var(--tint-2), inset 0 0 0 1px color-mix(in srgb, var(--gold) 22%, transparent)",
                  }}
                />
              )}
              <Icon className="relative" />
              <span className="relative text-[10px] font-medium tracking-wide">{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
