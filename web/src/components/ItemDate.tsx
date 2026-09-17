"use client";

import { formatItemDate, toDateKey } from "@/lib/calendar";

type Props = {
  value: string | Date | null | undefined;
  locale: "ar" | "en";
  className?: string;
};

/** Compact calendar date for list rows (weekday + day + month). */
export function ItemDate({ value, locale, className = "" }: Props) {
  if (!value) return null;
  const key = toDateKey(value);
  if (!key) return null;
  const label = formatItemDate(value, locale);
  if (!label) return null;
  return (
    <time
      dateTime={key}
      className={`inline-flex items-center rounded-lg bg-[var(--panel-soft)] px-2 py-0.5 text-xs font-medium tabular-nums tracking-wide text-[var(--muted)] ring-1 ring-[var(--input-border)]/50 ${className}`}
    >
      {label}
    </time>
  );
}
