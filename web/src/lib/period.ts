import { budgetMonthKey, budgetMonthRange, isoLocal } from "@/lib/calendar";

export type HistoryPeriod = "day" | "week" | "month";

export function rangeForPeriod(
  period: HistoryPeriod,
  cursor: Date,
  budgetMonthStartDay = 1,
) {
  if (period === "day") {
    const day = isoLocal(cursor);
    return { from: day, to: day };
  }
  if (period === "week") {
    const start = new Date(cursor);
    const day = (start.getDay() + 6) % 7; // Monday = 0
    start.setDate(start.getDate() - day);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    return { from: isoLocal(start), to: isoLocal(end) };
  }
  const range = budgetMonthRange(cursor, budgetMonthStartDay);
  return { from: range.from, to: range.to };
}

export function shiftPeriod(
  period: HistoryPeriod,
  cursor: Date,
  dir: number,
  budgetMonthStartDay = 1,
) {
  const next = new Date(cursor);
  if (period === "day") {
    next.setDate(next.getDate() + dir);
    return next;
  }
  if (period === "week") {
    next.setDate(next.getDate() + dir * 7);
    return next;
  }
  if (budgetMonthStartDay === 1) {
    return new Date(cursor.getFullYear(), cursor.getMonth() + dir, 1);
  }
  const key = budgetMonthKey(cursor, budgetMonthStartDay);
  const [y, m] = key.split("-").map(Number);
  // Land on the start day of the shifted budget period.
  return new Date(y, m - 1 + dir, budgetMonthStartDay);
}

export function periodLabel(
  period: HistoryPeriod,
  cursor: Date,
  from: string,
  to: string,
  locale: string,
) {
  const loc = locale === "ar" ? "ar" : "en";
  if (period === "day") {
    return cursor.toLocaleDateString(loc, {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  }
  if (period === "week") {
    const a = new Date(`${from}T12:00:00`);
    const b = new Date(`${to}T12:00:00`);
    return `${a.toLocaleDateString(loc, {
      day: "numeric",
      month: "short",
    })} – ${b.toLocaleDateString(loc, {
      day: "numeric",
      month: "short",
      year: "numeric",
    })}`;
  }
  if (from.slice(0, 7) !== to.slice(0, 7)) {
    const a = new Date(`${from}T12:00:00`);
    const b = new Date(`${to}T12:00:00`);
    return `${a.toLocaleDateString(loc, {
      day: "numeric",
      month: "short",
    })} – ${b.toLocaleDateString(loc, {
      day: "numeric",
      month: "short",
      year: "numeric",
    })}`;
  }
  return cursor.toLocaleDateString(loc, { month: "long", year: "numeric" });
}
