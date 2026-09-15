export function LargeTitle({ eyebrow, title, right }: { eyebrow?: string; title: string; right?: React.ReactNode }) {
  return (
    <header className="safe-top px-5 lg:px-10 pt-2 pb-3 flex items-end justify-between gap-4">
      <div>
        <h1 className="ios-large-title text-ivory rise">{title}</h1>
        {eyebrow && <div className="ios-subhead label-2 mt-0.5 rise" style={{ animationDelay: "40ms" }}>{eyebrow}</div>}
      </div>
      {right}
    </header>
  );
}
