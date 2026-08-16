export function pad2(n: number) {
  return String(n).padStart(2, "0");
}

/** Local calendar YYYY-MM-DD (not UTC). */
export function isoLocal(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export function monthKeyLocal(d = new Date()) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
}

/** Last calendar day of a month. month is 1–12. Handles 28/29/30/31. */
export function daysInMonth(year: number, month: number) {
  return new Date(year, month, 0).getDate();
}

export function monthRangeLocal(d = new Date()) {
  const y = d.getFullYear();
  const m = d.getMonth();
  return {
    from: isoLocal(new Date(y, m, 1)),
    to: isoLocal(new Date(y, m + 1, 0)),
    days: daysInMonth(y, m + 1),
    key: monthKeyLocal(d),
  };
}

/** Days still left after today. 0 on the last day. */
export function remainingDaysInMonth(d = new Date()) {
  const last = daysInMonth(d.getFullYear(), d.getMonth() + 1);
  return Math.max(0, last - d.getDate());
}

export function parseMonthKey(key: string) {
  const [y, m] = key.split("-").map(Number);
  return { year: y, month: m, days: daysInMonth(y, m) };
}

export function shiftMonthKey(key: string, dir: number) {
  const { year, month } = parseMonthKey(key);
  const d = new Date(year, month - 1 + dir, 1);
  return monthKeyLocal(d);
}

/** Normalize API dates (YYYY-MM-DD or ISO) to a calendar key. */
export function toDateKey(value: string | Date | null | undefined) {
  if (!value) return "";
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return `${value.getUTCFullYear()}-${pad2(value.getUTCMonth() + 1)}-${pad2(value.getUTCDate())}`;
  }
  const raw = String(value).trim();
  const m = raw.match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : "";
}

/** Friendly day + month label for list rows. */
export function formatItemDate(
  value: string | Date | null | undefined,
  locale: string,
) {
  const key = toDateKey(value);
  if (!key) return "";
  const [y, m, d] = key.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  const loc = locale === "ar" ? "ar" : "en";
  const sameYear = date.getFullYear() === new Date().getFullYear();
  return date.toLocaleDateString(loc, {
    weekday: "short",
    day: "numeric",
    month: "short",
    ...(sameYear ? {} : { year: "numeric" as const }),
  });
}

/** Newest date first. */
export function compareOccurredOnDesc(
  a: string | Date | null | undefined,
  b: string | Date | null | undefined,
) {
  const ka = toDateKey(a);
  const kb = toDateKey(b);
  if (ka === kb) return 0;
  return ka < kb ? 1 : -1;
}

export function sortByOccurredOnDesc<
  T extends { occurredOn?: string | Date | null },
>(rows: T[]) {
  return [...rows].sort((x, y) =>
    compareOccurredOnDesc(x.occurredOn, y.occurredOn),
  );
}
