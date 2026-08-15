"use client";

import { useEffect, useMemo, useState } from "react";
import { api, money } from "@/lib/api";
import { BottomNav } from "@/components/BottomNav";
import { PageShell } from "@/components/PageShell";
import { useI18n } from "@/components/I18nProvider";
import { useBooks } from "@/components/BooksProvider";
import { labelFor } from "@/lib/i18n";
import { useCalendarClock } from "@/hooks/useCalendarClock";
import { isoLocal } from "@/lib/calendar";
import { householdPath } from "@/lib/space";
import { Hint } from "@/components/Hint";

type Period = "day" | "month" | "year";
type DayRow = { day: string; income: number; expense: number };
type CatRow = { name: string; color: string; type: string; total: number };
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
  return { from: `${y}-01-01`, to: `${y}-12-31` };
}

function shift(period: Period, cursor: Date, dir: number) {
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
  const { active } = useBooks();
  const [period, setPeriod] = useState<Period>("month");
  const [cursor, setCursor] = useState(() => new Date());
  const [days, setDays] = useState<DayRow[]>([]);
  const [cats, setCats] = useState<CatRow[]>([]);
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [savingsMonths, setSavingsMonths] = useState<SavingsMonth[]>([]);
  const [savingsOpening, setSavingsOpening] = useState(0);
  const [error, setError] = useState("");
  const currency = active?.currency ?? "EGP";
  const { from, to } = rangeFor(period, cursor);

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
        setMembers(m);
        setSavingsOpening(s.opening);
        setSavingsMonths(s.months);
      })
      .catch((e) => setError(e.message));
  }, [active?.householdId, from, to]);

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
  const bars =
    period === "year" ? months.map((m) => ({ key: m.key, expense: m.expense, label: monthLabel(m.key, locale) })) : period === "month" ? days.map((d) => ({ key: d.day, expense: d.expense, label: d.day })) : [];
  const maxBar = Math.max(1, ...bars.map((b) => b.expense));
  const maxCat = Math.max(1, ...cats.map((c) => c.total));
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
      <h1 className="text-2xl font-bold leading-tight sm:text-3xl">📊 {t("navCharts")}</h1>
      <Hint>{t("chartsHint")}</Hint>
      <div className="mt-4 grid grid-cols-3 gap-2 rounded-3xl bg-stone-200 p-1.5">
        {(["day", "month", "year"] as Period[]).map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => setPeriod(p)}
            className={`rounded-2xl py-3 text-lg font-bold ${
              period === p ? "bg-white text-stone-900 shadow" : "text-stone-500"
            }`}
          >
            {p === "day" ? t("periodDay") : p === "month" ? t("periodMonth") : t("periodYear")}
          </button>
        ))}
      </div>
      <Hint>{t("periodHint")}</Hint>
      <div className="mt-4 flex items-center justify-between gap-3">
        <button
          type="button"
          className="rounded-2xl bg-white px-4 py-3 text-xl font-bold shadow-sm"
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
                if (e.target.value) setCursor(new Date(`${e.target.value}T12:00:00`));
              }}
              className="w-full rounded-2xl border border-stone-200 bg-white px-3 py-2 text-center text-lg font-semibold"
            />
          ) : period === "month" ? (
            <input
              type="month"
              value={`${cursor.getFullYear()}-${pad(cursor.getMonth() + 1)}`}
              onChange={(e) => {
                if (e.target.value) setCursor(new Date(`${e.target.value}-01T12:00:00`));
              }}
              className="w-full rounded-2xl border border-stone-200 bg-white px-3 py-2 text-center text-lg font-semibold"
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
              className="w-full rounded-2xl border border-stone-200 bg-white px-3 py-2 text-center text-lg font-semibold"
            />
          )}
        </div>
        <button
          type="button"
          className="rounded-2xl bg-white px-4 py-3 text-xl font-bold shadow-sm"
          onClick={() => setCursor((c) => shift(period, c, 1))}
        >
          ›
        </button>
      </div>
      <Hint>{t("pickPeriodHint")}</Hint>
      {error ? <p className="mt-3 text-red-700">{error}</p> : null}

      {period === "month" ? (
        <section className="mt-5 rounded-3xl bg-white p-4 shadow-sm">
          <h2 className="text-xl font-semibold">{t("savingsTitle")}</h2>
          <Hint>{t("chartsSavingsHint")}</Hint>
          <div className="mt-3 grid grid-cols-1 gap-2 text-base">
            <p className="flex justify-between">
              <span className="text-stone-500">{t("broughtFromBefore")}</span>
              <span className="font-semibold">
                {money(monthSavings.broughtForward, currency, locale)}
              </span>
            </p>
            <p className="flex justify-between">
              <span className="text-stone-500">
                {monthSavings.saved < 0
                  ? t("usedFromSavings")
                  : t("savedInMonth")}
              </span>
              <span
                className={`font-semibold ${
                  monthSavings.saved < 0 ? "text-red-800" : "text-emerald-800"
                }`}
              >
                {money(monthSavings.saved, currency, locale)}
              </span>
            </p>
            <p className="flex justify-between">
              <span className="text-stone-500">{t("goesToNextMonth")}</span>
              <span className="font-semibold">
                {money(monthSavings.remaining, currency, locale)}
              </span>
            </p>
          </div>
        </section>
      ) : null}

      {period === "year" ? (
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
                  className="w-full rounded-2xl bg-white px-4 py-3 text-start shadow-sm"
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
                      {money(row.saved, currency, locale)}
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
                    {money(row.remaining, currency, locale)}
                  </p>
                </button>
              ))
            )}
          </div>
        </>
      ) : null}

      <div className="mt-5 grid grid-cols-2 gap-3">
        <div className="rounded-2xl bg-white p-4 shadow-sm">
          <p className="text-stone-500">{t("periodTotalIn")}</p>
          <p className="text-xl font-semibold text-emerald-800">
            {money(totalIn, currency, locale)}
          </p>
        </div>
        <div className="rounded-2xl bg-white p-4 shadow-sm">
          <p className="text-stone-500">{t("periodTotalOut")}</p>
          <p className="text-xl font-semibold text-red-800">
            {money(totalOut, currency, locale)}
          </p>
        </div>
      </div>
      <Hint>{t("periodTotalsHint")}</Hint>

      {period !== "day" ? (
        <>
          <h2 className="mt-8 text-xl font-semibold">
            {period === "year" ? t("spendByMonth") : t("spendByDay")}
          </h2>
          <div className="mt-3 space-y-2">
            {bars.length === 0 ? (
              <p className="text-stone-500">{t("noPeriodData")}</p>
            ) : (
              bars.map((b) => (
                <div key={b.key}>
                  <div className="flex justify-between text-sm">
                    <span>{b.label}</span>
                    <span>{money(b.expense, currency, locale)}</span>
                  </div>
                  <div className="mt-1 h-3 overflow-hidden rounded-full bg-stone-200">
                    <div
                      className="h-full rounded-full bg-red-700"
                      style={{ width: `${(b.expense / maxBar) * 100}%` }}
                    />
                  </div>
                </div>
              ))
            )}
          </div>
        </>
      ) : null}

      <h2 className="mt-8 text-xl font-semibold">{t("whereMoneyWent")}</h2>
      <Hint>{t("whereMoneyWentHint")}</Hint>
      <ul className="mt-3 space-y-3">
        {cats.length === 0 ? (
          <li className="text-stone-500">{t("noPeriodData")}</li>
        ) : (
          cats.map((c) => (
            <li key={c.name}>
              <div className="flex justify-between">
                <span>{labelFor(c.name, t)}</span>
                <span className="font-semibold">
                  {money(c.total, currency, locale)}
                </span>
              </div>
              <div className="mt-1 h-3 overflow-hidden rounded-full bg-stone-200">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${(c.total / maxCat) * 100}%`,
                    background: c.color,
                  }}
                />
              </div>
            </li>
          ))
        )}
      </ul>

      {active?.kind === "HOUSE" ? (
        <>
          <h2 className="mt-8 text-xl font-semibold">{t("whoRecorded")}</h2>
          <Hint>{t("whoRecordedHint")}</Hint>
          <ul className="mt-3 space-y-2">
            {members.map((m) => (
              <li
                key={`${m.name}-${m.type}`}
                className="flex justify-between rounded-2xl bg-white px-4 py-3 shadow-sm"
              >
                <span>
                  {labelFor(m.name, t)} · {m.type === "EXPENSE" ? t("paidVerb") : t("receivedVerb")}
                </span>
                <span className="font-semibold">
                  {money(m.total, currency, locale)}
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
