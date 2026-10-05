"use client";

export type LimitBarTone = "personal" | "total" | "neutral";

/** Soft-limit progress bar (travel + month). Never blocks spend. */
export function LimitBar({
  pct,
  over,
  tone = "neutral",
  size = "md",
}: {
  pct: number | null;
  over: boolean;
  tone?: LimitBarTone;
  size?: "sm" | "md";
}) {
  if (pct == null) return null;
  const width = Math.min(100, Math.max(0, pct));
  const near = !over && pct >= 80;
  const height = size === "sm" ? "h-2" : "h-2.5";

  const fill = over
    ? "bg-amber-600"
    : tone === "personal"
      ? near
        ? "bg-[var(--accent-a)]"
        : "bg-[var(--accent-a)] opacity-90"
      : tone === "total"
        ? near
          ? "bg-[var(--accent-b)]"
          : "bg-[var(--accent-b)] opacity-90"
        : near
          ? "bg-sky-700"
          : "bg-sky-600";

  return (
    <div
      className={`${height} w-full overflow-hidden rounded-full bg-[var(--panel-soft)] ring-1 ring-[var(--chrome-edge)]`}
    >
      <div
        className={`h-full rounded-full transition-[width] duration-500 ${fill}`}
        style={{ width: `${width}%` }}
      />
    </div>
  );
}
