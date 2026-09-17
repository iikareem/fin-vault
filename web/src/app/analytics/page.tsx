"use client";

import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { BottomNav } from "@/components/BottomNav";
import { PageShell } from "@/components/PageShell";
import { Money } from "@/components/Money";
import { useI18n } from "@/components/I18nProvider";
import { useBooks } from "@/components/BooksProvider";
import { labelFor } from "@/lib/i18n";
import { useCalendarClock } from "@/hooks/useCalendarClock";
import { isoLocal } from "@/lib/calendar";
import { householdPath } from "@/lib/space";
import { Hint } from "@/components/Hint";

type Period = "day" | "month" | "year";
type DayRow = { day: string; income: number; expense: number };
type CatRow = {
  categoryId?: string;
  name: string;
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
  const { active, house } = useBooks();
  const [period, setPeriod] = useState<Period>("month");
  const [cursor, setCursor] = useState(() => new Date());
  const [days, setDays] = useState<DayRow[]>([]);
  const [cats, setCats] = useState<CatRow[]>([]);
  const [selectedGroups, setSelectedGroups] = useState<string[]>([]);
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [savingsMonths, setSavingsMonths] = useState<SavingsMonth[]>([]);
  const [savingsOpening, setSavingsOpening] = useState(0);
  const [error, setError] = useState("");
  const currency = active?.currency ?? "EGP";
  const hideAggregates = active?.kind === "HOUSE" && house?.role !== "ADMIN";
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
        setSelectedGroups([]);
        setMembers(m);
        setSavingsOpening(s.opening);
        setSavingsMonths(s.months);
      })
      .catch((e) => setError(e.message));
  }, [active?.householdId, from, to]);

  const visibleCats = useMemo(() => {
    if (selectedGroups.length === 0) return cats;
    const picked = new Set(selectedGroups);
    return cats.filter((c) => picked.has(c.categoryId ?? c.name));
  }, [cats, selectedGroups]);

  const selectedTotal = useMemo(
    () => visibleCats.reduce((s, c) => s + c.total, 0),
    [visibleCats],
  );

  function catKey(c: CatRow) {
    return c.categoryId ?? c.name;
  }

  function toggleGroup(key: string) {
    setSelectedGroups((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key],
    );
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
  const bars =
    period === "year" ? months.map((m) => ({ key: m.key, expense: m.expense, label: monthLabel(m.key, locale) })) : period === "month" ? days.map((d) => ({ key: d.day, expense: d.expense, label: d.day })) : [];
  const maxBar = Math.max(1, ...bars.map((b) => b.expense));
  const maxCat = Math.max(1, ...visibleCats.map((c) => c.total));
  const selectionActive = selectedGroups.length > 0;
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
      {hideAggregates ? (
        <p className="mt-4 rounded-3xl bg-white px-4 py-3 text-sm text-stone-500 shadow-sm">
          {t("aggregatesAdminOnly")}
        </p>
      ) : null}

      {period === "month" && !hideAggregates ? (
        <section className="mt-5 rounded-3xl bg-white p-4 shadow-sm">
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
        <div className="rounded-2xl bg-white p-4 shadow-sm">
          <p className="text-stone-500">{t("periodTotalIn")}</p>
          <p className="text-xl font-semibold text-emerald-800">
            {hideAggregates ? (
              "••••"
            ) : (
              <Money amount={totalIn} currency={currency} locale={locale} />
            )}
          </p>
        </div>
        <div className="rounded-2xl bg-white p-4 shadow-sm">
          <p className="text-stone-500">{t("periodTotalOut")}</p>
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
                    <span>
                      {hideAggregates ? (
                        "••••"
                      ) : (
                        <Money
                          amount={b.expense}
                          currency={currency}
                          locale={locale}
                        />
                      )}
                    </span>
                  </div>
                  <div className="mt-1 h-3 overflow-hidden rounded-full bg-stone-200">
                    <div
                      className="h-full rounded-full bg-red-700"
                      style={{
                        width: hideAggregates
                          ? "0%"
                          : `${(b.expense / maxBar) * 100}%`,
                      }}
                    />
                  </div>
                </div>
              ))
            )}
          </div>
        </>
      ) : null}

      <h2 className="mt-8 text-xl font-semibold">{t("whereMoneyWent")}</h2>
      <Hint>{t("pickGroupsHint")}</Hint>

      {cats.length > 0 ? (
        <section className="surface mt-3 rounded-[1.75rem] p-4">
          <div className="flex items-center justify-between gap-2">
            <p className="font-semibold">{t("pickGroups")}</p>
            <div className="flex shrink-0 gap-2">
              {selectionActive ? (
                <button
                  type="button"
                  onClick={() => setSelectedGroups([])}
                  className="rounded-full border border-[var(--input-border)] bg-[var(--panel-soft)] px-3 py-1.5 text-sm font-semibold"
                >
                  {t("clearSelection")}
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => setSelectedGroups(cats.map(catKey))}
                className="rounded-full border border-[var(--input-border)] bg-[var(--panel-soft)] px-3 py-1.5 text-sm font-semibold"
              >
                {t("selectAllGroups")}
              </button>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            {cats.map((c) => {
              const key = catKey(c);
              const on = selectedGroups.includes(key);
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => toggleGroup(key)}
                  aria-pressed={on}
                  className={`inline-flex items-center gap-2 rounded-full border px-3 py-2 text-sm font-semibold transition ${
                    on
                      ? "border-transparent text-white shadow-sm"
                      : "border-[var(--input-border)] bg-[var(--panel-soft)] text-[var(--foreground)]"
                  }`}
                  style={on ? { background: c.color } : undefined}
                >
                  <span
                    className="h-2.5 w-2.5 rounded-full"
                    style={{
                      background: on ? "rgba(255,255,255,0.9)" : c.color,
                    }}
                    aria-hidden
                  />
                  {labelFor(c.name, t)}
                </button>
              );
            })}
          </div>

          {selectionActive ? (
            <div className="mt-4 rounded-2xl bg-[var(--panel-soft)] px-4 py-3">
              <p className="text-sm text-[var(--muted)]">
                {t("nGroupsSelected", { n: String(selectedGroups.length) })}
              </p>
              <p className="mt-1 text-sm font-medium">{t("selectedSpend")}</p>
              <p className="mt-1 text-2xl font-bold text-red-800">
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
              {!hideAggregates && totalOut > 0 ? (
                <p className="mt-1 text-sm text-[var(--muted)]">
                  {t("selectedShare", {
                    pct: String(Math.round((selectedTotal / totalOut) * 100)),
                  })}
                </p>
              ) : null}
            </div>
          ) : (
            <p className="mt-3 text-sm text-[var(--muted)]">
              {t("pickGroupsEmpty")}
            </p>
          )}
        </section>
      ) : null}

      <ul className="mt-4 space-y-3">
        {visibleCats.length === 0 ? (
          <li className="text-[var(--muted)]">{t("noPeriodData")}</li>
        ) : (
          visibleCats.map((c) => {
            const key = catKey(c);
            const on = selectedGroups.includes(key);
            return (
              <li key={key}>
                <button
                  type="button"
                  onClick={() => toggleGroup(key)}
                  className={`w-full rounded-2xl px-1 py-1 text-start transition ${
                    on ? "bg-[var(--panel-soft)]" : ""
                  }`}
                >
                  <div className="flex justify-between gap-3">
                    <span className="inline-flex min-w-0 items-center gap-2 font-medium">
                      <span
                        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border text-xs ${
                          on
                            ? "border-transparent text-white"
                            : "border-[var(--input-border)] text-transparent"
                        }`}
                        style={on ? { background: c.color } : undefined}
                        aria-hidden
                      >
                        ✓
                      </span>
                      <span className="truncate">{labelFor(c.name, t)}</span>
                    </span>
                    <span className="shrink-0 font-semibold">
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
                  </div>
                  <div className="mt-1 h-3 overflow-hidden rounded-full bg-stone-200">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: hideAggregates
                          ? "0%"
                          : `${(c.total / maxCat) * 100}%`,
                        background: c.color,
                      }}
                    />
                  </div>
                </button>
              </li>
            );
          })
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
