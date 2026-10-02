"use client";

import { useI18n } from "@/components/I18nProvider";
import { formatItemDate, isoLocal, toDateKey } from "@/lib/calendar";

function formatMonthValue(value: string, locale: "ar" | "en") {
  const [y, m] = value.split("-").map(Number);
  if (!y || !m) return value || "—";
  return new Date(y, m - 1, 1).toLocaleDateString(locale === "ar" ? "ar" : "en", {
    month: "long",
    year: "numeric",
  });
}

function relativeDayLabel(value: string, todayLabel: string, yesterdayLabel: string) {
  const key = toDateKey(value);
  if (!key) return "";
  const today = isoLocal(new Date());
  if (key === today) return todayLabel;
  const y = new Date();
  y.setDate(y.getDate() - 1);
  if (key === isoLocal(y)) return yesterdayLabel;
  return "";
}

/** Full-width date/month control that never overflows on mobile (native min-width). */
export function DateField({
  label,
  value,
  min,
  max,
  onChange,
  type = "date",
  align = "start",
  className = "",
}: {
  label?: string;
  value: string;
  min?: string;
  max?: string;
  onChange: (value: string) => void;
  type?: "date" | "month";
  align?: "start" | "center";
  className?: string;
}) {
  const { t, locale } = useI18n();
  const centered = align === "center";
  const display =
    type === "month"
      ? formatMonthValue(value, locale)
      : formatItemDate(value, locale) || value || "—";
  const relative =
    type === "date" ? relativeDayLabel(value, t("today"), t("yesterday")) : "";

  return (
    <label className={`block min-w-0 ${className}`}>
      {label ? (
        <span className="mb-1 block text-xs font-medium text-[var(--muted)]">
          {label}
        </span>
      ) : null}
      <span
        className={`field relative flex min-h-[3.25rem] w-full min-w-0 max-w-full items-center gap-2 overflow-hidden !py-0 ${
          centered ? "justify-center" : ""
        }`}
      >
        <span
          className={`min-w-0 truncate text-base font-semibold tabular-nums ${
            centered ? "px-2 text-center text-lg" : "flex-1"
          }`}
        >
          {display}
        </span>
        {relative ? (
          <span className="shrink-0 rounded-full bg-[var(--panel-soft)] px-2 py-0.5 text-xs font-semibold text-[var(--muted)]">
            {relative}
          </span>
        ) : null}
        <input
          type={type}
          value={value}
          min={min}
          max={max}
          onChange={(e) => {
            if (e.target.value) onChange(e.target.value);
          }}
          className="absolute inset-0 z-10 cursor-pointer opacity-0"
          aria-label={label || (type === "month" ? "Month" : "Date")}
        />
      </span>
    </label>
  );
}
