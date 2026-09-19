"use client";

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

type Period = "day" | "month" | "year";
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
  const bars =
    period === "year" ? months.map((m) => ({ key: m.key, expense: m.expense, label: monthLabel(m.key, locale) })) : period === "month" ? days.map((d) => ({ key: d.day, expense: d.expense, label: d.day })) : [];
  const maxBar = Math.max(1, ...bars.map((b) => b.expense));
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
      <div className="seg mt-4 grid-cols-3">
        {(["day", "month", "year"] as Period[]).map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => setPeriod(p)}
            className={`rounded-2xl py-3 text-lg font-bold transition ${
              period === p
                ? "bg-[var(--surface-bg)] text-[var(--foreground)] shadow-sm"
                : "text-[var(--muted)]"
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
                if (e.target.value) setCursor(new Date(`${e.target.value}T12:00:00`));
              }}
              className="field text-center text-lg font-semibold"
            />
          ) : period === "month" ? (
            <input
              type="month"
              value={`${cursor.getFullYear()}-${pad(cursor.getMonth() + 1)}`}
              onChange={(e) => {
                if (e.target.value) setCursor(new Date(`${e.target.value}-01T12:00:00`));
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
