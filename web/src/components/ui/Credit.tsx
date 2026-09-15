"use client";
import { IconHeart } from "./Icons";
import { useT } from "@/lib/i18n";

/** "Made with ♥ by Simon" with a drawn heart instead of an emoji, so it matches the icon set in every language. */
export function Credit({ className = "" }: { className?: string }) {
  const { t } = useT();
  const [before, after] = t("credit.madeBy").split("{heart}");
  return (
    <span className={`inline-flex items-center gap-1 ${className}`}>
      {before}
      <IconHeart width={14} height={14} aria-label="love" role="img" className="inline-block -mt-px" />
      {after}
    </span>
  );
}
