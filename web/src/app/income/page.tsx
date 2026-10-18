"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { api } from "@/lib/api";
import { categoryLabel, fill, labelFor } from "@/lib/i18n";
import { BottomNav } from "@/components/BottomNav";
import { PageShell } from "@/components/PageShell";
import { Money } from "@/components/Money";
import { useI18n } from "@/components/I18nProvider";
import { useBooks } from "@/components/BooksProvider";
import { householdPath } from "@/lib/space";
import { Hint } from "@/components/Hint";
import { ItemDate } from "@/components/ItemDate";
import { useCalendarClock } from "@/hooks/useCalendarClock";
import { budgetMonthRange, shiftBudgetMonthKey } from "@/lib/calendar";
import { CashWithdrawalChart } from "@/components/CashWithdrawalChart";

function isPeriodKey(value: string | null): value is string {
  return Boolean(value && /^\d{4}-\d{2}$/.test(value));
}

type IncomeItem = {
  id: string;
  amount: number;
  occurredOn: string;
  note: string;
  createdAt: string;
  category: {
    id: string;
    name: string;
    nameAr?: string | null;
    emoji?: string | null;
    color?: string | null;
  };
  account: { id: string; name: string; type?: string } | null;
};

type IncomeSummary = {
  periodKey: string;
  periodFrom: string;
  periodTo: string;
  budgetMonthStartDay: number;
  total: number;
  count: number;
  items: IncomeItem[];
};

function monthLabel(key: string, locale: string) {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString(
    locale === "ar" ? "ar" : "en",
    { month: "long", year: "numeric" },
  );
}

function shortDayMonth(iso: string, locale: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(
    locale === "ar" ? "ar" : "en",
    { day: "numeric", month: "short" },
  );
}

function periodLabel(key: string, startDay: number, locale: string) {
  if (startDay <= 1) return monthLabel(key, locale);
  const { from, to } = budgetMonthRange(key, startDay);
  return `${shortDayMonth(from, locale)} – ${shortDayMonth(to, locale)}`;
}

function periodOptionsAround(center: string, before = 18, after = 12) {
  const keys: string[] = [];
  for (let i = -before; i <= after; i += 1) {
    keys.push(shiftBudgetMonthKey(center, i));
  }
  return keys;
}

function PeriodMonthPicker({
  value,
  onChange,
  locale,
  startDay,
  choices,
  currentKey,
  thisPeriodLabel,
}: {
  value: string;
  onChange: (key: string) => void;
  locale: "ar" | "en";
  startDay: number;
  choices: string[];
  currentKey?: string;
  thisPeriodLabel?: string;
}) {
  const options = choices.includes(value)
    ? choices
    : periodOptionsAround(value);
  const title = periodLabel(value, startDay, locale);
  const isCurrent = Boolean(currentKey && value === currentKey);

  return (
    <div className="w-full space-y-2">
      <section className="surface rounded-[1.5rem] px-2 py-3">
        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-label="Previous period"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-xl text-[var(--foreground)] transition hover:bg-[var(--panel-soft)]"
            onClick={() => onChange(shiftBudgetMonthKey(value, -1))}
          >
            ‹
          </button>
          <div className="min-w-0 flex-1 py-1 text-center">
            <p className="truncate text-base font-bold tabular-nums text-[var(--foreground)]">
              {title}
            </p>
          </div>
          <button
            type="button"
            aria-label="Next period"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-xl text-[var(--foreground)] transition hover:bg-[var(--panel-soft)]"
            onClick={() => onChange(shiftBudgetMonthKey(value, 1))}
          >
            ›
          </button>
        </div>
        {currentKey && thisPeriodLabel ? (
          <div className="mt-2 flex justify-center">
            <button
              type="button"
              onClick={() => {
                if (!isCurrent) onChange(currentKey);
              }}
              className={`rounded-full px-3.5 py-1.5 text-sm font-semibold transition ${
                isCurrent
                  ? "pointer-events-none bg-[var(--panel-soft)] text-[var(--muted)]"
                  : "bg-emerald-600/15 text-emerald-800"
              }`}
            >
              {thisPeriodLabel}
            </button>
          </div>
        ) : null}
      </section>
      <select
        className="field w-full !rounded-[1.15rem] text-sm"
        value={value}
        onChange={(e) => {
          if (e.target.value) onChange(e.target.value);
        }}
        aria-label={title}
      >
        {options.map((key) => (
          <option key={key} value={key}>
            {periodLabel(key, startDay, locale)}
            {currentKey && key === currentKey && thisPeriodLabel
              ? ` · ${thisPeriodLabel}`
              : ""}
          </option>
        ))}
      </select>
    </div>
  );
}

export default function IncomePage() {
  return (
    <Suspense fallback={null}>
      <IncomeInner />
    </Suspense>
  );
}

function IncomeInner() {
  const { t, locale } = useI18n();
  const { active, budgetMonthStartDay } = useBooks();
  const search = useSearchParams();
  const currency = active?.currency ?? "EGP";
  const cal = useCalendarClock(budgetMonthStartDay);
  const periodFromUrl = search.get("period");

  const [period, setPeriod] = useState(() =>
    isPeriodKey(periodFromUrl) ? periodFromUrl : cal.monthKey,
  );
  const [data, setData] = useState<IncomeSummary | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const startMonthChoices = useMemo(
    () => periodOptionsAround(cal.monthKey),
    [cal.monthKey],
  );

  useEffect(() => {
    setPeriod(isPeriodKey(periodFromUrl) ? periodFromUrl : cal.monthKey);
  }, [budgetMonthStartDay, active?.householdId, periodFromUrl]);

  useEffect(() => {
    if (!active) return;
    setLoading(true);
    setError("");
    api<IncomeSummary>(
      householdPath(
        active.householdId,
        `/analytics/income?period=${encodeURIComponent(period)}`,
      ),
    )
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, [active?.householdId, period]);

  if (!active) {
    return (
      <PageShell>
        <p className="page-title">{t("incomeLogTitle")}</p>
        <Hint>{t("pleaseLogin")}</Hint>
        <BottomNav />
      </PageShell>
    );
  }

  return (
    <PageShell>
      <Link
        href={`/analytics`}
        className="inline-flex min-h-10 items-center gap-1 text-sm font-semibold text-emerald-800"
      >
        ← {t("navCharts")}
      </Link>

      <header className="mt-1">
        <h1 className="page-title">{t("incomeLogTitle")}</h1>
        <p className="mt-1 text-sm leading-relaxed text-[var(--muted)]">
          {t("incomeLogHint")}
        </p>
      </header>

      <div className="mt-4">
        <PeriodMonthPicker
          value={period}
          onChange={setPeriod}
          locale={locale}
          startDay={budgetMonthStartDay}
          choices={startMonthChoices}
          currentKey={cal.monthKey}
          thisPeriodLabel={t("incomeLogThisPeriod")}
        />
      </div>

      {error ? (
        <p className="mt-3 rounded-2xl bg-red-500/10 px-4 py-3 text-sm text-red-800">
          {error}
        </p>
      ) : null}

      {data ? (
        <section className="surface mt-4 rounded-[1.5rem] p-4">
          <div className="flex items-end justify-between gap-4">
            <div className="min-w-0">
              <p className="text-[10px] font-medium uppercase tracking-wide text-[var(--muted)]">
                {t("incomeLogPeriodTotal")}
              </p>
              <p className="mt-1 text-2xl font-bold tabular-nums text-emerald-800">
                <Money amount={data.total} currency={currency} locale={locale} />
              </p>
            </div>
            <p className="shrink-0 rounded-full bg-emerald-600/15 px-3 py-1.5 text-xs font-semibold text-emerald-800">
              {data.count === 1
                ? t("incomeLogCountOne")
                : fill(t("incomeLogCount"), {
                    n: String(data.count),
                  })}
            </p>
          </div>
          <div className="mt-5 border-t border-[var(--surface-border)] pt-4">
            <p className="mb-3 text-xs font-semibold text-[var(--muted)]">
              {t("incomeLogDailyChart")}
            </p>
            <CashWithdrawalChart
              items={data.items}
              periodFrom={data.periodFrom}
              periodTo={data.periodTo}
              currency={currency}
              locale={locale}
              label={t("incomeLogDailyChart")}
              tone="income"
            />
          </div>
        </section>
      ) : loading ? (
        <p className="mt-4 text-sm text-[var(--muted)]">{t("saving")}</p>
      ) : null}

      <Link
        href="/add?type=income"
        className="mt-4 flex min-h-12 w-full items-center justify-center rounded-2xl bg-[var(--cta-bg)] text-base font-semibold text-[var(--cta-fg)] shadow-sm"
      >
        {t("homeIncomeAddHint")}
      </Link>

      {data && data.items.length > 0 ? (
        <ul className="mt-6 space-y-2">
          {data.items.map((item) => {
            const catName = categoryLabel(item.category, locale, t);
            const note =
              item.note &&
              item.note.trim() &&
              item.note.trim().toLowerCase() !== catName.toLowerCase()
                ? item.note.trim()
                : null;
            const wallet = item.account
              ? labelFor(item.account.name, t)
              : null;
            return (
              <li
                key={item.id}
                className="surface overflow-hidden rounded-[1.35rem] p-3.5"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <ItemDate
                      value={item.occurredOn}
                      locale={locale}
                      todayLabel={t("today")}
                      yesterdayLabel={t("yesterday")}
                      tone="paid"
                    />
                    <p
                      className="mt-1.5 truncate text-sm font-medium text-[var(--foreground)]"
                      dir="auto"
                    >
                      {item.category.emoji ? `${item.category.emoji} ` : ""}
                      {catName}
                    </p>
                    {note || wallet ? (
                      <p
                        className="mt-0.5 truncate text-xs text-[var(--muted)]"
                        dir="auto"
                      >
                        {[note, wallet].filter(Boolean).join(" · ")}
                      </p>
                    ) : null}
                  </div>
                  <p className="shrink-0 text-base font-bold tabular-nums text-emerald-800">
                    <Money
                      amount={item.amount}
                      currency={currency}
                      locale={locale}
                    />
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      ) : data && !loading ? (
        <p className="mt-8 text-center text-sm text-[var(--muted)]">
          {t("incomeLogEmpty")}
        </p>
      ) : null}

      <BottomNav />
    </PageShell>
  );
}
