import type { SVGProps } from "react";

const base = (p: SVGProps<SVGSVGElement>) => ({
  width: 22, height: 22, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor",
  strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, ...p,
});

export const IconSearch = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
);
export const IconLibrary = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><path d="M4 5v14M9 5v14" /><path d="m13 6 6-1.5v14L13 20z" /></svg>
);
export const IconLive = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></svg>
);
export const IconMe = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><path d="M4 4h16v16H4z" /><path d="M8 4v10M12 4v10M16 4v10" /><path d="M6.5 4v7h3V4M10.5 4v7h3V4M14.5 4v7h3V4" fill="currentColor" stroke="none" opacity=".9" /></svg>
);
export const IconPlay = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)} fill="currentColor" stroke="none"><path d="M7 4.5v15l12-7.5z" /></svg>
);
export const IconPause = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)} fill="currentColor" stroke="none"><rect x="6" y="4.5" width="4" height="15" rx="1" /><rect x="14" y="4.5" width="4" height="15" rx="1" /></svg>
);
export const IconBack = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)} strokeWidth={2.2}><path d="m14 6-6 6 6 6" /></svg>
);
export const IconFile = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5" /><path d="M10 17v-4.5l4-1v4.5" /><circle cx="9" cy="17.5" r="1.2" /><circle cx="13" cy="16.5" r="1.2" /></svg>
);
export const IconLink = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" /><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" /></svg>
);
export const IconClose = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><path d="M6 6l12 12M18 6 6 18" /></svg>
);
export const IconTrash = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" /></svg>
);
export const IconLoop = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><path d="M17 3l3 3-3 3" /><path d="M20 6H8a4 4 0 0 0-4 4v1" /><path d="M7 21l-3-3 3-3" /><path d="M4 18h12a4 4 0 0 0 4-4v-1" /></svg>
);
export const IconMetronome = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><path d="M9 3h6l3 18H6z" /><path d="M12 15 18 6" /><path d="M6 15h12" /></svg>
);
export const IconChevron = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><path d="m9 6 6 6-6 6" /></svg>
);
export const IconSpark = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)} fill="currentColor" stroke="none"><path d="M12 2l1.8 6.2L20 10l-6.2 1.8L12 18l-1.8-6.2L4 10l6.2-1.8z" /></svg>
);
export const IconCheck = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)} strokeWidth={2.4}><path d="m5 12 5 5 9-10" /></svg>
);
export const IconPlus = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><path d="M12 5v14M5 12h14" /></svg>
);
export const IconMinus = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><path d="M5 12h14" /></svg>
);
/** Heart for the credit line: same stroke grammar as the rest of the set, filled with the accent. */
export const IconHeart = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)} strokeWidth={1.4}>
    <path
      d="M12 20.3s-7.2-4.6-9.1-9.2C1.6 7.9 3.6 4.7 6.9 4.7c2 0 3.4 1.1 5.1 3 1.7-1.9 3.1-3 5.1-3 3.3 0 5.3 3.2 4 6.4-1.9 4.6-9.1 9.2-9.1 9.2z"
      style={{ fill: "var(--gold)", stroke: "var(--gold-hi)" }}
      strokeLinejoin="round"
    />
  </svg>
);
export const IconShare = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><path d="M12 3v12M8 7l4-4 4 4" /><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7" /></svg>
);
export const IconRewind = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><path d="M3.2 11a9 9 0 1 1 2.3 7.2" /><path d="M2.5 5.5v5.2h5.2" /></svg>
);
export const IconSectionBack = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><path d="M6 5.5v13" /><path d="M19.5 6.2v11.6L9.8 12z" fill="currentColor" stroke="none" /></svg>
);
export const IconSliders = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><path d="M4 7h10M18 7h2M4 17h4M12 17h8" /><circle cx="16" cy="7" r="2.2" /><circle cx="10" cy="17" r="2.2" /></svg>
);
export const IconNotes = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><circle cx="7" cy="17.5" r="2.6" /><circle cx="17" cy="15.5" r="2.6" /><path d="M9.6 17.5V6l10-2v11.5" /></svg>
);
