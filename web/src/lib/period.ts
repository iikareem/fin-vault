import { isoLocal } from "@/lib/calendar";

export type HistoryPeriod = "day" | "week" | "month";

export function rangeForPeriod(period: HistoryPeriod, cursor: Date) {
  const y = cursor.getFullYear();
  const m = cursor.getMonth();
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
  return {
    from: isoLocal(new Date(y, m, 1)),
    to: isoLocal(new Date(y, m + 1, 0)),
  };
}

export function shiftPeriod(period: HistoryPeriod, cursor: Date, dir: number) {
  const next = new Date(cursor);
  if (period === "day") {
    next.setDate(next.getDate() + dir);
    return next;
  }
  if (period === "week") {
    next.setDate(next.getDate() + dir * 7);
    return next;
  }
  return new Date(cursor.getFullYear(), cursor.getMonth() + dir, 1);
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
  return cursor.toLocaleDateString(loc, { month: "long", year: "numeric" });
}
