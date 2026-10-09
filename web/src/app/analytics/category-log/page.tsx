"use client";

import Link from "next/link";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api } from "@/lib/api";
import { BottomNav } from "@/components/BottomNav";
import { PageShell } from "@/components/PageShell";
import { Money } from "@/components/Money";
import { useI18n } from "@/components/I18nProvider";
import { useBooks } from "@/components/BooksProvider";
import { categoryLabel, labelFor } from "@/lib/i18n";
import {
  budgetMonthKey,
  budgetMonthRange,
  formatItemDate,
  formatItemTime,
} from "@/lib/calendar";
import { householdPath } from "@/lib/space";
import { DateField } from "@/components/DateField";

type RangeMode = "month" | "custom";

type CatMeta = {
  id: string;
  name: string;
  nameAr?: string | null;
  color: string;
  emoji?: string;
};

type LogItem = {
  id: string;
  kind: "tx" | "claim";
  amount: number;
  note: string;
  type?: string;
  createdAt?: string;
  category: {
    id: string;
    name: string;
    nameAr?: string | null;
    color: string;
    emoji?: string;
    parentId?: string | null;
  };
  account?: { id: string; name: string };
  user?: { id: string; name: string };
};

type DayGroup = {
  date: string;
  total: number;
  items: LogItem[];
};

type CategoryLog = {
  from: string;
  to: string;
  total: number;
  purchaseCount: number;
  dayCount: number;
  truncated?: boolean;
  categories: CatMeta[];
  days: DayGroup[];
};

function monthBounds(cursor: Date, startDay = 1) {
  const range = budgetMonthRange(cursor, startDay);
  return { from: range.from, to: range.to };
}

function isExactBudgetMonth(from: string, to: string, startDay: number) {
  const range = budgetMonthRange(from.slice(0, 7), startDay);
  const byDate = budgetMonthRange(
    new Date(
      Number(from.slice(0, 4)),
      Number(from.slice(5, 7)) - 1,
      Number(from.slice(8, 10)),
    ),
    startDay,
  );
  return (
    (from === range.from && to === range.to) ||
    (from === byDate.from && to === byDate.to)
  );
}

function CategoryLogInner() {
  const { t, locale } = useI18n();
  const { active, house, budgetMonthStartDay } = useBooks();
  const startDay = active?.kind === "PERSONAL" ? budgetMonthStartDay : 1;
  const router = useRouter();
  const search = useSearchParams();
  const currency = active?.currency ?? "EGP";
  const hideAggregates = active?.kind === "HOUSE" && house?.role !== "ADMIN";

  const catsParam = search.get("cats") ?? "";
  const leafParam = search.get("leaf")?.trim() || "";
  const excludeCommitments =
    search.get("excludeCommitments") === "1" ||
    search.get("excludeCommitments") === "true";
  const catIds = useMemo(
    () =>
      catsParam
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    [catsParam],
  );

  const initialFrom = search.get("from") ?? "";
  const initialTo = search.get("to") ?? "";

  const [rangeMode, setRangeMode] = useState<RangeMode>(() =>
    initialFrom && initialTo && isExactBudgetMonth(initialFrom, initialTo, 1)
      ? "month"
      : initialFrom && initialTo
        ? "custom"
        : "month",
  );
  const [cursor, setCursor] = useState(() => {
    if (initialFrom) {
      const [y, m, d] = initialFrom.split("-").map(Number);
      if (y && m) return new Date(y, m - 1, d || 1);
    }
    return new Date();
  });
  const [customFrom, setCustomFrom] = useState(
    () => initialFrom || monthBounds(new Date(), 1).from,
  );
  const [customTo, setCustomTo] = useState(
    () => initialTo || monthBounds(new Date(), 1).to,
  );

  const { from, to } = useMemo(() => {
    if (rangeMode === "month") return monthBounds(cursor, startDay);
    return {
      from: customFrom,
      to: customTo >= customFrom ? customTo : customFrom,
    };
  }, [rangeMode, cursor, customFrom, customTo, startDay]);

  const [data, setData] = useState<CategoryLog | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!active || catIds.length === 0) {
      setLoading(false);
      setData(null);
      return;
    }
    setLoading(true);
    const q = new URLSearchParams({
      from,
      to,
      categoryIds: catIds.join(","),
    });
    if (excludeCommitments) q.set("excludeCommitments", "1");
    if (leafParam) q.set("leaf", leafParam);
    api<CategoryLog>(
      householdPath(active.householdId, `/analytics/category-log?${q}`),
    )
      .then((res) => {
        setData(res);
        setError("");
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [
    active?.householdId,
    from,
    to,
    catIds.join(","),
    excludeCommitments,
    leafParam,
  ]);

  useEffect(() => {
    if (catIds.length === 0) return;
    const params = new URLSearchParams({
      cats: catIds.join(","),
      from,
      to,
    });
    if (excludeCommitments) params.set("excludeCommitments", "1");
    if (leafParam) params.set("leaf", leafParam);
    router.replace(`/analytics/category-log?${params}`, { scroll: false });
  }, [from, to, catIds.join(","), excludeCommitments, leafParam]);

  const categories = data?.categories ?? [];
  const visibleCats = categories.slice(0, 4);
  const extraCats = Math.max(0, categories.length - visibleCats.length);

  function shiftMonth(dir: number) {
    setCursor((c) => {
      if (startDay === 1) {
        return new Date(c.getFullYear(), c.getMonth() + dir, 1);
      }
      const key = budgetMonthKey(c, startDay);
      const [y, m] = key.split("-").map(Number);
      return new Date(y, m - 1 + dir, startDay);
    });
  }

  function rowTitle(item: LogItem) {
    return categoryLabel(item.category, locale, t);
  }

  function showUser(name?: string) {
    if (
      !name ||
      name === "House" ||
      name === "personal" ||
      name === "Personal"
    ) {
      return false;
    }
    return active?.kind === "HOUSE";
  }

  function walletLabel(item: LogItem) {
    const name = item.account?.name?.trim();
    if (!name || name === "Current") return "";
    return labelFor(name, t);
  }

  function categoryLogHref() {
    const params = new URLSearchParams({
      cats: catIds.join(","),
      from,
      to,
    });
    if (excludeCommitments) params.set("excludeCommitments", "1");
    if (leafParam) params.set("leaf", leafParam);
    return `/analytics/category-log?${params.toString()}`;
  }

  function openDay(date: string) {
    const params = new URLSearchParams({
      on: date,
      back: categoryLogHref(),
    });
    router.push(`/history?${params.toString()}`);
  }

  return (
    <PageShell>
      <Link
        href="/analytics"
        className="inline-flex min-h-10 items-center gap-1 text-sm font-semibold text-[var(--accent-b-text)]"
      >
        ← {t("categoryLogsBack")}
      </Link>

      <header className="mt-1">
        <h1 className="text-[1.65rem] font-bold leading-tight tracking-tight text-[var(--foreground)]">
          {t("categoryLogs")}
        </h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          {excludeCommitments
            ? t("withoutCommitmentsHint")
            : t("categoryLogsHint")}
        </p>
      </header>

      {catIds.length === 0 ? (
        <p className="mt-6 text-center text-base text-[var(--muted)]">
          {t("noCategoryLogs")}
        </p>
      ) : (
        <>
          <section className="surface mt-4 rounded-[1.5rem] px-4 py-4">
            <div className="flex flex-wrap items-center gap-1.5">
              {loading && !data ? (
                <span className="cat-log-skel h-6 w-40 rounded-full" />
              ) : (
                <>
                  {visibleCats.map((c) => (
                    <span
                      key={c.id}
                      className="inline-flex max-w-[10rem] items-center gap-1.5 rounded-full bg-[var(--panel-soft)] px-2.5 py-1 text-xs font-semibold ring-1 ring-[var(--input-border)]"
                    >
                      <span
                        className="h-2 w-2 shrink-0 rounded-full"
                        style={{ background: c.color }}
                        aria-hidden
                      />
                      <span className="min-w-0 truncate">
                        {c.emoji ? `${c.emoji} ` : ""}
                        {categoryLabel(c, locale, t)}
                      </span>
                    </span>
                  ))}
                  {extraCats > 0 ? (
                    <span className="rounded-full bg-[var(--panel-soft)] px-2.5 py-1 text-xs font-semibold text-[var(--muted)] ring-1 ring-[var(--input-border)]">
                      +{extraCats}
                    </span>
                  ) : null}
                </>
              )}
            </div>

            <p className="mt-4 text-xs font-medium text-[var(--muted)]">
              {t("selectedSpend")}
            </p>
            <p className="mt-1 text-3xl font-bold tracking-tight tabular-nums text-rose-700 dark:text-rose-300">
              {loading && !data ? (
                <span className="cat-log-skel inline-block h-9 w-36 rounded-xl" />
              ) : hideAggregates ? (
                "••••"
              ) : (
                <Money
                  amount={data?.total ?? 0}
                  currency={currency}
                  locale={locale}
                />
              )}
            </p>
            <p className="mt-1.5 text-sm text-[var(--muted)]">
              {loading && !data ? (
                <span className="cat-log-skel inline-block h-4 w-44 rounded-lg" />
              ) : (
                t("nPurchasesDays", {
                  purchases: String(data?.purchaseCount ?? 0),
                  days: String(data?.dayCount ?? 0),
                })
              )}
            </p>
            {data?.truncated ? (
              <p className="mt-2 text-xs text-[var(--muted)]">
                {t("logsTruncated", { n: "500" })}
              </p>
            ) : null}
          </section>

          <section className="surface mt-3.5 rounded-[1.5rem] px-3 py-3.5">
            <div className="seg grid-cols-2">
              {(["month", "custom"] as RangeMode[]).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => {
                    setRangeMode(mode);
                    if (mode === "month") {
                      const bounds = monthBounds(cursor, startDay);
                      setCustomFrom(bounds.from);
                      setCustomTo(bounds.to);
                    }
                  }}
                  className={`seg-item text-base ${
                    rangeMode === mode ? "seg-active" : ""
                  }`}
                  aria-pressed={rangeMode === mode}
                >
                  {mode === "month" ? t("monthRange") : t("customRange")}
                </button>
              ))}
            </div>

            {rangeMode === "month" ? (
              <div className="mt-3 flex items-center gap-1">
                <button
                  type="button"
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-xl text-[var(--foreground)] transition hover:bg-[var(--panel-soft)]"
                  onClick={() => shiftMonth(-1)}
                  aria-label="Previous month"
                >
                  ‹
                </button>
                <div className="min-w-0 flex-1">
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
                </div>
                <button
                  type="button"
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-xl text-[var(--foreground)] transition hover:bg-[var(--panel-soft)]"
                  onClick={() => shiftMonth(1)}
                  aria-label="Next month"
                >
                  ›
                </button>
              </div>
            ) : (
              <div className="mt-3 space-y-2 px-1">
                <DateField
                  label={t("fromDate")}
                  value={customFrom}
                  max={customTo}
                  onChange={setCustomFrom}
                />
                <div className="flex justify-center" aria-hidden>
                  <span className="text-sm font-semibold text-[var(--muted)]">
                    ↓
                  </span>
                </div>
                <DateField
                  label={t("toDate")}
                  value={customTo}
                  min={customFrom}
                  onChange={setCustomTo}
                />
              </div>
            )}
          </section>

          {error ? <p className="mt-3 text-sm text-red-700">{error}</p> : null}

          <div className="mt-5 flex items-baseline justify-between gap-3">
            <h2 className="text-base font-bold text-[var(--foreground)]">
              {t("movesTitle")}
            </h2>
            {!loading && data && data.days.length > 0 ? (
              <p className="text-xs font-medium text-[var(--muted)]">
                {t("tapDayToOpen")}
              </p>
            ) : null}
          </div>

          {loading && !data ? (
            <div className="mt-3 space-y-2.5">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="surface overflow-hidden rounded-[1.35rem]"
                >
                  <div className="flex justify-between px-4 py-3">
                    <span className="cat-log-skel h-4 w-28 rounded-lg" />
                    <span className="cat-log-skel h-4 w-16 rounded-lg" />
                  </div>
                  <div className="space-y-2.5 border-t border-[var(--surface-border)] px-4 py-3">
                    <span className="cat-log-skel block h-10 w-full rounded-xl" />
                    <span className="cat-log-skel block h-10 w-[85%] rounded-xl" />
                  </div>
                </div>
              ))}
            </div>
          ) : !data || data.days.length === 0 ? (
            <div className="mt-8 px-2 text-center">
              <p className="text-base text-[var(--muted)]">
                {t("noCategoryLogs")}
              </p>
              <p className="mt-1 text-sm text-[var(--muted)]">
                {t("noCategoryLogsHint")}
              </p>
            </div>
          ) : (
            <div className="mt-3 space-y-2.5">
              {data.days.map((day) => (
                <section
                  key={day.date}
                  className="cat-log-day surface overflow-hidden rounded-[1.35rem]"
                >
                  <button
                    type="button"
                    onClick={() => openDay(day.date)}
                    className="flex w-full items-baseline justify-between gap-3 px-4 py-3 text-start transition hover:bg-[var(--panel-soft)] active:scale-[0.99]"
                  >
                    <h2 className="text-sm font-bold text-[var(--foreground)]">
                      {formatItemDate(day.date, locale)}
                    </h2>
                    <p className="text-sm font-bold tabular-nums text-rose-700 dark:text-rose-300">
                      {hideAggregates ? (
                        "••••"
                      ) : (
                        <Money
                          amount={day.total}
                          currency={currency}
                          locale={locale}
                          extraSign="−"
                        />
                      )}
                    </p>
                  </button>
                  <ul className="border-t border-[var(--surface-border)]">
                    {day.items.map((item) => {
                      const note = item.note?.trim();
                      const wallet = walletLabel(item);
                      const userName = item.user?.name;
                      const timeLabel = formatItemTime(
                        item.createdAt,
                        locale,
                      );
                      const meta = [
                        note || null,
                        wallet,
                        showUser(userName) ? labelFor(userName!, t) : "",
                        timeLabel,
                      ].filter(Boolean);
                      return (
                        <li key={`${item.kind}-${item.id}`}>
                          <button
                            type="button"
                            onClick={() => openDay(day.date)}
                            className="flex w-full items-start gap-3 px-4 py-3 text-start transition hover:bg-[var(--panel-soft)] active:bg-[var(--panel-soft)]"
                          >
                            <span
                              className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full"
                              style={{ background: item.category.color }}
                              aria-hidden
                            />
                            <div className="min-w-0 flex-1">
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <p
                                    className="truncate text-[15px] font-semibold text-[var(--foreground)]"
                                    dir="auto"
                                  >
                                    {rowTitle(item)}
                                  </p>
                                  {meta.length > 0 ? (
                                    <p
                                      className="mt-0.5 truncate text-sm text-[var(--muted)]"
                                      dir="auto"
                                    >
                                      {meta.join(" · ")}
                                    </p>
                                  ) : null}
                                </div>
                                <p className="shrink-0 text-base font-bold tabular-nums text-rose-700 dark:text-rose-300">
                                  {hideAggregates ? (
                                    "••••"
                                  ) : (
                                    <Money
                                      amount={item.amount}
                                      currency={currency}
                                      locale={locale}
                                      extraSign="−"
                                    />
                                  )}
                                </p>
                              </div>
                            </div>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              ))}
            </div>
          )}
        </>
      )}

      <BottomNav />
    </PageShell>
  );
}

export default function CategoryLogPage() {
  return (
    <Suspense fallback={null}>
      <CategoryLogInner />
    </Suspense>
  );
}
