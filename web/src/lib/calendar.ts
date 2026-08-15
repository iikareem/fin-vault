export function pad2(n: number) {
  return String(n).padStart(2, '0');
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
  const [y, m] = key.split('-').map(Number);
  return { year: y, month: m, days: daysInMonth(y, m) };
}

export function shiftMonthKey(key: string, dir: number) {
  const { year, month } = parseMonthKey(key);
  const d = new Date(year, month - 1 + dir, 1);
  return monthKeyLocal(d);
}
