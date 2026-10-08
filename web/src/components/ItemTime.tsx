"use client";

import { formatItemTime } from "@/lib/calendar";

type Props = {
  value: string | number | Date | null | undefined;
  locale: "ar" | "en";
  className?: string;
};

/** Compact clock time for list rows within a known day. */
export function ItemTime({ value, locale, className = "" }: Props) {
  if (value == null || value === "") return null;
  const label = formatItemTime(value, locale);
  if (!label) return null;
  const date =
    typeof value === "number"
      ? new Date(value)
      : value instanceof Date
        ? value
        : new Date(value);
  const dateTime = Number.isNaN(date.getTime()) ? undefined : date.toISOString();
  return (
    <time
      dateTime={dateTime}
      className={`inline-flex items-center rounded-lg bg-[var(--panel-soft)] px-2 py-0.5 text-xs font-medium tabular-nums tracking-wide text-[var(--muted)] ring-1 ring-[var(--input-border)]/50 ${className}`}
    >
      {label}
    </time>
  );
}
