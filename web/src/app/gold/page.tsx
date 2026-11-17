"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { api, parseAmount, todayISO, yesterdayISO } from "@/lib/api";
import { BottomNav } from "@/components/BottomNav";
import { PageShell } from "@/components/PageShell";
import { Money } from "@/components/Money";
import { useI18n } from "@/components/I18nProvider";
import { useBooks } from "@/components/BooksProvider";
import { householdPath } from "@/lib/space";
import { Hint } from "@/components/Hint";
import { fill } from "@/lib/i18n";
import { formatItemDate } from "@/lib/calendar";
import { DateField } from "@/components/DateField";
import {
  GoldPriceChart,
  type GoldChartBuy,
  type GoldChartPoint,
} from "@/components/GoldPriceChart";

type Karat = 18 | 21 | 24;
type ChartRange = "1d" | "7d" | "30d";

type GoldQuotes = {
  unit: string;
  prices: { karat: Karat; egpPerGram: number }[];
  updatedAt: string | null;
  stale: boolean;
  error: string | null;
};

type Holding = {
  id: string;
  grams: number;
  karat: Karat;
  paidAmount: number | null;
  note: string;
  acquiredOn: string | null;
  egpPerGram: number | null;
  currentValue: number | null;
  gainLoss: number | null;
  gainLossPct: number | null;
};

type GoldSummary = {
  quotes: GoldQuotes;
  holdings: Holding[];
  totalGrams: number;
  totalValue: number;
  totalPaid: number | null;
  totalGainLoss: number | null;
  totalGainLossPct: number | null;
};

type GoldChart = {
  karat: Karat;
  range: ChartRange;
  unit: string;
  series: GoldChartPoint[];
  change: { absolute: number | null; pct: number | null };
  liveEgpPerGram: number | null;
  avgBuyCost: number | null;
  buys: GoldChartBuy[];
  distribution: {
    totalGrams: number;
    totalValue: number;
    byKarat: {
      karat: Karat;
      grams: number;
      value: number;
      paid: number | null;
      pieces: number;
      pctGrams: number;
      pctValue: number;
    }[];
    byHolding: {
      id: string;
      karat: Karat;
      grams: number;
      paidAmount: number | null;
      value: number | null;
      note: string;
      acquiredOn: string | null;
      pctValue: number;
      pctGrams: number;
    }[];
  };
  quotes: GoldQuotes;
  updatedAt: string | null;
  stale: boolean;
  error: string | null;
};

const CHART_POLL_MS = 3 * 60 * 1000;

function karatLabel(
  karat: Karat,
  t: (k: "goldKarat18" | "goldKarat21" | "goldKarat24") => string,
) {
  if (karat === 18) return t("goldKarat18");
  if (karat === 21) return t("goldKarat21");
  return t("goldKarat24");
}

function gainLossClass(value: number, onDark = false) {
  if (onDark) {
    if (value > 0) return "text-emerald-100";
    if (value < 0) return "text-[#fecaca]";
    return "text-white/80";
  }
  if (value > 0) return "text-emerald-800";
  if (value < 0) return "text-red-800";
  return "text-stone-600";
}

export default function GoldPage() {
  const { t, locale } = useI18n();
  const { personal, setKind, active } = useBooks();
  // Live gold quotes and holdings are always denominated in EGP.
  const currency = "EGP";
  const [data, setData] = useState<GoldSummary | null>(null);
  const [chart, setChart] = useState<GoldChart | null>(null);
  const [chartKarat, setChartKarat] = useState<Karat>(21);
  const [chartRange, setChartRange] = useState<ChartRange>("7d");
  const [showAdd, setShowAdd] = useState(false);
  const [grams, setGrams] = useState("");
  const [paidAmount, setPaidAmount] = useState("");
  const [karat, setKarat] = useState<Karat>(21);
  const [acquiredOn, setAcquiredOn] = useState(todayISO());
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [deletingId, setDeletingId] = useState("");
  const [savingDateId, setSavingDateId] = useState("");
  const today = todayISO();
  const yesterday = yesterdayISO();

  function load(hid: string) {
    return api<GoldSummary>(householdPath(hid, "/gold")).then(setData);
  }

  const loadChart = useCallback(
    (hid: string, nextKarat: Karat, nextRange: ChartRange) => {
      return api<GoldChart>(
        householdPath(
          hid,
          `/gold/chart?karat=${nextKarat}&range=${nextRange}`,
        ),
      ).then(setChart);
    },
    [],
  );

  useEffect(() => {
    if (!personal) return;
    setKind("PERSONAL");
    load(personal.householdId).catch((e) => setError(e.message));
  }, [personal?.householdId]);

  useEffect(() => {
    if (!personal) return;
    let cancelled = false;
    const hid = personal.householdId;

    function refresh() {
      loadChart(hid, chartKarat, chartRange).catch((e) => {
        if (!cancelled) setError(e.message);
      });
    }

    refresh();
    const timer = window.setInterval(refresh, CHART_POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [personal?.householdId, chartKarat, chartRange, loadChart]);

  async function onAdd(e: FormEvent) {
    e.preventDefault();
    if (!personal) return;
    const value = parseAmount(grams);
    if (!(value > 0)) {
      setError(t("goldGramsHint"));
      return;
    }
    const paidRaw = paidAmount.trim();
    const paid = paidRaw ? parseAmount(paidRaw) : null;
    if (paidRaw && (paid == null || !(paid > 0))) {
      setError(t("goldPaidAmountHint"));
      return;
    }
    setBusy(true);
    setError("");
    try {
      const next = await api<GoldSummary>(
        householdPath(personal.householdId, "/gold"),
        {
          method: "POST",
          body: JSON.stringify({
            grams: value,
            karat,
            paidAmount: paid ?? undefined,
            acquiredOn,
            note: note.trim() || undefined,
          }),
        },
      );
      setData(next);
      setGrams("");
      setPaidAmount("");
      setAcquiredOn(todayISO());
      setNote("");
      setShowAdd(false);
      void loadChart(personal.householdId, chartKarat, chartRange);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("couldNotSave"));
    } finally {
      setBusy(false);
    }
  }

  async function onDelete(id: string) {
    if (!personal) return;
    setDeletingId(id);
    setError("");
    try {
      const next = await api<GoldSummary>(
        householdPath(personal.householdId, `/gold/${id}`),
        { method: "DELETE" },
      );
      setData(next);
      void loadChart(personal.householdId, chartKarat, chartRange);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("couldNotSave"));
    } finally {
      setDeletingId("");
    }
  }

  async function onUpdateAcquiredOn(id: string, nextDate: string) {
    if (!personal || !nextDate) return;
    const current = data?.holdings.find((h) => h.id === id)?.acquiredOn;
    if (current === nextDate) return;
    setSavingDateId(id);
    setError("");
    try {
      const next = await api<GoldSummary>(
        householdPath(personal.householdId, `/gold/${id}`),
        {
          method: "PATCH",
          body: JSON.stringify({ acquiredOn: nextDate }),
        },
      );
      setData(next);
      void loadChart(personal.householdId, chartKarat, chartRange);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("couldNotSave"));
    } finally {
      setSavingDateId("");
    }
  }

  if (active?.kind === "HOUSE" && !personal) {
    return (
      <PageShell>
        <p className="text-stone-600">{t("goldHint")}</p>
        <BottomNav />
      </PageShell>
    );
  }

  const quotes = data?.quotes;
  const updated =
    quotes?.updatedAt != null
      ? new Date(quotes.updatedAt).toLocaleString(
          locale === "ar" ? "ar-EG" : "en-GB",
          { dateStyle: "medium", timeStyle: "short" },
        )
      : null;

  return (
    <PageShell>
      <Link
        href="/tools"
        className="inline-flex min-h-10 items-center gap-1 text-sm font-semibold text-[var(--accent-b-text)]"
      >
        ← {t("toolsTitle")}
      </Link>

      <header className="mt-1">
        <h1 className="page-title">{t("goldTitle")}</h1>
        <p className="mt-1 text-sm leading-relaxed text-[var(--muted)]">
          {t("goldHint")}
        </p>
      </header>
      {error ? <p className="mt-3 text-red-700">{error}</p> : null}

      <section className="mt-4 overflow-hidden rounded-[1.75rem] bg-amber-900 p-5 text-white shadow-lg">
        <p className="text-sm opacity-85">{t("goldTotalValue")}</p>
        <p className="mt-1 text-[clamp(1.5rem,7.5vw,2.35rem)] font-bold leading-tight tracking-tight">
          {data ? (
            <Money amount={data.totalValue} currency={currency} locale={locale} />
          ) : (
            "…"
          )}
        </p>
        {data && data.totalGrams > 0 ? (
          <p className="mt-1.5 text-sm opacity-80">
            {fill(t("goldTotalGramsOf"), {
              g: String(Math.round(data.totalGrams * 1000) / 1000),
            })}
          </p>
        ) : null}
        {data?.totalGainLoss != null ? (
          <p
            className={`mt-3 inline-flex flex-wrap items-baseline gap-1 rounded-full bg-white/15 px-2.5 py-1 text-sm font-semibold ${gainLossClass(data.totalGainLoss, true)}`}
          >
            <Money
              amount={data.totalGainLoss}
              currency={currency}
              locale={locale}
              extraSign={data.totalGainLoss >= 0 ? "+" : "−"}
            />
            {data.totalGainLossPct != null ? (
              <span className="opacity-90">
                ({data.totalGainLossPct >= 0 ? "+" : ""}
                {data.totalGainLossPct}%)
              </span>
            ) : null}
          </p>
        ) : null}
      </section>

      <section className="surface mt-4 rounded-[1.5rem] p-4">
        <h2 className="text-sm font-semibold text-[var(--foreground)]">
          {t("goldLivePrices")}
        </h2>
        {quotes?.error && !quotes.prices.length ? (
          <p className="mt-2 text-sm text-red-700">{t("goldNoPrice")}</p>
        ) : null}
        {quotes?.stale && quotes.prices.length ? (
          <Hint>{t("goldStale")}</Hint>
        ) : null}
        <div className="mt-3 grid grid-cols-3 gap-2">
          {([24, 21, 18] as Karat[]).map((k) => {
            const price = quotes?.prices.find((p) => p.karat === k)?.egpPerGram;
            return (
              <div
                key={k}
                className="rounded-2xl bg-[var(--soft-amber)] px-2.5 py-3 text-center"
              >
                <p className="text-xs font-medium text-[var(--muted)]">
                  {karatLabel(k, t)}
                </p>
                <p className="mt-1 text-sm font-bold tabular-nums">
                  {price != null ? (
                    <Money amount={price} currency={currency} locale={locale} />
                  ) : (
                    "…"
                  )}
                </p>
                <p className="mt-0.5 text-[10px] text-[var(--muted)]">
                  {t("goldPerGram")}
                </p>
              </div>
            );
          })}
        </div>
        {updated ? (
          <p className="mt-3 text-xs text-[var(--muted)]">
            {t("goldUpdated")}: {updated}
          </p>
        ) : null}
      </section>

      <section className="surface mt-4 rounded-[1.5rem] p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-[var(--foreground)]">
              {t("goldChartTitle")}
            </h2>
            <p className="mt-0.5 text-xs leading-relaxed text-[var(--muted)]">
              {t("goldChartHint")}
            </p>
          </div>
          <span className="shrink-0 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">
            {t("goldChartLive")}
          </span>
        </div>

        <div className="mt-3 flex flex-wrap gap-1.5">
          {([18, 21, 24] as Karat[]).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setChartKarat(k)}
              className={`chip ${chartKarat === k ? "chip-active" : ""}`}
            >
              {karatLabel(k, t)}
            </button>
          ))}
        </div>
        <div className="mt-2 flex gap-1.5">
          {(
            [
              ["1d", "goldChartRange1d"],
              ["7d", "goldChartRange7d"],
              ["30d", "goldChartRange30d"],
            ] as const
          ).map(([range, key]) => (
            <button
              key={range}
              type="button"
              onClick={() => setChartRange(range)}
              className={`chip flex-1 ${chartRange === range ? "chip-active" : ""}`}
            >
              {t(key)}
            </button>
          ))}
        </div>

        {chart?.change.absolute != null && chart.change.pct != null ? (
          <p
            className={`mt-3 text-sm font-semibold tabular-nums ${gainLossClass(chart.change.absolute)}`}
          >
            {t("goldChartChange")}:{" "}
            <Money
              amount={chart.change.absolute}
              currency={currency}
              locale={locale}
              extraSign={chart.change.absolute >= 0 ? "+" : "−"}
            />
            <span className="ms-1 opacity-80">
              ({chart.change.pct >= 0 ? "+" : ""}
              {chart.change.pct}%)
            </span>
          </p>
        ) : null}

        <div className="mt-2">
          <GoldPriceChart
            series={chart?.series ?? []}
            buys={chart?.buys ?? []}
            avgBuyCost={chart?.avgBuyCost ?? null}
            currency={currency}
            locale={locale}
            label={t("goldChartTitle")}
            buyLabel={t("goldChartBuy")}
            avgBuyLabel={t("goldChartAvgBuy")}
            emptyLabel={
              chart == null ? "…" : t("goldChartEmpty")
            }
          />
        </div>

        <ul className="mt-3 space-y-1 text-[11px] text-[var(--muted)]">
          <li className="flex items-center gap-2">
            <span className="inline-block h-2.5 w-2.5 rounded-full border-2 border-amber-700 bg-amber-50" />
            {t("goldChartLegendBuy")}
          </li>
          <li className="flex items-center gap-2">
            <span
              className="inline-block h-0.5 w-4 border-t-2 border-dashed border-amber-800"
              aria-hidden
            />
            {t("goldChartLegendAvg")}
          </li>
        </ul>
      </section>

      {chart?.distribution &&
      (chart.distribution.byKarat.length > 0 ||
        chart.distribution.byHolding.length > 0) ? (
        <section className="surface mt-4 rounded-[1.5rem] p-4">
          <h2 className="text-sm font-semibold text-[var(--foreground)]">
            {t("goldDistTitle")}
          </h2>
          <p className="mt-0.5 text-xs text-[var(--muted)]">
            {t("goldDistHint")}
          </p>

          {chart.distribution.byKarat.length > 0 ? (
            <div className="mt-3">
              <p className="text-xs font-semibold text-[var(--muted)]">
                {t("goldDistByKarat")}
              </p>
              <ul className="mt-2 space-y-2.5">
                {chart.distribution.byKarat.map((row) => (
                  <li key={row.karat}>
                    <div className="flex items-baseline justify-between gap-2 text-sm">
                      <span className="font-semibold">
                        {karatLabel(row.karat, t)}
                      </span>
                      <span className="tabular-nums text-[var(--muted)]">
                        {row.grams}
                        {locale === "ar" ? " جم" : "g"} · {row.pctValue}%
                      </span>
                    </div>
                    <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-[var(--panel-soft)]">
                      <div
                        className="h-full rounded-full bg-amber-700"
                        style={{
                          width: `${Math.max(row.pctValue, row.pctGrams ? 2 : 0)}%`,
                        }}
                      />
                    </div>
                    <p className="mt-1 text-[11px] text-[var(--muted)]">
                      {row.pctGrams}% {t("goldDistGramsShare")} ·{" "}
                      {row.pctValue}% {t("goldDistValueShare")}
                      {row.value > 0 ? (
                        <>
                          {" · "}
                          <Money
                            amount={row.value}
                            currency={currency}
                            locale={locale}
                          />
                        </>
                      ) : null}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {chart.distribution.byHolding.length > 1 ? (
            <div className="mt-4">
              <p className="text-xs font-semibold text-[var(--muted)]">
                {t("goldDistByPiece")}
              </p>
              <ul className="mt-2 space-y-2">
                {chart.distribution.byHolding.map((row) => {
                  const title =
                    row.note?.trim() ||
                    `${karatLabel(row.karat, t)} · ${row.grams}${locale === "ar" ? " جم" : "g"}`;
                  return (
                    <li key={row.id}>
                      <div className="flex items-baseline justify-between gap-2 text-sm">
                        <span className="truncate font-medium" dir="auto">
                          {title}
                        </span>
                        <span className="shrink-0 tabular-nums text-[var(--muted)]">
                          {row.pctValue}%
                        </span>
                      </div>
                      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-[var(--panel-soft)]">
                        <div
                          className="h-full rounded-full bg-amber-600/80"
                          style={{
                            width: `${Math.max(row.pctValue, 2)}%`,
                          }}
                        />
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : null}
        </section>
      ) : null}

      <button
        type="button"
        onClick={() => setShowAdd((v) => !v)}
        className="mt-4 flex min-h-12 w-full items-center justify-center rounded-2xl bg-amber-900 text-base font-semibold text-white shadow-sm"
      >
        {showAdd ? t("goalsCancel") : `＋ ${t("goldAdd")}`}
      </button>

      {showAdd ? (
        <form
          onSubmit={onAdd}
          className="surface mt-3 space-y-3 rounded-[1.5rem] p-4"
        >
          <label className="block">
            <span className="mb-1 block font-medium">{t("goldGrams")}</span>
            <input
              inputMode="decimal"
              dir="ltr"
              required
              value={grams}
              onChange={(e) => setGrams(e.target.value)}
              className="field amount-input w-full rounded-2xl px-4 py-4 text-2xl"
              placeholder="8"
            />
            <Hint>{t("goldGramsHint")}</Hint>
          </label>
          <div>
            <p className="mb-1 font-medium">{t("goldKarat")}</p>
            <div className="grid grid-cols-3 gap-2">
              {([18, 21, 24] as Karat[]).map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setKarat(k)}
                  className={`rounded-2xl px-2 py-3 text-lg font-bold ${
                    karat === k
                      ? "bg-amber-800 text-white shadow"
                      : "bg-[var(--panel-soft)] text-[var(--foreground)]"
                  }`}
                >
                  {karatLabel(k, t)}
                </button>
              ))}
            </div>
            <Hint>{t("goldKaratHint")}</Hint>
          </div>
          <label className="block">
            <span className="mb-1 block font-medium">{t("goldPaidAmount")}</span>
            <input
              inputMode="decimal"
              dir="ltr"
              value={paidAmount}
              onChange={(e) => setPaidAmount(e.target.value)}
              className="field amount-input w-full rounded-2xl px-4 py-4 text-2xl"
              placeholder="50000"
            />
            <Hint>{t("goldPaidAmountHint")}</Hint>
          </label>
          <div>
            <p className="mb-1 font-medium">{t("goldAcquiredOn")}</p>
            <div className="flex gap-1.5">
              <button
                type="button"
                onClick={() => setAcquiredOn(today)}
                className={`chip flex-1 ${acquiredOn === today ? "chip-active" : ""}`}
              >
                {t("today")}
              </button>
              <button
                type="button"
                onClick={() => setAcquiredOn(yesterday)}
                className={`chip flex-1 ${
                  acquiredOn === yesterday ? "chip-active" : ""
                }`}
              >
                {t("yesterday")}
              </button>
            </div>
            <DateField
              className="mt-2"
              value={acquiredOn}
              onChange={setAcquiredOn}
            />
          </div>
          <label className="block">
            <span className="mb-1 block font-medium">{t("noteOptional")}</span>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="field w-full rounded-2xl px-4 py-3 text-lg"
              dir="auto"
            />
          </label>
          <button
            type="submit"
            disabled={busy || !personal}
            className="flex min-h-12 w-full items-center justify-center rounded-2xl bg-amber-800 text-base font-semibold text-white disabled:opacity-60"
          >
            {busy ? t("saving") : t("save")}
          </button>
        </form>
      ) : null}

      <section className="mt-6">
        <h2 className="text-base font-bold text-[var(--foreground)]">
          {t("goldHoldings")}
        </h2>
        <p className="mt-0.5 text-sm text-[var(--muted)]">
          {t("goldHoldingsHint")}
        </p>
        {!data ? (
          <p className="mt-3 text-[var(--muted)]">…</p>
        ) : data.holdings.length === 0 ? (
          <p className="mt-3 text-sm text-[var(--muted)]">{t("goldEmpty")}</p>
        ) : (
          <ul className="mt-3 space-y-3">
            {data.holdings.map((h) => {
              const gain = h.gainLoss;
              const paidPerGram =
                h.paidAmount != null && h.grams > 0
                  ? Math.round((h.paidAmount / h.grams) * 100) / 100
                  : null;
              const title =
                h.note?.trim() ||
                `${karatLabel(h.karat, t)} · ${h.grams}${locale === "ar" ? " جم" : "g"}`;
              const acquiredLabel = h.acquiredOn
                ? formatItemDate(h.acquiredOn, locale, {
                    todayLabel: t("today"),
                    yesterdayLabel: t("yesterday"),
                  })
                : null;
              const gainTone =
                gain == null
                  ? "bg-[var(--panel-soft)] text-[var(--muted)]"
                  : gain >= 0
                    ? "bg-[var(--soft-emerald)] text-emerald-900 dark:text-emerald-200"
                    : "bg-[var(--soft-red)] text-red-800 dark:text-red-300";
              return (
                <li
                  key={h.id}
                  className="surface overflow-hidden rounded-[1.35rem] px-4 py-3.5"
                >
                  <div className="flex items-start gap-3">
                    <span
                      className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full bg-amber-700"
                      aria-hidden
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p
                            className="truncate text-[15px] font-semibold text-[var(--foreground)]"
                            dir="auto"
                          >
                            {title}
                          </p>
                          <p className="mt-0.5 text-xs text-[var(--muted)]">
                            {[
                              karatLabel(h.karat, t),
                              `${h.grams}${locale === "ar" ? " جم" : "g"}`,
                              acquiredLabel
                                ? `${t("goldAcquiredOn")}: ${acquiredLabel}`
                                : null,
                            ]
                              .filter(Boolean)
                              .join(" · ")}
                          </p>
                        </div>
                        <p className="shrink-0 text-base font-bold tabular-nums text-[var(--foreground)]">
                          {h.currentValue != null ? (
                            <Money
                              amount={h.currentValue}
                              currency={currency}
                              locale={locale}
                            />
                          ) : (
                            "…"
                          )}
                        </p>
                      </div>

                      <div className="mt-3 grid grid-cols-2 gap-2">
                        <label className="relative col-span-2 block cursor-pointer rounded-2xl bg-[var(--soft-amber)] px-3 py-2.5">
                          <p className="text-[10px] font-medium uppercase tracking-wide text-[var(--muted)]">
                            {t("goldAcquiredOn")}
                            {savingDateId === h.id ? (
                              <span className="ms-1 normal-case tracking-normal opacity-70">
                                · {t("saving")}
                              </span>
                            ) : null}
                          </p>
                          <p
                            className={`mt-0.5 text-sm font-bold ${
                              acquiredLabel
                                ? "text-[var(--foreground)]"
                                : "text-[var(--muted)]"
                            }`}
                          >
                            {acquiredLabel || t("goldAcquiredOnSet")}
                          </p>
                          <input
                            type="date"
                            value={h.acquiredOn ?? ""}
                            onChange={(e) => {
                              if (e.target.value) {
                                void onUpdateAcquiredOn(h.id, e.target.value);
                              }
                            }}
                            onClick={(e) => {
                              const input = e.currentTarget;
                              try {
                                if (typeof input.showPicker === "function") {
                                  void input.showPicker();
                                }
                              } catch {
                                // Native picker unavailable — click still focuses.
                              }
                            }}
                            className="absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0"
                            aria-label={t("goldAcquiredOn")}
                          />
                        </label>
                        <div className="rounded-2xl bg-[var(--panel-soft)] px-3 py-2.5">
                          <p className="text-[10px] font-medium uppercase tracking-wide text-[var(--muted)]">
                            {t("goldPaid")}
                          </p>
                          <p className="mt-0.5 text-sm font-bold tabular-nums">
                            {h.paidAmount != null ? (
                              <Money
                                amount={h.paidAmount}
                                currency={currency}
                                locale={locale}
                              />
                            ) : (
                              "—"
                            )}
                          </p>
                        </div>
                        <div className="rounded-2xl bg-[var(--panel-soft)] px-3 py-2.5">
                          <p className="text-[10px] font-medium uppercase tracking-wide text-[var(--muted)]">
                            {t("goldCurrent")}
                          </p>
                          <p className="mt-0.5 text-sm font-bold tabular-nums">
                            {h.currentValue != null ? (
                              <Money
                                amount={h.currentValue}
                                currency={currency}
                                locale={locale}
                              />
                            ) : (
                              "…"
                            )}
                          </p>
                        </div>
                      </div>

                      {(paidPerGram != null || h.egpPerGram != null) && (
                        <div className="mt-2 grid grid-cols-2 gap-2">
                          <div className="rounded-2xl bg-[var(--panel-soft)] px-3 py-2">
                            <p className="text-[10px] font-medium text-[var(--muted)]">
                              {t("goldCostPerGram")}
                            </p>
                            <p className="mt-0.5 text-xs font-semibold tabular-nums">
                              {paidPerGram != null ? (
                                <Money
                                  amount={paidPerGram}
                                  currency={currency}
                                  locale={locale}
                                />
                              ) : (
                                "—"
                              )}
                            </p>
                          </div>
                          <div className="rounded-2xl bg-[var(--panel-soft)] px-3 py-2">
                            <p className="text-[10px] font-medium text-[var(--muted)]">
                              {t("goldLivePerGramShort")}
                            </p>
                            <p className="mt-0.5 text-xs font-semibold tabular-nums">
                              {h.egpPerGram != null ? (
                                <Money
                                  amount={h.egpPerGram}
                                  currency={currency}
                                  locale={locale}
                                />
                              ) : (
                                "…"
                              )}
                            </p>
                          </div>
                        </div>
                      )}

                      {gain != null ? (
                        <div
                          className={`mt-2.5 flex items-center justify-between gap-2 rounded-2xl px-3 py-2.5 ${gainTone}`}
                        >
                          <span className="text-xs font-semibold">
                            {gain >= 0 ? t("goldGain") : t("goldLoss")}
                            <span className="ms-1 opacity-80">
                              · {t("goldVsBuy")}
                            </span>
                          </span>
                          <span className="shrink-0 text-sm font-bold tabular-nums">
                            <Money
                              amount={gain}
                              currency={currency}
                              locale={locale}
                              extraSign={gain >= 0 ? "+" : "−"}
                            />
                            {h.gainLossPct != null ? (
                              <span className="ms-1 opacity-90">
                                ({h.gainLossPct >= 0 ? "+" : ""}
                                {h.gainLossPct}%)
                              </span>
                            ) : null}
                          </span>
                        </div>
                      ) : (
                        <p className="mt-2.5 text-xs leading-snug text-[var(--muted)]">
                          {t("goldNoPaidHint")}
                        </p>
                      )}

                      <button
                        type="button"
                        disabled={!!deletingId}
                        onClick={() => onDelete(h.id)}
                        className="mt-2.5 text-xs font-semibold text-red-700 disabled:opacity-60"
                      >
                        {deletingId === h.id ? t("saving") : t("goldDelete")}
                      </button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
      <BottomNav />
    </PageShell>
  );
}
