"use client";

import { FormEvent, useEffect, useState } from "react";
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

type Karat = 18 | 21 | 24;

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
  const currency = personal?.currency ?? "EGP";
  const [data, setData] = useState<GoldSummary | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [grams, setGrams] = useState("");
  const [paidAmount, setPaidAmount] = useState("");
  const [karat, setKarat] = useState<Karat>(21);
  const [acquiredOn, setAcquiredOn] = useState(todayISO());
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [deletingId, setDeletingId] = useState("");
  const today = todayISO();
  const yesterday = yesterdayISO();

  function load(hid: string) {
    return api<GoldSummary>(householdPath(hid, "/gold")).then(setData);
  }

  useEffect(() => {
    if (!personal) return;
    setKind("PERSONAL");
    load(personal.householdId).catch((e) => setError(e.message));
  }, [personal?.householdId]);

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
    } catch (err) {
      setError(err instanceof Error ? err.message : t("couldNotSave"));
    } finally {
      setDeletingId("");
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
                ? formatItemDate(h.acquiredOn, locale)
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
                                ? `${t("goldAcquiredOn")} ${acquiredLabel}`
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
                        <div className="rounded-2xl bg-[var(--soft-amber)] px-3 py-2.5">
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
