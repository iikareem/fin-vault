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
import { formatItemDate, isoLocal } from "@/lib/calendar";
import { householdPath } from "@/lib/space";
import { Hint } from "@/components/Hint";
import { DateField } from "@/components/DateField";

type RangeMode = "month" | "custom";

type CatMeta = {
  id: string;
  name: string;
  nameAr?: string | null;
  color: string;
};

type LogItem = {
  id: string;
  kind: "tx" | "claim";
  amount: number;
  note: string;
  type?: string;
  category: {
    id: string;
    name: string;
    nameAr?: string | null;
    color: string;
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

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function monthBounds(cursor: Date) {
  const y = cursor.getFullYear();
  const m = cursor.getMonth();
  return {
    from: isoLocal(new Date(y, m, 1)),
    to: isoLocal(new Date(y, m + 1, 0)),
  };
}

function isExactMonth(from: string, to: string) {
  const [fy, fm, fd] = from.split("-").map(Number);
  if (!fy || !fm || fd !== 1) return false;
  const last = isoLocal(new Date(fy, fm, 0));
  return to === last;
}

function monthLabel(from: string, locale: string) {
  const [y, m] = from.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString(locale === "ar" ? "ar" : "en", {
    month: "long",
    year: "numeric",
  });
}

function CategoryLogInner() {
  const { t, locale } = useI18n();
  const { active, house } = useBooks();
  const router = useRouter();
  const search = useSearchParams();
  const currency = active?.currency ?? "EGP";
  const hideAggregates = active?.kind === "HOUSE" && house?.role !== "ADMIN";

  const catsParam = search.get("cats") ?? "";
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
    initialFrom && initialTo && isExactMonth(initialFrom, initialTo)
      ? "month"
      : initialFrom && initialTo
        ? "custom"
        : "month",
  );
  const [cursor, setCursor] = useState(() => {
    if (initialFrom) {
      const [y, m] = initialFrom.split("-").map(Number);
      if (y && m) return new Date(y, m - 1, 1);
    }
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [customFrom, setCustomFrom] = useState(
    () => initialFrom || monthBounds(new Date()).from,
  );
  const [customTo, setCustomTo] = useState(
    () => initialTo || monthBounds(new Date()).to,
  );

  const { from, to } = useMemo(() => {
    if (rangeMode === "month") return monthBounds(cursor);
    return {
      from: customFrom,
      to: customTo >= customFrom ? customTo : customFrom,
    };
  }, [rangeMode, cursor, customFrom, customTo]);

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
    api<CategoryLog>(
      householdPath(active.householdId, `/analytics/category-log?${q}`),
    )
      .then((res) => {
        setData(res);
        setError("");
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [active?.householdId, from, to, catIds.join(",")]);

  useEffect(() => {
    if (catIds.length === 0) return;
    const params = new URLSearchParams({
      cats: catIds.join(","),
      from,
      to,
    });
    router.replace(`/analytics/category-log?${params}`, { scroll: false });
  }, [from, to, catIds.join(",")]);

  const categories = data?.categories ?? [];
  const visibleCats = categories.slice(0, 4);
  const extraCats = Math.max(0, categories.length - visibleCats.length);

  function shiftMonth(dir: number) {
    setCursor(
      (c) => new Date(c.getFullYear(), c.getMonth() + dir, 1),
    );
  }

  function rowTitle(item: LogItem) {
    return categoryLabel(item.category, locale, t);
  }

  function showUser(name?: string) {
    if (!name || name === "House" || name === "personal" || name === "Personal") {
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
        className="inline-flex items-center gap-1 text-sm font-semibold text-[var(--muted)]"
      >
        ← {t("categoryLogsBack")}
      </Link>

      <h1 className="page-title mt-2">{t("categoryLogs")}</h1>

      {catIds.length === 0 ? (
        <p className="mt-4 text-sm text-[var(--muted)]">{t("noCategoryLogs")}</p>
      ) : (
        <>
          <section className="cat-log-hero mt-4 rounded-[1.75rem] px-4 py-4">
            <div className="flex flex-wrap items-center gap-2">
              {loading && !data ? (
                <span className="cat-log-skel h-6 w-40" />
              ) : (
                <>
                  {visibleCats.map((c) => (
                    <span
                      key={c.id}
                      className="inline-flex max-w-[9rem] items-center gap-1.5 rounded-full bg-[var(--panel-soft)] px-2.5 py-1 text-xs font-semibold"
                    >
                      <span
                        className="h-2 w-2 shrink-0 rounded-full"
                        style={{ background: c.color }}
                      />
                      <span className="min-w-0 truncate">
                        {categoryLabel(c, locale, t)}
                      </span>
                    </span>
                  ))}
                  {extraCats > 0 ? (
                    <span className="rounded-full bg-[var(--panel-soft)] px-2.5 py-1 text-xs font-semibold text-[var(--muted)]">
                      +{extraCats}
                    </span>
                  ) : null}
                </>
              )}
            </div>

            <p className="mt-4 text-sm text-[var(--muted)]">{t("selectedSpend")}</p>
            <p className="mt-1 text-3xl font-bold tracking-tight text-red-800 tabular-nums">
              {loading && !data ? (
                <span className="cat-log-skel inline-block h-9 w-36" />
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
                <span className="cat-log-skel inline-block h-4 w-44" />
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

          <section className="mt-4">
            <div className="seg grid-cols-2">
              {(["month", "custom"] as RangeMode[]).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => {
                    setRangeMode(mode);
                    if (mode === "month") {
                      const bounds = monthBounds(cursor);
                      setCustomFrom(bounds.from);
                      setCustomTo(bounds.to);
                    }
                  }}
                  className={`rounded-2xl py-2.5 text-base font-bold transition ${
                    rangeMode === mode
                      ? "bg-[var(--surface-bg)] text-[var(--foreground)] shadow-sm"
                      : "text-[var(--muted)]"
                  }`}
                >
                  {mode === "month" ? t("monthRange") : t("customRange")}
                </button>
              ))}
            </div>

            {rangeMode === "month" ? (
              <div className="mt-3 flex items-center justify-between gap-3">
                <button
                  type="button"
                  className="icon-btn px-4 text-xl"
                  onClick={() => shiftMonth(-1)}
                  aria-label="Previous month"
                >
                  ‹
                </button>
                <div className="min-w-0 flex-1 text-center">
                  <input
                    type="month"
                    value={`${cursor.getFullYear()}-${pad(cursor.getMonth() + 1)}`}
                    onChange={(e) => {
                      if (!e.target.value) return;
                      setCursor(new Date(`${e.target.value}-01T12:00:00`));
                    }}
                    className="field text-center text-lg font-semibold"
                    aria-label={monthLabel(from, locale)}
                  />
                </div>
                <button
                  type="button"
                  className="icon-btn px-4 text-xl"
                  onClick={() => shiftMonth(1)}
                  aria-label="Next month"
                >
                  ›
                </button>
              </div>
            ) : (
              <div className="period-range mt-3 space-y-2">
                <DateField
                  label={t("fromDate")}
                  value={customFrom}
                  max={customTo}
                  onChange={setCustomFrom}
                />
                <div className="flex justify-center" aria-hidden>
                  <span className="text-sm font-semibold text-[var(--muted)]">↓</span>
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

          {error ? <p className="mt-3 text-red-700">{error}</p> : null}

          {loading && !data ? (
            <div className="mt-5 space-y-3">
              {[0, 1, 2].map((i) => (
                <div key={i} className="surface overflow-hidden rounded-2xl">
                  <div className="cat-log-day-head flex justify-between px-4 py-2.5">
                    <span className="cat-log-skel h-4 w-28" />
                    <span className="cat-log-skel h-4 w-16" />
                  </div>
                  <div className="space-y-3 px-4 py-3">
                    <span className="cat-log-skel block h-10 w-full" />
                    <span className="cat-log-skel block h-10 w-[85%]" />
                  </div>
                </div>
              ))}
            </div>
          ) : !data || data.days.length === 0 ? (
            <div className="mt-8 px-2 text-center">
              <p className="text-base font-medium">{t("noCategoryLogs")}</p>
              <Hint>{t("noCategoryLogsHint")}</Hint>
            </div>
          ) : (
            <div className="mt-5 space-y-3">
              {data.days.map((day) => (
                <section
                  key={day.date}
                  className="cat-log-day surface overflow-hidden rounded-2xl"
                >
                  <button
                    type="button"
                    onClick={() => openDay(day.date)}
                    className="cat-log-day-head flex w-full items-baseline justify-between gap-3 px-4 py-2.5 text-start transition active:bg-[var(--panel-soft)]"
                  >
                    <h2 className="text-sm font-semibold">
                      {formatItemDate(day.date, locale)}
                    </h2>
                    <p className="text-sm font-bold tabular-nums text-red-800">
                      {hideAggregates ? (
                        "••••"
                      ) : (
                        <Money
                          amount={day.total}
                          currency={currency}
                          locale={locale}
                        />
                      )}
                    </p>
                  </button>
                  <ul>
                    {day.items.map((item) => {
                      const note = item.note?.trim();
                      const wallet = walletLabel(item);
                      const userName = item.user?.name;
                      const meta = [
                        wallet,
                        showUser(userName) ? labelFor(userName!, t) : "",
                      ].filter(Boolean);
                      return (
                        <li key={`${item.kind}-${item.id}`}>
                          <button
                            type="button"
                            onClick={() => openDay(day.date)}
                            className="cat-log-row flex w-full items-stretch gap-3 px-4 py-3 text-start transition active:bg-[var(--panel-soft)]"
                          >
                            <span
                              className="cat-log-tick"
                              style={{ background: item.category.color }}
                              aria-hidden
                            />
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-semibold leading-snug">
                                {rowTitle(item)}
                              </p>
                              {note ? (
                                <p className="mt-0.5 text-sm text-[var(--muted)]">
                                  {note}
                                </p>
                              ) : null}
                              {meta.length > 0 ? (
                                <p className="mt-0.5 text-[11px] text-[var(--muted)]">
                                  {meta.join(" · ")}
                                </p>
                              ) : null}
                            </div>
                            <p className="shrink-0 self-center text-sm font-bold tabular-nums text-red-800">
                              {hideAggregates ? (
                                "••••"
                              ) : (
                                <Money
                                  amount={item.amount}
                                  currency={currency}
                                  locale={locale}
                                />
                              )}
                            </p>
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
