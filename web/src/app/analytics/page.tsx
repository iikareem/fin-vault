"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { BottomNav } from "@/components/BottomNav";
import { PageShell } from "@/components/PageShell";
import { Money } from "@/components/Money";
import { useI18n } from "@/components/I18nProvider";
import { useBooks } from "@/components/BooksProvider";
import { labelFor, categoryLabel } from "@/lib/i18n";
import { useCalendarClock } from "@/hooks/useCalendarClock";
import { isoLocal } from "@/lib/calendar";
import { householdPath } from "@/lib/space";
import { Hint } from "@/components/Hint";

type Period = "day" | "month" | "year" | "range";
type DayRow = { day: string; income: number; expense: number };
type CatRow = {
  categoryId?: string;
  name: string;
  nameAr?: string;
  color: string;
  type: string;
  total: number;
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

function rangeFor(period: Period, cursor: Date) {
  const y = cursor.getFullYear();
  const m = cursor.getMonth();
  if (period === "day") {
    const day = isoLocal(cursor);
    return { from: day, to: day };
  }
  if (period === "month") {
    return {
      from: isoLocal(new Date(y, m, 1)),
      to: isoLocal(new Date(y, m + 1, 0)),
    };
  }
  if (period === "year") {
    return { from: `${y}-01-01`, to: `${y}-12-31` };
  }
  return {
    from: isoLocal(new Date(y, m, 1)),
    to: isoLocal(new Date(y, m + 1, 0)),
  };
}

function shift(period: Exclude<Period, "range">, cursor: Date, dir: number) {
  if (period === "day") {
    const next = new Date(cursor);
    next.setDate(next.getDate() + dir);
    return next;
  }
  if (period === "month") {
    return new Date(cursor.getFullYear(), cursor.getMonth() + dir, 1);
  }
  return new Date(cursor.getFullYear() + dir, 0, 1);
}

function monthLabel(key: string, locale: string) {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString(locale === "ar" ? "ar" : "en", {
    month: "long",
    year: "numeric",
  });
}

export default function AnalyticsPage() {
  const { t, locale } = useI18n();
  const cal = useCalendarClock();
  const { active, house } = useBooks();
  const [period, setPeriod] = useState<Period>("month");
  const [cursor, setCursor] = useState(() => new Date());
  const [rangeFrom, setRangeFrom] = useState(() => {
    const now = new Date();
    return isoLocal(new Date(now.getFullYear(), now.getMonth(), 1));
  });
  const [rangeTo, setRangeTo] = useState(() => isoLocal(new Date()));
  const [days, setDays] = useState<DayRow[]>([]);
  const [cats, setCats] = useState<CatRow[]>([]);
  const [selectedGroups, setSelectedGroups] = useState<string[]>([]);
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
    return rangeFor(period, cursor);
  }, [period, cursor, rangeFrom, rangeTo]);

  const chartByMonth = period === "year" || (period === "range" && daysBetween(from, to) > 62);

  useEffect(() => {
    setCursor(new Date(cal.year, cal.month - 1, cal.day));
  }, [cal.monthKey]);

  useEffect(() => {
    if (!active) return;
    const id = active.householdId;
    const q = `from=${from}&to=${to}`;
    Promise.all([
      api<DayRow[]>(householdPath(id, `/analytics/by-day?${q}`)),
      api<CatRow[]>(householdPath(id, `/analytics/by-category?${q}`)),
      api<MemberRow[]>(householdPath(id, `/analytics/by-member?${q}`)),
      api<{ opening: number; months: SavingsMonth[] }>(
        householdPath(id, "/analytics/savings"),
      ),
    ])
      .then(([d, c, m, s]) => {
        setDays(d);
        setCats(c.filter((x) => x.type === "EXPENSE"));
        setSelectedGroups([]);
        setMembers(m);
        setSavingsOpening(s.opening);
        setSavingsMonths(s.months);
      })
      .catch((e) => setError(e.message));
  }, [active?.householdId, from, to]);

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
  const totalOut =
    days.reduce((s, d) => s + d.expense, 0) ||
    cats.reduce((s, c) => s + c.total, 0);

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
    if (period === "month" || (period === "range" && !chartByMonth)) {
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
        const [y, m] = key.split("-").map(Number);
        return {
          key,
          expense: byMonth.get(key) ?? 0,
          label: new Date(y, m - 1, 1).toLocaleDateString(loc, {
            month: "short",
          }),
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
    const bar = chartBars[next];
    if (chartByMonth) {
      const [y, m] = bar.key.split("-").map(Number);
      setCursor(new Date(y, m - 1, 1));
      setPeriod("month");
      return;
    }
    setSelectedBarKey(bar.key);
  }

  function onChartBarClick(key: string) {
    if (chartByMonth) {
      const [y, m] = key.split("-").map(Number);
      setCursor(new Date(y, m - 1, 1));
      setPeriod("month");
      return;
    }
    setSelectedBarKey(key);
  }

  function setPeriodMode(next: Period) {
    if (next === "range") {
      if (period === "month" || period === "day") {
        const bounds = rangeFor(period === "day" ? "month" : period, cursor);
        setRangeFrom(bounds.from);
        setRangeTo(period === "day" ? iso(cursor) : bounds.to);
      } else if (period === "year") {
        setRangeFrom(`${cursor.getFullYear()}-01-01`);
        setRangeTo(`${cursor.getFullYear()}-12-31`);
      }
    }
    setPeriod(next);
  }

  const monthKey = `${cursor.getFullYear()}-${pad(cursor.getMonth() + 1)}`;
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
      <div className="seg mt-4 grid-cols-4">
        {(["day", "month", "year", "range"] as Period[]).map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => setPeriodMode(p)}
            className={`rounded-2xl py-2.5 text-sm font-bold transition sm:text-base ${
              period === p
                ? "bg-[var(--surface-bg)] text-[var(--foreground)] shadow-sm"
                : "text-[var(--muted)]"
            }`}
          >
            {p === "day"
              ? t("periodDay")
              : p === "month"
                ? t("periodMonth")
                : p === "year"
                  ? t("periodYear")
                  : t("customRange")}
          </button>
        ))}
      </div>
      <Hint>{t("periodHint")}</Hint>
      {period === "range" ? (
        <div className="mt-4 grid grid-cols-2 gap-2">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-[var(--muted)]">
              {t("fromDate")}
            </span>
            <input
              type="date"
              value={rangeFrom}
              max={rangeTo}
              onChange={(e) => {
                if (e.target.value) setRangeFrom(e.target.value);
              }}
              className="field w-full text-center text-base font-semibold"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-[var(--muted)]">
              {t("toDate")}
            </span>
            <input
              type="date"
              value={rangeTo}
              min={rangeFrom}
              onChange={(e) => {
                if (e.target.value) setRangeTo(e.target.value);
              }}
              className="field w-full text-center text-base font-semibold"
            />
          </label>
        </div>
      ) : (
        <div className="mt-4 flex items-center justify-between gap-3">
          <button
            type="button"
            className="icon-btn px-4 text-xl"
            onClick={() => setCursor((c) => shift(period, c, -1))}
          >
            ‹
          </button>
          <div className="min-w-0 flex-1 text-center">
            {period === "day" ? (
              <input
                type="date"
                value={iso(cursor)}
                onChange={(e) => {
                  if (e.target.value)
                    setCursor(new Date(`${e.target.value}T12:00:00`));
                }}
                className="field text-center text-lg font-semibold"
              />
            ) : period === "month" ? (
              <input
                type="month"
                value={`${cursor.getFullYear()}-${pad(cursor.getMonth() + 1)}`}
                onChange={(e) => {
                  if (e.target.value)
                    setCursor(new Date(`${e.target.value}-01T12:00:00`));
                }}
                className="field text-center text-lg font-semibold"
              />
            ) : (
              <input
                type="number"
                value={cursor.getFullYear()}
                min={2000}
                max={2100}
                onChange={(e) => {
                  const y = Number(e.target.value);
                  if (y) setCursor(new Date(y, 0, 1));
                }}
                className="field text-center text-lg font-semibold"
              />
            )}
          </div>
          <button
            type="button"
            className="icon-btn px-4 text-xl"
            onClick={() => setCursor((c) => shift(period, c, 1))}
          >
            ›
          </button>
        </div>
      )}
      <Hint>{t("pickPeriodHint")}</Hint>
      {error ? <p className="mt-3 text-red-700">{error}</p> : null}
      {hideAggregates ? (
        <p className="surface mt-4 rounded-3xl px-4 py-3 text-sm text-stone-500">
          {t("aggregatesAdminOnly")}
        </p>
      ) : null}

      {period === "month" && !hideAggregates ? (
        <section className="surface mt-5 rounded-3xl p-4">
          <h2 className="text-xl font-semibold">{t("savingsTitle")}</h2>
          <Hint>{t("chartsSavingsHint")}</Hint>
          <div className="mt-3 grid grid-cols-1 gap-2 text-base">
            <p className="money-row">
              <span className="text-stone-500" dir="auto">
                {t("broughtFromBefore")}
              </span>
              <span className="font-semibold">
                <Money
                  amount={monthSavings.broughtForward}
                  currency={currency}
                  locale={locale}
                />
              </span>
            </p>
            <p className="money-row">
              <span className="text-stone-500" dir="auto">
                {monthSavings.saved < 0
                  ? t("usedFromSavings")
                  : t("savedInMonth")}
              </span>
              <span
                className={`font-semibold ${
                  monthSavings.saved < 0 ? "text-red-800" : "text-emerald-800"
                }`}
              >
                <Money
                  amount={monthSavings.saved}
                  currency={currency}
                  locale={locale}
                />
              </span>
            </p>
            <p className="money-row">
              <span className="text-stone-500" dir="auto">
                {t("goesToNextMonth")}
              </span>
              <span className="font-semibold">
                <Money
                  amount={monthSavings.remaining}
                  currency={currency}
                  locale={locale}
                />
              </span>
            </p>
          </div>
        </section>
      ) : null}

      {period === "year" && !hideAggregates ? (
        <>
          <h2 className="mt-8 text-xl font-semibold">{t("savedByMonth")}</h2>
          <div className="mt-3 space-y-2">
            {yearSavings.length === 0 ? (
              <p className="text-stone-500">{t("noPeriodData")}</p>
            ) : (
              yearSavings.map((row) => (
                <button
                  key={row.month}
                  type="button"
                  className="list-row w-full text-start"
                  onClick={() => {
                    const [y, m] = row.month.split("-").map(Number);
                    setCursor(new Date(y, m - 1, 1));
                    setPeriod("month");
                  }}
                >
                  <div className="flex justify-between text-sm">
                    <span>{monthLabel(row.month, locale)}</span>
                    <span
                      className={
                        row.saved < 0 ? "text-red-800" : "text-emerald-800"
                      }
                    >
                      <Money
                        amount={row.saved}
                        currency={currency}
                        locale={locale}
                      />
                    </span>
                  </div>
                  <div className="mt-1 h-3 overflow-hidden rounded-full bg-stone-200">
                    <div
                      className={`h-full rounded-full ${
                        row.saved < 0 ? "bg-red-700" : "bg-emerald-700"
                      }`}
                      style={{
                        width: `${(Math.abs(row.saved) / maxSaved) * 100}%`,
                      }}
                    />
                  </div>
                  <p className="mt-1 text-sm text-stone-500">
                    {t("goesToNextMonth")}:{" "}
                    <Money
                      amount={row.remaining}
                      currency={currency}
                      locale={locale}
                    />
                  </p>
                </button>
              ))
            )}
          </div>
        </>
      ) : null}

      <div className="mt-5 grid grid-cols-2 gap-3">
        <div className="surface rounded-2xl p-4">
          <p className="text-[var(--muted)]">{t("periodTotalIn")}</p>
          <p className="text-xl font-semibold text-emerald-800">
            {hideAggregates ? (
              "••••"
            ) : (
              <Money amount={totalIn} currency={currency} locale={locale} />
            )}
          </p>
        </div>
        <div className="surface rounded-2xl p-4">
          <p className="text-[var(--muted)]">{t("periodTotalOut")}</p>
          <p className="text-xl font-semibold text-red-800">
            {hideAggregates ? (
              "••••"
            ) : (
              <Money amount={totalOut} currency={currency} locale={locale} />
            )}
          </p>
        </div>
      </div>
      <Hint>
        {hideAggregates ? t("aggregatesAdminOnly") : t("periodTotalsHint")}
      </Hint>

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

                  {!chartByMonth ? (
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
                              className={`spend-bar relative z-[1] block w-full max-w-[24px] ${
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
                      const labelStep = n > 45 ? 7 : n > 31 ? 5 : 5;
                      const showLabel =
                        chartByMonth ||
                        selected ||
                        b.key === todayIso ||
                        i === 0 ||
                        i === n - 1 ||
                        (chartByMonth
                          ? true
                          : period === "month"
                            ? b.dayNum === 1 ||
                              b.dayNum === n ||
                              (b.dayNum != null && b.dayNum % 5 === 0)
                            : i % labelStep === 0);
                      return (
                        <button
                          key={`lbl-${b.key}`}
                          type="button"
                          tabIndex={-1}
                          aria-hidden
                          onClick={() => onChartBarClick(b.key)}
                          className={`min-w-0 flex-1 truncate text-center leading-none ${
                            chartByMonth ? "text-[10px]" : "text-[9px]"
                          } ${
                            selected
                              ? "font-bold text-[var(--foreground)]"
                              : b.key === todayIso
                                ? "font-semibold text-[var(--accent-b-text)]"
                                : showLabel
                                  ? "text-[var(--muted)]"
                                  : "text-transparent"
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
                  onClick={() => pickTop(5)}
                  disabled={cats.length < 2}
                  className="rounded-full bg-[var(--panel-soft)] px-3 py-1.5 text-sm font-semibold"
                >
                  {t("topFiveGroups")}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedGroups(cats.map(catKey));
                  }}
                  className="rounded-full bg-[var(--panel-soft)] px-3 py-1.5 text-sm font-semibold"
                >
                  {t("selectAllGroups")}
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
                              className="h-2 w-2 shrink-0 rounded-full"
                              style={{ background: c.color }}
                            />
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

                  {selectedCats.some((c) => c.categoryId) ? (
                    <Link
                      href={`/analytics/category-log?${new URLSearchParams({
                        cats: selectedCats
                          .map((c) => c.categoryId)
                          .filter(Boolean)
                          .join(","),
                        from,
                        to,
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
