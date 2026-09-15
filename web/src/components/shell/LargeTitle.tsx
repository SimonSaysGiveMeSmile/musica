export function LargeTitle({ eyebrow, title, right }: { eyebrow?: string; title: string; right?: React.ReactNode }) {
  return (
    <header className="safe-top px-5 lg:px-10 pt-3 pb-4 flex items-end justify-between gap-4">
      <div>
        {eyebrow && <div className="eyebrow mb-1 rise">{eyebrow}</div>}
        <h1 className="display text-[40px] lg:text-[48px] leading-none font-semibold text-ivory rise" style={{ animationDelay: "40ms" }}>{title}</h1>
      </div>
      {right}
    </header>
  );
}
