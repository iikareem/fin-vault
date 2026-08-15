export function pad2(n: number) {
  return String(n).padStart(2, '0');
}

export function isoLocal(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export function daysInMonth(year: number, month: number) {
  return new Date(year, month, 0).getDate();
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
