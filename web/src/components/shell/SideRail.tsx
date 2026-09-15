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

/** Desktop navigation: a quiet rail on the left. The mobile tab bar handles small screens. */
export function SideRail() {
  const path = usePathname();
  return (
    <aside className="hidden lg:flex flex-col sticky top-0 h-dvh px-4 py-7 gap-6" style={{ width: "var(--rail-w)" }}>
      <Link href="/" className="px-3">
        <span className="ios-title2">Musica<span className="text-gold">.</span></span>
      </Link>
      <nav aria-label="Primary" className="flex flex-col gap-1">
        {TABS.map(({ href, label, Icon }) => {
          const active = href === "/" ? path === "/" : path.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={`press flex items-center gap-3 h-11 px-3 rounded-full ios-subhead font-medium transition-colors ${
                active ? "text-ivory lens" : "label-2 hover:text-ivory hover:bg-(--tint-1)"
              }`}
            >
              <Icon width={20} height={20} />
              {label}
            </Link>
          );
        })}
      </nav>
      <div className="mt-auto px-3 ios-caption label-3">
        Analysis runs on this device.<br />Nothing you play is uploaded.
      </div>
    </aside>
  );
}
