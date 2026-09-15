"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { IconLibrary, IconLive, IconMe, IconSearch } from "@/components/ui/Icons";
import { useT, type Key } from "@/lib/i18n";

const TABS: { href: string; label: Key; Icon: typeof IconSearch }[] = [
  { href: "/", label: "nav.search", Icon: IconSearch },
  { href: "/library", label: "nav.library", Icon: IconLibrary },
  { href: "/live", label: "nav.live", Icon: IconLive },
  { href: "/me", label: "nav.me", Icon: IconMe },
];

/** Desktop navigation: a quiet rail on the left. The mobile tab bar handles small screens. */
export function SideRail() {
  const path = usePathname();
  const { t } = useT();
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
              {t(label)}
            </Link>
          );
        })}
      </nav>
      <div className="mt-auto px-3 ios-caption label-3">
        {t("rail.privacy")}
        <div className="mt-3">{t("credit.madeBy")}</div>
      </div>
    </aside>
  );
}
