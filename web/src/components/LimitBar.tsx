"use client";

/** Soft-limit progress bar (travel + month). Never blocks spend. */
export function LimitBar({
  pct,
  over,
}: {
  pct: number | null;
  over: boolean;
}) {
  if (pct == null) return null;
  const width = Math.min(100, Math.max(0, pct));
  const near = !over && pct >= 80;
  return (
    <div className="h-2.5 w-full overflow-hidden rounded-full bg-[var(--panel-soft)]">
      <div
        className={`h-full rounded-full transition-[width] duration-500 ${
          over ? "bg-amber-600" : near ? "bg-sky-700" : "bg-sky-600"
        }`}
        style={{ width: `${width}%` }}
      />
    </div>
  );
}
