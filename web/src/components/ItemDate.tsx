"use client";

import { formatItemDate, toDateKey } from "@/lib/calendar";

type Props = {
  value: string | Date | null | undefined;
  locale: "ar" | "en";
  className?: string;
};

/** Compact calendar date for list rows (day + month). */
export function ItemDate({ value, locale, className = "" }: Props) {
  if (!value) return null;
  const key = toDateKey(value);
  if (!key) return null;
  return (
    <time
      dateTime={key}
      className={`inline-flex items-center gap-1 text-sm text-stone-500 ${className}`}
    >
      <span aria-hidden>📅</span>
      <span>{formatItemDate(value, locale)}</span>
    </time>
  );
}
