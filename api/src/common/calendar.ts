export function pad2(n: number) {
  return String(n).padStart(2, '0');
}

export function isoLocal(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export function daysInMonth(year: number, month: number) {
  return new Date(year, month, 0).getDate();
}

export function monthKeyLocal(d = new Date()) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
}

export function monthRangeLocal(d = new Date()) {
  const y = d.getFullYear();
  const m = d.getMonth();
  return {
    from: isoLocal(new Date(y, m, 1)),
    to: isoLocal(new Date(y, m + 1, 0)),
  };
}

export function dateOnlyUtc(isoDate: string) {
  return new Date(`${isoDate}T00:00:00.000Z`);
}

export function isoFromDbDate(d: Date) {
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}

/** Clamp payday to 1–28 so February never overflows. */
export function clampBudgetStartDay(day: number) {
  if (!Number.isFinite(day)) return 1;
  return Math.min(28, Math.max(1, Math.trunc(day)));
}

function localParts(d: Date) {
  return {
    year: d.getFullYear(),
    month: d.getMonth() + 1,
    day: d.getDate(),
  };
}

/** YYYY-MM key for the budget period containing `d` (start day of that calendar month). */
export function budgetMonthKey(d: Date, startDay: number) {
  const day = clampBudgetStartDay(startDay);
  if (day === 1) return monthKeyLocal(d);
  const { year, month, day: dom } = localParts(d);
  if (dom >= day) return `${year}-${pad2(month)}`;
  const prev = new Date(year, month - 2, 1);
  return monthKeyLocal(prev);
}

/** Budget period for a calendar date, or for a YYYY-MM period key. */
export function budgetMonthRange(
  dOrKey: Date | string = new Date(),
  startDay = 1,
) {
  const day = clampBudgetStartDay(startDay);
  if (typeof dOrKey === 'string') {
    const [y, m] = dOrKey.split('-').map(Number);
    if (day === 1) {
      return {
        key: dOrKey,
        from: `${y}-${pad2(m)}-01`,
        to: `${y}-${pad2(m)}-${pad2(daysInMonth(y, m))}`,
      };
    }
    const from = `${y}-${pad2(m)}-${pad2(day)}`;
    const end = new Date(y, m - 1 + 1, day - 1);
    return { key: dOrKey, from, to: isoLocal(end) };
  }
  const key = budgetMonthKey(dOrKey, day);
  return budgetMonthRange(key, day);
}

export function shiftBudgetMonthKey(key: string, dir: number) {
  const [y, m] = key.split('-').map(Number);
  return monthKeyLocal(new Date(y, m - 1 + dir, 1));
}

export function remainingDaysInBudgetMonth(d = new Date(), startDay = 1) {
  const { to } = budgetMonthRange(d, startDay);
  const [y, m, day] = to.split('-').map(Number);
  const end = new Date(y, m - 1, day);
  const startOfToday = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const ms = end.getTime() - startOfToday.getTime();
  return Math.max(0, Math.round(ms / 86_400_000));
}

/** Parts from a Prisma `@db.Date` (stored as UTC midnight). */
export function budgetMonthKeyFromDbDate(d: Date, startDay: number) {
  const local = new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  return budgetMonthKey(local, startDay);
}
