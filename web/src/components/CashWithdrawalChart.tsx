"use client";

import { money } from "@/lib/api";

export type CashWithdrawalChartItem = {
  amount: number;
  occurredOn: string;
};

type Props = {
  items: CashWithdrawalChartItem[];
  periodFrom: string;
  periodTo: string;
  currency: string;
  locale: "ar" | "en";
  label: string;
  hidden?: boolean;
  compact?: boolean;
};

function parseDateKey(key: string) {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function dateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function daysInRange(from: string, to: string) {
  const start = parseDateKey(from);
  const end = parseDateKey(to);
  const days: string[] = [];

  for (
    let cursor = start;
    cursor.getTime() <= end.getTime();
    cursor = new Date(cursor.getTime() + 86_400_000)
  ) {
    days.push(dateKey(cursor));
  }

  return days;
}

function formatDate(key: string, locale: "ar" | "en", short = false) {
  return parseDateKey(key).toLocaleDateString(locale, {
    day: "numeric",
    month: short ? "short" : "long",
    timeZone: "UTC",
  });
}

export function CashWithdrawalChart({
  items,
  periodFrom,
  periodTo,
  currency,
  locale,
  label,
  hidden = false,
  compact = false,
}: Props) {
  const totals = new Map<string, number>();
  for (const item of items) {
    totals.set(
      item.occurredOn,
      (totals.get(item.occurredOn) ?? 0) + Number(item.amount),
    );
  }

  const days = daysInRange(periodFrom, periodTo);
  const values = days.map((day) => totals.get(day) ?? 0);
  const max = Math.max(...values, 0);
  const middleDay = days[Math.floor((days.length - 1) / 2)] ?? periodFrom;

  return (
    <figure aria-label={label} className="w-full" dir="ltr">
      <div
        className={`flex items-end gap-[3px] overflow-hidden ${
          compact ? "h-14" : "h-36"
        }`}
        aria-hidden={hidden}
      >
        {days.map((day, index) => {
          const amount = values[index];
          const height = hidden
            ? 22 + ((index * 17) % 38)
            : max > 0 && amount > 0
              ? Math.max(10, (amount / max) * 100)
              : 4;
          const title = hidden
            ? undefined
            : `${formatDate(day, locale)} · ${money(amount, currency, locale)}`;

          return (
            <span
              key={day}
              className="flex h-full min-w-0 flex-1 items-end"
              title={title}
              aria-label={title}
            >
              <span
                className={`block w-full rounded-t-full transition-[height] ${
                  hidden
                    ? "bg-[var(--surface-border)] opacity-55"
                    : amount > 0
                      ? "bg-[var(--accent-b)]"
                      : "bg-[var(--panel-soft)]"
                }`}
                style={{ height: `${height}%` }}
              />
            </span>
          );
        })}
      </div>
      {!compact ? (
        <figcaption className="mt-2 flex justify-between text-[10px] font-medium text-[var(--muted)]">
          <span>{formatDate(periodFrom, locale, true)}</span>
          <span>{formatDate(middleDay, locale, true)}</span>
          <span>{formatDate(periodTo, locale, true)}</span>
        </figcaption>
      ) : null}
    </figure>
  );
}
