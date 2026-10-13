"use client";

import { formatItemDate, toDateKey } from "@/lib/calendar";

type Tone = "default" | "paid" | "due" | "overdue";

type Props = {
  value: string | Date | null | undefined;
  locale: "ar" | "en";
  className?: string;
  /** Prefer “Today” / “Yesterday” when the day is recent. */
  todayLabel?: string;
  yesterdayLabel?: string;
  /** Soft color hint for commitment / money list rows. */
  tone?: Tone;
};

const TONE_CLASS: Record<Tone, string> = {
  default:
    "bg-[var(--panel-soft)] text-[var(--muted)] ring-[var(--input-border)]/50",
  paid: "bg-[var(--soft-emerald)] text-emerald-800 ring-emerald-700/15 dark:text-emerald-300",
  due: "bg-[var(--soft-amber)] text-amber-900 ring-amber-800/15 dark:text-amber-200",
  overdue: "bg-red-500/10 text-red-800 ring-red-700/15 dark:text-red-300",
};

/** Compact calendar date for list rows (Today / Yesterday / weekday + day + month). */
export function ItemDate({
  value,
  locale,
  className = "",
  todayLabel,
  yesterdayLabel,
  tone = "default",
}: Props) {
  if (!value) return null;
  const key = toDateKey(value);
  if (!key) return null;
  const label = formatItemDate(value, locale, { todayLabel, yesterdayLabel });
  if (!label) return null;
  return (
    <time
      dateTime={key}
      title={key}
      className={`inline-flex items-center rounded-lg px-2 py-0.5 text-xs font-medium tabular-nums tracking-wide ring-1 ${TONE_CLASS[tone]} ${className}`}
    >
      {label}
    </time>
  );
}
