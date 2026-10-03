"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { BottomNav } from "@/components/BottomNav";
import { PageShell } from "@/components/PageShell";
import { Money } from "@/components/Money";
import { useI18n } from "@/components/I18nProvider";
import { useBooks } from "@/components/BooksProvider";
import { labelFor, categoryLabel, fill } from "@/lib/i18n";
import { useCalendarClock } from "@/hooks/useCalendarClock";
import {
  budgetMonthKey,
  budgetMonthRange,
  budgetWeekForDate,
  isoLocal,
  shiftBudgetWeek,
} from "@/lib/calendar";
import { householdPath } from "@/lib/space";
import { Hint } from "@/components/Hint";
import { DateField } from "@/components/DateField";

type Period = "day" | "week" | "month" | "year" | "range";
type DayRow = { day: string; income: number; expense: number };
type CatChild = {
  categoryId: string;
  name: string;
  nameAr?: string;
  emoji?: string;
  total: number;
};
type CatRow = {
  categoryId?: string;
  name: string;
  nameAr?: string;
  color: string;
  emoji?: string;
  type: string;
  total: number;
  kind?: "travel" | "category";
  children?: CatChild[];
};
type MemberRow = { name: string; type: string; total: number };
type SavingsMonth = {
  month: string;
  broughtForward: number;
  income: number;
  expense: number;
  saved: number;
  remaining: number;
};

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function iso(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function parseIso(day: string) {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function daysBetween(from: string, to: string) {
  const a = parseIso(from).getTime();
  const b = parseIso(to).getTime();
  return Math.max(0, Math.round((b - a) / 86400000) + 1);
}

function eachIsoDay(from: string, to: string) {
  const out: string[] = [];
  const cur = parseIso(from);
  const end = parseIso(to);
  while (cur <= end) {
    out.push(isoLocal(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return out;
}

function eachMonthKey(from: string, to: string) {
  const out: string[] = [];
  const cur = parseIso(from);
  cur.setDate(1);
  const end = parseIso(to);
  end.setDate(1);
  while (cur <= end) {
    out.push(`${cur.getFullYear()}-${pad(cur.getMonth() + 1)}`);
    cur.setMonth(cur.getMonth() + 1);
  }
  return out;
}

function rangeFor(period: Period, cursor: Date, startDay = 1) {
  const y = cursor.getFullYear();
  if (period === "day") {
    const day = isoLocal(cursor);
    return { from: day, to: day };
  }
  if (period === "week") {
    const week = budgetWeekForDate(cursor, startDay);
    return { from: week.from, to: week.to };
  }
  if (period === "month") {
    const range = budgetMonthRange(cursor, startDay);
    return { from: range.from, to: range.to };
  }
  if (period === "year") {
    return { from: `${y}-01-01`, to: `${y}-12-31` };
  }
  const range = budgetMonthRange(cursor, startDay);
  return { from: range.from, to: range.to };
}

function shift(
  period: Exclude<Period, "range">,
  cursor: Date,
  dir: number,
  startDay = 1,
) {
  if (period === "day") {
    const next = new Date(cursor);
    next.setDate(next.getDate() + dir);
    return next;
  }
  if (period === "week") {
    return shiftBudgetWeek(cursor, dir, startDay);
  }
  if (period === "month") {
    if (startDay === 1) {
      return new Date(cursor.getFullYear(), cursor.getMonth() + dir, 1);
    }
    const key = budgetMonthKey(cursor, startDay);
    const [y, m] = key.split("-").map(Number);
    return new Date(y, m - 1 + dir, startDay);
  }
  return new Date(cursor.getFullYear() + dir, 0, 1);
}

function weekRangeLabel(from: string, to: string, locale: string) {
  const loc = locale === "ar" ? "ar" : "en";
  const a = parseIso(from);
  const b = parseIso(to);
  const sameMonth = a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear();
  if (sameMonth) {
    return `${a.toLocaleDateString(loc, { day: "numeric" })} – ${b.toLocaleDateString(loc, {
      day: "numeric",
      month: "short",
    })}`;
  }
  return `${a.toLocaleDateString(loc, {
    day: "numeric",
    month: "short",
  })} – ${b.toLocaleDateString(loc, {
    day: "numeric",
    month: "short",
  })}`;
}

function monthLabel(key: string, locale: string) {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString(locale === "ar" ? "ar" : "en", {
    month: "long",
    year: "numeric",
  });
}

function CompareChip({
  current,
  previous,
  kind,
  label,
  t,
}: {
  current: number;
  previous: number;
  kind: "in" | "out";
  label: string;
  t: (key: "vsNew" | "vsFlat") => string;
}) {
  const diff = current - previous;
  const flat = Math.abs(diff) < 0.001;
  const up = diff > 0.001;
  // Income up is good; expense up is bad.
  const good = kind === "in" ? up : !up && !flat;
  const bad = kind === "in" ? !up && !flat : up;
  const pct =
    previous > 0.001 ? Math.round((diff / previous) * 100) : null;

  let text: string;
  if (flat) text = t("vsFlat");
  else if (previous < 0.001 && current > 0.001) text = t("vsNew");
  else if (pct != null) text = `${up ? "↑" : "↓"} ${Math.abs(pct)}%`;
  else text = `${up ? "↑" : "↓"}`;

  return (
    <span
      className={`mt-1 inline-flex max-w-full items-center rounded-full px-2 py-0.5 text-[11px] font-semibold leading-snug ${
        flat
          ? "bg-stone-100 text-stone-600"
          : good
            ? "bg-emerald-50 text-emerald-800"
            : bad
              ? "bg-red-50 text-red-800"
              : "bg-stone-100 text-stone-600"
      }`}
    >
      <span className="truncate">
        {text} · {label}
      </span>
    </span>
  );
}

export default function AnalyticsPage() {
  const { t, locale } = useI18n();
  const { active, house, budgetMonthStartDay } = useBooks();
  const startDay = active?.kind === "PERSONAL" ? budgetMonthStartDay : 1;
  const cal = useCalendarClock(startDay);
  const [period, setPeriod] = useState<Period>("month");
  const [cursor, setCursor] = useState(() => new Date());
  const [rangeFrom, setRangeFrom] = useState(() => {
    const now = new Date();
    return budgetMonthRange(now, 1).from;
  });
  const [rangeTo, setRangeTo] = useState(() => isoLocal(new Date()));
  const [days, setDays] = useState<DayRow[]>([]);
  const [prevIn, setPrevIn] = useState<number | null>(null);
  const [prevOut, setPrevOut] = useState<number | null>(null);
  const [cats, setCats] = useState<CatRow[]>([]);
  const [excludeCommitments, setExcludeCommitments] = useState(false);
  const [selectedGroups, setSelectedGroups] = useState<string[]>([]);
  const [expandedSubs, setExpandedSubs] = useState<string[]>([]);
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [savingsMonths, setSavingsMonths] = useState<SavingsMonth[]>([]);
  const [savingsOpening, setSavingsOpening] = useState(0);
  const [selectedBarKey, setSelectedBarKey] = useState<string | null>(null);
  const [error, setError] = useState("");
  const currency = active?.currency ?? "EGP";
  const hideAggregates = active?.kind === "HOUSE" && house?.role !== "ADMIN";

  const { from, to } = useMemo(() => {
    if (period === "range") {
      const end = rangeTo >= rangeFrom ? rangeTo : rangeFrom;
      return { from: rangeFrom, to: end };
    }
    return rangeFor(period, cursor, startDay);
  }, [period, cursor, rangeFrom, rangeTo, startDay]);

  const chartByMonth = period === "year" || (period === "range" && daysBetween(from, to) > 62);

  useEffect(() => {
    setCursor(new Date(cal.year, cal.month - 1, cal.day));
  }, [cal.monthKey]);

  useEffect(() => {
    if (period !== "range") return;
    const bounds = budgetMonthRange(new Date(), startDay);
    setRangeFrom(bounds.from);
  }, [startDay]);

  useEffect(() => {
    if (!active) return;
    const id = active.householdId;
    const q = new URLSearchParams({ from, to });
    const catQ = new URLSearchParams({ from, to });
    if (excludeCommitments) catQ.set("excludeCommitments", "1");
    Promise.all([
      api<DayRow[]>(householdPath(id, `/analytics/by-day?${q}`)),
      api<CatRow[]>(householdPath(id, `/analytics/by-category?${catQ}`)),
      api<MemberRow[]>(householdPath(id, `/analytics/by-member?${q}`)),
      api<{ opening: number; months: SavingsMonth[] }>(
        householdPath(id, "/analytics/savings"),
      ),
    ])
      .then(([d, c, m, s]) => {
        setDays(d);
        setCats(c.filter((x) => x.type === "EXPENSE"));
        setSelectedGroups([]);
        setExpandedSubs([]);
        setMembers(m);
        setSavingsOpening(s.opening);
        setSavingsMonths(s.months);
      })
      .catch((e) => setError(e.message));
  }, [active?.householdId, from, to, excludeCommitments]);

  useEffect(() => {
    if (!active || period === "range") {
      setPrevIn(null);
      setPrevOut(null);
      return;
    }
    const prevCursor = shift(period, cursor, -1, startDay);
    const prev = rangeFor(period, prevCursor, startDay);
    const q = `from=${prev.from}&to=${prev.to}`;
    let cancelled = false;
    api<DayRow[]>(
      householdPath(active.householdId, `/analytics/by-day?${q}`),
    )
      .then((rows) => {
        if (cancelled) return;
        setPrevIn(rows.reduce((s, d) => s + d.income, 0));
        setPrevOut(rows.reduce((s, d) => s + d.expense, 0));
      })
      .catch(() => {
        if (!cancelled) {
          setPrevIn(null);
          setPrevOut(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [active?.householdId, period, cursor, startDay]);

  function catKey(c: CatRow) {
    return c.categoryId ?? c.name;
  }

  const selectedSet = useMemo(() => new Set(selectedGroups), [selectedGroups]);
  const selectionActive = selectedGroups.length > 0;

  const selectedCats = useMemo(() => {
    if (!selectionActive) return [];
    return cats.filter((c) => selectedSet.has(catKey(c)));
  }, [cats, selectedSet, selectionActive]);

  const selectedTotal = useMemo(
    () => selectedCats.reduce((s, c) => s + c.total, 0),
    [selectedCats],
  );

  const maxCat = Math.max(1, ...cats.map((c) => c.total));

  function toggleGroup(key: string) {
    setSelectedGroups((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key],
    );
  }

  function unselectGroup(key: string) {
    setSelectedGroups((prev) => prev.filter((k) => k !== key));
  }

  function pickTop(n: number) {
    setSelectedGroups(cats.slice(0, n).map(catKey));
  }

  const months = useMemo(() => {
    const map = new Map<string, { key: string; income: number; expense: number }>();
    for (const d of days) {
      const key = d.day.slice(0, 7);
      const cur = map.get(key) ?? { key, income: 0, expense: 0 };
      cur.income += d.income;
      cur.expense += d.expense;
      map.set(key, cur);
    }
    return [...map.values()];
  }, [days]);

  const totalIn = days.reduce((s, d) => s + d.income, 0);
  const dayOut = days.reduce((s, d) => s + d.expense, 0);
  const catOut = cats.reduce((s, c) => s + c.total, 0);
  // When commitment payments are excluded, category totals are the period base.
  const totalOut = excludeCommitments ? catOut : dayOut || catOut;

  const compareLabel =
    period === "month"
      ? t("vsLastMonth")
      : period === "week"
        ? t("vsLastWeek")
        : period === "day"
          ? t("vsYesterday")
          : period === "year"
            ? t("vsLastYear")
            : "";

  type ChartBar = {
    key: string;
    expense: number;
    label: string;
    detailLabel: string;
    weekend?: boolean;
    dayNum?: number;
  };

  const chartBars = useMemo((): ChartBar[] => {
    const loc = locale === "ar" ? "ar" : "en";
    if (
      period === "week" ||
      period === "month" ||
      (period === "range" && !chartByMonth)
    ) {
      const dayKeys =
        period === "month"
          ? (() => {
              const y = cursor.getFullYear();
              const m = cursor.getMonth();
              const daysInMonth = new Date(y, m + 1, 0).getDate();
              return Array.from(
                { length: daysInMonth },
                (_, i) => `${y}-${pad(m + 1)}-${pad(i + 1)}`,
              );
            })()
          : eachIsoDay(from, to);
      const byDay = new Map(days.map((d) => [d.day, d.expense]));
      return dayKeys.map((key) => {
        const date = parseIso(key);
        const weekday = date.getDay();
        return {
          key,
          expense: byDay.get(key) ?? 0,
          label: String(date.getDate()),
          detailLabel: date.toLocaleDateString(loc, {
            weekday: "long",
            day: "numeric",
            month: "short",
          }),
          weekend: weekday === 0 || weekday === 5 || weekday === 6,
          dayNum: date.getDate(),
        };
      });
    }
    if (period === "year" || (period === "range" && chartByMonth)) {
      const monthKeys =
        period === "year"
          ? Array.from(
              { length: 12 },
              (_, i) => `${cursor.getFullYear()}-${pad(i + 1)}`,
            )
          : eachMonthKey(from, to);
      const byMonth = new Map(months.map((m) => [m.key, m.expense]));
      return monthKeys.map((key, i) => {
        const [, m] = key.split("-").map(Number);
        return {
          key,
          expense: byMonth.get(key) ?? 0,
          label: String(m),
          detailLabel: monthLabel(key, locale),
          dayNum: i + 1,
        };
      });
    }
    return [];
  }, [period, cursor, days, months, locale, from, to, chartByMonth]);

  const activeBars = useMemo(
    () => chartBars.filter((b) => b.expense > 0.001),
    [chartBars],
  );
  const peakBar = useMemo(
    () =>
      activeBars.length === 0
        ? null
        : activeBars.reduce((best, b) =>
            b.expense > best.expense ? b : best,
          ),
    [activeBars],
  );
  const avgSpend = useMemo(
    () =>
      activeBars.length === 0
        ? 0
        : activeBars.reduce((s, b) => s + b.expense, 0) / activeBars.length,
    [activeBars],
  );
  const maxBar = Math.max(1, ...chartBars.map((b) => b.expense));
  const avgLinePct =
    avgSpend > 0.001 ? Math.min(92, Math.max(10, (avgSpend / maxBar) * 100)) : 0;

  useEffect(() => {
    if (chartBars.length === 0) {
      setSelectedBarKey(null);
      return;
    }
    setSelectedBarKey((prev) => {
      if (prev && chartBars.some((b) => b.key === prev)) return prev;
      const todayIso = isoLocal(new Date());
      if (chartBars.some((b) => b.key === todayIso)) return todayIso;
      if (peakBar) return peakBar.key;
      return chartBars[0].key;
    });
  }, [chartBars, peakBar]);

  const selectedBar =
    chartBars.find((b) => b.key === selectedBarKey) ?? peakBar ?? null;
  const chartTotal = chartBars.reduce((s, b) => s + b.expense, 0);
  const selectedShare =
    selectedBar && chartTotal > 0.001
      ? Math.round((selectedBar.expense / chartTotal) * 100)
      : 0;
  const todayIso = isoLocal(new Date());
  const selectedIndex = selectedBar
    ? chartBars.findIndex((b) => b.key === selectedBar.key)
    : -1;

  function selectChartOffset(dir: number) {
    if (chartBars.length === 0 || selectedIndex < 0) return;
    const next = Math.min(
      chartBars.length - 1,
      Math.max(0, selectedIndex + dir),
    );
    setSelectedBarKey(chartBars[next].key);
  }

  function onChartBarClick(key: string) {
    setSelectedBarKey(key);
  }

  function setPeriodMode(next: Period) {
    if (next === "range") {
      if (period === "month" || period === "week" || period === "day") {
        const bounds = rangeFor(
          period === "day" ? "month" : period,
          cursor,
          startDay,
        );
        setRangeFrom(bounds.from);
        setRangeTo(period === "day" ? iso(cursor) : bounds.to);
      } else if (period === "year") {
        setRangeFrom(`${cursor.getFullYear()}-01-01`);
        setRangeTo(`${cursor.getFullYear()}-12-31`);
      }
    }
    setPeriod(next);
  }

  const activeWeek =
    period === "week" ? budgetWeekForDate(cursor, startDay) : null;
  const weekInProgress =
    activeWeek != null &&
    todayIso >= activeWeek.from &&
    todayIso <= activeWeek.to;
  const monthKey = budgetMonthKey(cursor, startDay);
  const yearKey = String(cursor.getFullYear());
  const yearSavings = savingsMonths.filter((m) => m.month.startsWith(yearKey));
  const prior = [...savingsMonths].filter((m) => m.month < monthKey).at(-1);
  const monthSavings = savingsMonths.find((m) => m.month === monthKey) ?? {
    month: monthKey,
    broughtForward: prior?.remaining ?? savingsOpening,
    income: 0,
    expense: 0,
    saved: 0,
    remaining: prior?.remaining ?? savingsOpening,
  };
  const maxSaved = Math.max(
    1,
    ...yearSavings.map((m) => Math.abs(m.saved)),
  );

  return (
    <PageShell>
      <h1 className="page-title">📊 {t("navCharts")}</h1>
      <Hint>{t("chartsHint")}</Hint>
      <div className="seg mt-3 grid w-full min-w-0 grid-cols-5">
        {(["day", "week", "month", "year", "range"] as Period[]).map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => setPeriodMode(p)}
            className={`min-w-0 rounded-xl px-0.5 py-2 text-center text-[11px] font-bold transition sm:px-1 sm:text-sm ${
              period === p
                ? "bg-[var(--surface-bg)] text-[var(--foreground)] shadow-sm"
                : "text-[var(--muted)]"
            }`}
          >
            {p === "day"
              ? t("periodDay")
              : p === "week"
                ? t("periodWeek")
                : p === "month"
                  ? t("periodMonth")
                  : p === "year"
                    ? t("periodYear")
                    : t("customRange")}
          </button>
        ))}
      </div>
      {period === "range" ? (
        <div className="period-range mt-3 space-y-2">
          <DateField
            label={t("fromDate")}
            value={rangeFrom}
            max={rangeTo}
            onChange={setRangeFrom}
          />
          <div className="flex justify-center" aria-hidden>
            <span className="text-sm font-semibold text-[var(--muted)]">↓</span>
          </div>
          <DateField
            label={t("toDate")}
            value={rangeTo}
            min={rangeFrom}
            onChange={setRangeTo}
          />
        </div>
      ) : (
        <div className="mt-3 flex items-center gap-2">
          <button
            type="button"
            className="icon-btn shrink-0 !min-h-11 !min-w-11 px-3 text-xl sm:px-4"
            onClick={() => setCursor((c) => shift(period, c, -1, startDay))}
          >
            ‹
          </button>
          <div className="min-w-0 flex-1">
            {period === "day" ? (
              <DateField
                align="center"
                value={iso(cursor)}
                onChange={(v) => setCursor(new Date(`${v}T12:00:00`))}
              />
            ) : period === "week" && activeWeek ? (
              <div className="field flex min-h-[2.75rem] w-full flex-col items-center justify-center gap-0.5 !py-1">
                <span className="text-sm font-semibold leading-tight sm:text-base">
                  {fill(t("weekOfMonth"), { n: String(activeWeek.index) })}
                </span>
                <span
                  className="text-[11px] font-medium tabular-nums text-[var(--muted)] sm:text-xs"
                  dir="ltr"
                >
                  {weekRangeLabel(activeWeek.from, activeWeek.to, locale)}
                </span>
              </div>
            ) : period === "month" ? (
              <DateField
                type="month"
                align="center"
                value={budgetMonthKey(cursor, startDay)}
                onChange={(v) => {
                  if (startDay === 1) {
                    setCursor(new Date(`${v}-01T12:00:00`));
                    return;
                  }
                  const [y, m] = v.split("-").map(Number);
                  setCursor(new Date(y, m - 1, startDay));
                }}
              />
            ) : (
              <label className="block min-w-0">
                <span className="field relative flex min-h-[2.75rem] w-full items-center justify-center overflow-hidden !py-0">
                  <span
                    className="px-2 text-center text-base font-semibold tabular-nums sm:text-lg"
                    dir="ltr"
                  >
                    {cursor.getFullYear()}
                  </span>
                  <input
                    type="number"
                    value={cursor.getFullYear()}
                    min={2000}
                    max={2100}
                    onChange={(e) => {
                      const y = Number(e.target.value);
                      if (y) setCursor(new Date(y, 0, 1));
                    }}
                    className="absolute inset-0 z-10 cursor-pointer opacity-0"
                    aria-label={t("periodYear")}
                  />
                </span>
              </label>
            )}
          </div>
          <button
            type="button"
            className="icon-btn shrink-0 !min-h-11 !min-w-11 px-3 text-xl sm:px-4"
            onClick={() => setCursor((c) => shift(period, c, 1, startDay))}
          >
            ›
          </button>
        </div>
      )}
      {period === "week" && weekInProgress ? (
        <p className="mt-1.5 text-center text-xs text-[var(--muted)]">
          {t("weekSoFar")}
        </p>
      ) : null}
      {period === "month" && startDay !== 1 ? (
        <p className="mt-1.5 text-center text-xs text-[var(--muted)]" dir="ltr">
          {from} → {to}
        </p>
      ) : null}
      {error ? <p className="mt-2 text-red-700">{error}</p> : null}

      <section className="surface mt-3 overflow-hidden rounded-2xl">
        {hideAggregates ? (
          <p className="px-3.5 py-3 text-sm text-stone-500">
            {t("aggregatesAdminOnly")}
          </p>
        ) : (
          <>
            <div className="grid grid-cols-2 divide-x divide-[var(--surface-border)] rtl:divide-x-reverse">
              <div className="flex flex-col px-3.5 py-3">
                <p className="text-xs text-[var(--muted)]">{t("periodTotalIn")}</p>
                <p className="mt-0.5 text-lg font-semibold leading-tight text-emerald-800 sm:text-xl">
                  <Money amount={totalIn} currency={currency} locale={locale} />
                </p>
                {prevIn != null && compareLabel ? (
                  <CompareChip
                    current={totalIn}
                    previous={prevIn}
                    kind="in"
                    label={compareLabel}
                    t={t}
                  />
                ) : null}
              </div>
              <div className="flex flex-col px-3.5 py-3">
                <p className="text-xs text-[var(--muted)]">{t("periodTotalOut")}</p>
                <p className="mt-0.5 text-lg font-semibold leading-tight text-red-800 sm:text-xl">
                  <Money amount={totalOut} currency={currency} locale={locale} />
                </p>
                {prevOut != null && compareLabel ? (
                  <CompareChip
                    current={totalOut}
                    previous={prevOut}
                    kind="out"
                    label={compareLabel}
                    t={t}
                  />
                ) : null}
              </div>
            </div>

            {period === "month" ? (
              <div className="border-t border-[var(--surface-border)] px-3.5 py-3">
                <div className="flex items-baseline justify-between gap-2">
                  <h2 className="text-sm font-semibold">{t("savingsTitle")}</h2>
                  <span
                    className={`text-sm font-semibold tabular-nums ${
                      monthSavings.saved < 0 ? "text-red-800" : "text-emerald-800"
                    }`}
                  >
                    <Money
                      amount={monthSavings.saved}
                      currency={currency}
                      locale={locale}
                    />
                  </span>
                </div>
                <p className="mt-0.5 text-[11px] text-[var(--muted)]">
                  {monthSavings.saved < 0
                    ? t("usedFromSavings")
                    : t("savedInMonth")}
                </p>
                <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                  <p className="flex min-w-0 items-baseline justify-between gap-2">
                    <span className="truncate text-[var(--muted)]" dir="auto">
                      {t("broughtFromBefore")}
                    </span>
                    <span className="shrink-0 font-medium tabular-nums">
                      <Money
                        amount={monthSavings.broughtForward}
                        currency={currency}
                        locale={locale}
                      />
                    </span>
                  </p>
                  <p className="flex min-w-0 items-baseline justify-between gap-2">
                    <span className="truncate text-[var(--muted)]" dir="auto">
                      {t("goesToNextMonth")}
                    </span>
                    <span className="shrink-0 font-medium tabular-nums">
                      <Money
                        amount={monthSavings.remaining}
                        currency={currency}
                        locale={locale}
                      />
                    </span>
                  </p>
                </div>
              </div>
            ) : null}
          </>
        )}
      </section>

      {period === "year" && !hideAggregates ? (
        <section className="surface mt-3 overflow-hidden rounded-2xl">
          <div className="flex items-center justify-between gap-2 px-3.5 py-2.5">
            <h2 className="text-sm font-semibold">{t("savedByMonth")}</h2>
          </div>
          {yearSavings.length === 0 ? (
            <p className="border-t border-[var(--surface-border)] px-3.5 py-3 text-sm text-stone-500">
              {t("noPeriodData")}
            </p>
          ) : (
            <div className="divide-y divide-[var(--surface-border)] border-t border-[var(--surface-border)]">
              {yearSavings.map((row) => (
                <button
                  key={row.month}
                  type="button"
                  className="flex w-full items-center gap-3 px-3.5 py-2 text-start transition hover:bg-[var(--panel-soft)] active:scale-[0.99]"
                  onClick={() => {
                    const [y, m] = row.month.split("-").map(Number);
                    setCursor(new Date(y, m - 1, 1));
                    setPeriod("month");
                  }}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2 text-sm">
                      <span className="truncate font-medium">
                        {monthLabel(row.month, locale)}
                      </span>
                      <span
                        className={`shrink-0 tabular-nums ${
                          row.saved < 0 ? "text-red-800" : "text-emerald-800"
                        }`}
                      >
                        <Money
                          amount={row.saved}
                          currency={currency}
                          locale={locale}
                        />
                      </span>
                    </div>
                    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-stone-200">
                      <div
                        className={`h-full rounded-full ${
                          row.saved < 0 ? "bg-red-700" : "bg-emerald-700"
                        }`}
                        style={{
                          width: `${(Math.abs(row.saved) / maxSaved) * 100}%`,
                        }}
                      />
                    </div>
                  </div>
                  <span className="shrink-0 text-[11px] tabular-nums text-[var(--muted)]">
                    <Money
                      amount={row.remaining}
                      currency={currency}
                      locale={locale}
                    />
                  </span>
                </button>
              ))}
            </div>
          )}
        </section>
      ) : null}

      {period !== "day" ? (
        <>
          <h2 className="mt-8 text-xl font-semibold">
            {chartByMonth ? t("spendByMonth") : t("spendByDay")}
          </h2>
          <section className="surface spend-chart mt-3 overflow-hidden rounded-[1.75rem] p-4">
            {chartBars.length === 0 ? (
              <p className="text-[var(--muted)]">{t("noPeriodData")}</p>
            ) : (
              <>
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate text-sm text-[var(--muted)]">
                        {selectedBar?.detailLabel ??
                          (chartByMonth
                            ? t("spendByMonth")
                            : t("spendByDay"))}
                      </p>
                      {selectedBar?.key === todayIso ? (
                        <span className="rounded-full bg-[var(--accent-b-soft)] px-2 py-0.5 text-[10px] font-semibold text-[var(--accent-b-text)]">
                          {t("today")}
                        </span>
                      ) : null}
                      {selectedBar &&
                      peakBar?.key === selectedBar.key &&
                      selectedBar.expense > 0.001 ? (
                        <span className="rounded-full bg-[var(--soft-amber)] px-2 py-0.5 text-[10px] font-semibold text-amber-800">
                          {chartByMonth ? t("peakMonth") : t("peakSpend")}
                        </span>
                      ) : null}
                    </div>
                    <p
                      className={`mt-1 text-[1.75rem] font-bold leading-none tracking-tight tabular-nums ${
                        (selectedBar?.expense ?? 0) > 0.001
                          ? "text-red-800"
                          : "text-[var(--foreground)]"
                      }`}
                    >
                      {hideAggregates ? (
                        "••••"
                      ) : (
                        <Money
                          amount={selectedBar?.expense ?? 0}
                          currency={currency}
                          locale={locale}
                        />
                      )}
                    </p>
                    {!hideAggregates &&
                    selectedBar &&
                    selectedBar.expense > 0.001 &&
                    selectedShare > 0 ? (
                      <p className="mt-1.5 text-xs text-[var(--muted)]">
                        {t("ofPeriod", { pct: String(selectedShare) })}
                      </p>
                    ) : null}
                  </div>

                  {!hideAggregates ? (
                    <div className="flex shrink-0 gap-1">
                      <button
                        type="button"
                        className="icon-btn px-3 text-lg"
                        disabled={selectedIndex <= 0}
                        onClick={() => selectChartOffset(-1)}
                        aria-label="prev"
                      >
                        ‹
                      </button>
                      <button
                        type="button"
                        className="icon-btn px-3 text-lg"
                        disabled={
                          selectedIndex < 0 ||
                          selectedIndex >= chartBars.length - 1
                        }
                        onClick={() => selectChartOffset(1)}
                        aria-label="next"
                      >
                        ›
                      </button>
                    </div>
                  ) : null}
                </div>

                <div className="spend-chart-well mt-4 rounded-2xl px-2 pb-2 pt-3">
                  <div className="relative h-36">
                    <div className="pointer-events-none absolute inset-x-1 bottom-0 h-px bg-[var(--input-border)] opacity-70" />
                    {avgLinePct > 0 && !hideAggregates ? (
                      <div
                        className="pointer-events-none absolute inset-x-1 z-[1] flex items-center gap-1.5"
                        style={{ bottom: `${avgLinePct}%` }}
                      >
                        <span className="h-px flex-1 border-t border-dashed border-[var(--accent-b)] opacity-40" />
                        <span className="rounded-full bg-[var(--panel-soft)] px-1.5 py-0.5 text-[9px] font-semibold text-[var(--accent-b-text)]">
                          {t("avgSpend")}
                        </span>
                      </div>
                    ) : null}

                    <div
                      className={`absolute inset-0 flex items-end px-0.5 ${
                        chartByMonth ? "gap-1.5" : "gap-[3px]"
                      }`}
                    >
                      {chartBars.map((b) => {
                        const selected = b.key === selectedBarKey;
                        const hasSpend = b.expense > 0.001;
                        const isToday = b.key === todayIso;
                        const pct = hideAggregates
                          ? 18
                          : hasSpend
                            ? Math.max(12, (b.expense / maxBar) * 100)
                            : 5;
                        const isPeak = peakBar?.key === b.key && hasSpend;
                        return (
                          <button
                            key={b.key}
                            type="button"
                            aria-pressed={selected}
                            aria-label={b.detailLabel}
                            onClick={() => onChartBarClick(b.key)}
                            className="group relative flex h-full min-w-0 flex-1 items-end justify-center"
                          >
                            {isToday ? (
                              <span className="pointer-events-none absolute inset-x-[15%] bottom-0 top-0 rounded-md bg-[var(--accent-b)] opacity-[0.07]" />
                            ) : null}
                            <span
                              className={`spend-bar relative z-[1] block w-full ${
                                chartByMonth
                                  ? "max-w-[2rem]"
                                  : "max-w-[24px]"
                              } ${
                                selected
                                  ? "spend-bar-selected"
                                  : isPeak
                                    ? "spend-bar-peak"
                                    : hasSpend
                                      ? b.weekend
                                        ? "spend-bar-weekend"
                                        : "spend-bar-active"
                                      : "spend-bar-empty"
                              }`}
                              style={{ height: `${pct}%` }}
                            />
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div
                    className={`mt-2 flex ${
                      chartByMonth ? "gap-1.5" : "gap-[3px]"
                    }`}
                  >
                    {chartBars.map((b, i) => {
                      const selected = b.key === selectedBarKey;
                      const n = chartBars.length;
                      // Fixed ticks only — never reveal extra labels on select
                      // (that caused flicker / overlap on mobile).
                      const showLabel = chartByMonth
                        ? n <= 12
                          ? true
                          : i === 0 ||
                            i === n - 1 ||
                            (b.dayNum != null && b.dayNum % 2 === 1)
                        : period === "week"
                          ? true
                          : period === "month"
                            ? b.dayNum === 1 ||
                              b.dayNum === n ||
                              (b.dayNum != null &&
                                (b.dayNum === 8 ||
                                  b.dayNum === 15 ||
                                  b.dayNum === 22))
                            : i === 0 ||
                              i === n - 1 ||
                              i % (n > 45 ? 7 : 5) === 0;
                      return (
                        <button
                          key={`lbl-${b.key}`}
                          type="button"
                          tabIndex={-1}
                          aria-hidden
                          onClick={() => onChartBarClick(b.key)}
                          className={`min-w-0 flex-1 text-center leading-none tabular-nums ${
                            chartByMonth ? "text-[10px]" : "text-[9px]"
                          } ${
                            !showLabel
                              ? "invisible"
                              : selected
                                ? "font-semibold text-[var(--foreground)]"
                                : "text-[var(--muted)]"
                          }`}
                        >
                          {b.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="mt-3 grid grid-cols-3 gap-1.5">
                  <button
                    type="button"
                    className="rounded-2xl bg-[var(--panel-soft)] px-2 py-2.5 text-center transition active:scale-[0.98]"
                    onClick={() => {
                      if (peakBar) onChartBarClick(peakBar.key);
                    }}
                  >
                    <p className="text-[10px] text-[var(--muted)]">
                      {chartByMonth ? t("peakMonth") : t("peakSpend")}
                    </p>
                    <p className="mt-0.5 text-sm font-semibold tabular-nums">
                      {hideAggregates ? (
                        "••••"
                      ) : peakBar ? (
                        <Money
                          amount={peakBar.expense}
                          currency={currency}
                          locale={locale}
                        />
                      ) : (
                        "—"
                      )}
                    </p>
                  </button>
                  <div className="rounded-2xl bg-[var(--panel-soft)] px-2 py-2.5 text-center">
                    <p className="text-[10px] text-[var(--muted)]">
                      {t("avgSpend")}
                    </p>
                    <p className="mt-0.5 text-sm font-semibold tabular-nums">
                      {hideAggregates ? (
                        "••••"
                      ) : (
                        <Money
                          amount={avgSpend}
                          currency={currency}
                          locale={locale}
                        />
                      )}
                    </p>
                  </div>
                  <div className="rounded-2xl bg-[var(--panel-soft)] px-2 py-2.5 text-center">
                    <p className="text-[10px] text-[var(--muted)]">
                      {chartByMonth
                        ? t("monthsWithSpend")
                        : t("daysWithSpend")}
                    </p>
                    <p className="mt-0.5 text-sm font-semibold tabular-nums">
                      {hideAggregates ? "••••" : activeBars.length}
                    </p>
                  </div>
                </div>
              </>
            )}
          </section>
        </>
      ) : null}

      <h2 className="mt-8 text-xl font-semibold">{t("spendExplorer")}</h2>
      <Hint>{t("pickGroupsHint")}</Hint>

      {cats.length > 0 ? (
        <section className="surface mt-3 overflow-hidden rounded-[1.75rem]">
          <div className="border-b border-[var(--surface-border)] px-4 py-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-semibold">{t("pickGroups")}</p>
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => pickTop(3)}
                  disabled={cats.length === 0}
                  className="rounded-full bg-[var(--panel-soft)] px-3 py-1.5 text-sm font-semibold"
                >
                  {t("topThreeGroups")}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedGroups(cats.map(catKey));
                  }}
                  disabled={cats.length === 0}
                  className="rounded-full bg-[var(--panel-soft)] px-3 py-1.5 text-sm font-semibold"
                >
                  {t("selectAllGroups")}
                </button>
                <button
                  type="button"
                  aria-pressed={excludeCommitments}
                  onClick={() => setExcludeCommitments((v) => !v)}
                  className={`rounded-full px-3 py-1.5 text-sm font-semibold ${
                    excludeCommitments
                      ? "bg-[var(--accent-b)] text-[var(--accent-b-fg)]"
                      : "bg-[var(--panel-soft)]"
                  }`}
                  title={t("withoutCommitmentsHint")}
                >
                  {t("withoutCommitments")}
                </button>
                {selectionActive ? (
                  <button
                    type="button"
                    onClick={() => setSelectedGroups([])}
                    className="rounded-full bg-[var(--panel-soft)] px-3 py-1.5 text-sm font-semibold text-red-800"
                  >
                    {t("clearSelection")}
                  </button>
                ) : null}
              </div>
            </div>
            {excludeCommitments ? (
              <p className="mt-2 text-xs leading-snug text-[var(--muted)]">
                {t("withoutCommitmentsHint")}
              </p>
            ) : null}

            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
              {cats.length === 0 ? (
                <p className="col-span-full text-sm text-[var(--muted)]">
                  {t("noPeriodData")}
                </p>
              ) : (
                cats.map((c) => {
                  const key = catKey(c);
                  const on = selectedSet.has(key);
                  const shareBase =
                    selectionActive && on && selectedTotal > 0
                      ? selectedTotal
                      : totalOut;
                  const pct =
                    shareBase > 0 ? Math.round((c.total / shareBase) * 100) : 0;
                  const barPct = hideAggregates
                    ? 0
                    : Math.max(8, Math.round((c.total / maxCat) * 100));
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => toggleGroup(key)}
                      aria-pressed={on}
                      className={`relative flex min-h-[5.5rem] flex-col overflow-hidden rounded-2xl border p-2.5 text-start transition ${
                        on
                          ? "border-transparent bg-[var(--panel-soft)]"
                          : "border-[var(--input-border)] bg-[var(--surface-bg)]"
                      }`}
                      style={
                        on
                          ? { boxShadow: `0 0 0 2px ${c.color}` }
                          : undefined
                      }
                    >
                      <span
                        className="absolute inset-x-0 top-0 h-1.5"
                        style={{
                          background: `linear-gradient(90deg, ${c.color} ${barPct}%, rgb(0 0 0 / 0.06) ${barPct}%)`,
                          opacity: on ? 1 : 0.7,
                        }}
                        aria-hidden
                      />
                      <span className="mt-1.5 flex items-start justify-between gap-1.5">
                        <span className="line-clamp-2 min-w-0 text-sm font-bold leading-snug">
                          {categoryLabel(c, locale, t)}
                        </span>
                        <span
                          className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
                            on
                              ? "text-white"
                              : "border border-[var(--input-border)] text-transparent"
                          }`}
                          style={on ? { background: c.color } : undefined}
                          aria-hidden
                        >
                          ✓
                        </span>
                      </span>
                      <span className="mt-auto pt-2">
                        <span className="block text-sm font-semibold tabular-nums">
                          {hideAggregates ? (
                            "••••"
                          ) : (
                            <Money
                              amount={c.total}
                              currency={currency}
                              locale={locale}
                            />
                          )}
                        </span>
                        {!hideAggregates && pct > 0 ? (
                          <span className="mt-0.5 block text-[11px] text-[var(--muted)]">
                            {selectionActive && on
                              ? t("ofSelection", { pct: String(pct) })
                              : t("ofPeriod", { pct: String(pct) })}
                          </span>
                        ) : null}
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          <div className="px-4 py-4">
            {selectionActive ? (
              <div className="rounded-2xl bg-[var(--panel-soft)] px-4 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm text-[var(--muted)]">
                        {t("nGroupsSelected", {
                          n: String(selectedGroups.length),
                        })}
                      </p>
                      <p className="mt-0.5 text-sm font-medium">
                        {t("selectedSpend")}
                      </p>
                      <p className="mt-1 text-3xl font-bold tracking-tight text-red-800">
                        {hideAggregates ? (
                          "••••"
                        ) : (
                          <Money
                            amount={selectedTotal}
                            currency={currency}
                            locale={locale}
                          />
                        )}
                      </p>
                    </div>
                    {!hideAggregates && totalOut > 0 ? (
                      <div className="rounded-2xl bg-[var(--surface-bg)] px-3 py-2 text-center">
                        <p className="text-2xl font-bold text-red-800">
                          {Math.round((selectedTotal / totalOut) * 100)}%
                        </p>
                        <p className="text-xs text-[var(--muted)]">
                          {t("periodShareLabel")}
                        </p>
                      </div>
                    ) : null}
                  </div>

                  {!hideAggregates && selectedTotal > 0 ? (
                    <div className="mt-3">
                      <p className="mb-1.5 text-xs font-medium text-[var(--muted)]">
                        {t("spendComposition")}
                      </p>
                      <div className="flex h-3 overflow-hidden rounded-full bg-[var(--surface-bg)]">
                        {selectedCats.map((c) => (
                          <div
                            key={catKey(c)}
                            title={categoryLabel(c, locale, t)}
                            style={{
                              width: `${(c.total / selectedTotal) * 100}%`,
                              background: c.color,
                            }}
                          />
                        ))}
                      </div>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {selectedCats.map((c) => (
                          <button
                            key={catKey(c)}
                            type="button"
                            onClick={() => unselectGroup(catKey(c))}
                            className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-[var(--surface-bg)] px-2.5 py-1 text-xs font-medium"
                          >
                            <span
                              className="inline-flex h-4 w-4 shrink-0 items-center justify-center text-[10px] leading-none"
                              style={
                                c.emoji
                                  ? undefined
                                  : { background: c.color, borderRadius: 999 }
                              }
                              aria-hidden
                            >
                              {c.emoji || null}
                            </span>
                            <span className="min-w-0 truncate">
                              {categoryLabel(c, locale, t)}
                            </span>
                            <span className="shrink-0 text-[var(--muted)]">
                              {Math.round((c.total / selectedTotal) * 100)}%
                            </span>
                            <span className="shrink-0 text-[var(--muted)]" aria-hidden>
                              ×
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  {!hideAggregates &&
                  selectedCats.some(
                    (c) => (c.children?.length ?? 0) > 0,
                  ) ? (
                    <div className="mt-4 space-y-2.5">
                      <p className="text-xs font-medium text-[var(--muted)]">
                        {t("selectionBreakdown")}
                      </p>
                      {[...selectedCats]
                        .sort((a, b) => b.total - a.total)
                        .map((group) => {
                          const kids = group.children ?? [];
                          const gKey = catKey(group);
                          const groupShare =
                            selectedTotal > 0
                              ? Math.round((group.total / selectedTotal) * 100)
                              : 0;
                          const expanded = expandedSubs.includes(gKey);
                          const visible = expanded ? kids : kids.slice(0, 4);
                          const maxKid = Math.max(
                            1,
                            ...kids.map((k) => k.total),
                          );
                          const hasRealSubs = kids.some(
                            (k) => k.categoryId !== group.categoryId,
                          );

                          return (
                            <div
                              key={gKey}
                              className="overflow-hidden rounded-2xl bg-[var(--surface-bg)]"
                            >
                              <div className="flex items-stretch">
                                <span
                                  className="w-1.5 shrink-0"
                                  style={{ background: group.color }}
                                  aria-hidden
                                />
                                <div className="min-w-0 flex-1 px-3 py-2.5">
                                  <div className="flex items-start justify-between gap-2">
                                    <div className="min-w-0">
                                      <p className="truncate text-sm font-bold">
                                        {group.emoji ? `${group.emoji} ` : ""}
                                        {categoryLabel(group, locale, t)}
                                      </p>
                                      <p className="mt-0.5 text-xs text-[var(--muted)]">
                                        {fill(t("ofSelection"), {
                                          pct: String(groupShare),
                                        })}
                                      </p>
                                    </div>
                                    <p className="shrink-0 text-sm font-semibold tabular-nums text-red-800">
                                      <Money
                                        amount={group.total}
                                        currency={currency}
                                        locale={locale}
                                      />
                                    </p>
                                  </div>

                                  {kids.length === 0 || !hasRealSubs ? (
                                    <p className="mt-2 text-xs text-[var(--muted)]">
                                      {t("allInGroupDirect")}
                                    </p>
                                  ) : (
                                    <ul className="mt-2.5 space-y-1.5">
                                      {visible.map((kid) => {
                                        const direct =
                                          kid.categoryId === group.categoryId;
                                        const pct =
                                          group.total > 0
                                            ? Math.round(
                                                (kid.total / group.total) * 100,
                                              )
                                            : 0;
                                        const barPct = Math.max(
                                          6,
                                          Math.round(
                                            (kid.total / maxKid) * 100,
                                          ),
                                        );
                                        const label = direct
                                          ? t("subcategoryDirect")
                                          : categoryLabel(kid, locale, t);
                                        const logHref = kid.categoryId
                                          ? `/analytics/category-log?${new URLSearchParams(
                                              {
                                                cats:
                                                  group.kind === "travel" &&
                                                  group.categoryId
                                                    ? group.categoryId
                                                    : kid.categoryId,
                                                from,
                                                to,
                                                ...(group.kind === "travel"
                                                  ? { leaf: kid.categoryId }
                                                  : {}),
                                                ...(excludeCommitments
                                                  ? {
                                                      excludeCommitments: "1",
                                                    }
                                                  : {}),
                                              },
                                            ).toString()}`
                                          : null;
                                        const row = (
                                          <>
                                            <span className="flex min-w-0 items-center gap-1.5">
                                              {kid.emoji && !direct ? (
                                                <span
                                                  className="shrink-0 text-xs"
                                                  aria-hidden
                                                >
                                                  {kid.emoji}
                                                </span>
                                              ) : (
                                                <span
                                                  className="inline-block h-2 w-2 shrink-0 rounded-full"
                                                  style={{
                                                    background: group.color,
                                                    opacity: direct ? 0.45 : 1,
                                                  }}
                                                  aria-hidden
                                                />
                                              )}
                                              <span className="min-w-0 truncate text-xs font-medium">
                                                {label}
                                              </span>
                                            </span>
                                            <span className="flex shrink-0 items-center gap-1.5 tabular-nums">
                                              <span className="text-xs font-semibold">
                                                <Money
                                                  amount={kid.total}
                                                  currency={currency}
                                                  locale={locale}
                                                />
                                              </span>
                                              <span className="text-[10px] text-[var(--muted)]">
                                                {fill(t("ofThisGroup"), {
                                                  pct: String(pct),
                                                })}
                                              </span>
                                            </span>
                                            <span
                                              className="col-span-2 mt-0.5 h-1 overflow-hidden rounded-full bg-[var(--panel-soft)]"
                                              aria-hidden
                                            >
                                              <span
                                                className="block h-full rounded-full"
                                                style={{
                                                  width: `${barPct}%`,
                                                  background: group.color,
                                                  opacity: 0.85,
                                                }}
                                              />
                                            </span>
                                          </>
                                        );
                                        return (
                                          <li key={kid.categoryId}>
                                            {logHref ? (
                                              <Link
                                                href={logHref}
                                                className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-2 rounded-xl px-1 py-1 transition hover:bg-[var(--panel-soft)] active:scale-[0.99]"
                                              >
                                                {row}
                                              </Link>
                                            ) : (
                                              <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-2 px-1 py-1">
                                                {row}
                                              </div>
                                            )}
                                          </li>
                                        );
                                      })}
                                    </ul>
                                  )}

                                  {hasRealSubs && kids.length > 4 ? (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setExpandedSubs((prev) =>
                                          expanded
                                            ? prev.filter((k) => k !== gKey)
                                            : [...prev, gKey],
                                        )
                                      }
                                      className="mt-2 text-xs font-semibold text-[var(--muted)] underline-offset-2 hover:underline"
                                    >
                                      {expanded
                                        ? t("showLessSubs")
                                        : fill(t("showAllSubs"), {
                                            n: String(kids.length),
                                          })}
                                    </button>
                                  ) : null}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                    </div>
                  ) : null}

                  {selectedCats.some((c) => c.categoryId) ? (
                    <Link
                      href={`/analytics/category-log?${new URLSearchParams({
                        cats: selectedCats
                          .map((c) => c.categoryId)
                          .filter(Boolean)
                          .join(","),
                        from,
                        to,
                        ...(excludeCommitments
                          ? { excludeCommitments: "1" }
                          : {}),
                      }).toString()}`}
                      className="mt-3 flex w-full items-center justify-center rounded-2xl bg-[var(--accent-a)] px-4 py-3 text-base font-bold text-[var(--accent-a-fg)] transition hover:opacity-95 active:scale-[0.99]"
                    >
                      {t("seeLogs")}
                    </Link>
                  ) : null}
              </div>
            ) : (
              <p className="text-sm text-[var(--muted)]">{t("pickGroupsEmpty")}</p>
            )}
          </div>
        </section>
      ) : null}

      {active?.kind === "HOUSE" ? (
        <>
          <h2 className="mt-8 text-xl font-semibold">{t("whoRecorded")}</h2>
          <Hint>{t("whoRecordedHint")}</Hint>
          <ul className="mt-3 space-y-2">
            {members.map((m) => (
              <li
                key={`${m.name}-${m.type}`}
                className="list-row flex justify-between"
              >
                <span>
                  {labelFor(m.name, t)} ·{" "}
                  {m.type === "EXPENSE" ? t("paidVerb") : t("receivedVerb")}
                </span>
                <span className="font-semibold">
                  {hideAggregates ? (
                    "••••"
                  ) : (
                    <Money
                      amount={m.total}
                      currency={currency}
                      locale={locale}
                    />
                  )}
                </span>
              </li>
            ))}
          </ul>
        </>
      ) : null}
      <BottomNav />
    </PageShell>
  );
}
