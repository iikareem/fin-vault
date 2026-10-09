"use client";

import { FormEvent, useEffect, useState } from "react";
import { api, parseAmount } from "@/lib/api";
import { BottomNav } from "@/components/BottomNav";
import { PageShell } from "@/components/PageShell";
import { Money } from "@/components/Money";
import { useI18n } from "@/components/I18nProvider";
import { useBooks } from "@/components/BooksProvider";
import { householdPath } from "@/lib/space";
import { Hint } from "@/components/Hint";
import { fill } from "@/lib/i18n";

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
  const [grams, setGrams] = useState("");
  const [paidAmount, setPaidAmount] = useState("");
  const [karat, setKarat] = useState<Karat>(21);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [deletingId, setDeletingId] = useState("");

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
            note: note.trim() || undefined,
          }),
        },
      );
      setData(next);
      setGrams("");
      setPaidAmount("");
      setNote("");
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
      <h1 className="page-title">
        🥇 {t("goldTitle")}
      </h1>
      <Hint>{t("goldHint")}</Hint>
      {error ? <p className="mt-3 text-red-700">{error}</p> : null}

      <section className="mt-4 rounded-[1.75rem] bg-amber-900 p-5 text-white shadow-lg">
        <p className="text-base opacity-90">{t("goldTotalValue")}</p>
        <p className="mt-1 text-[clamp(1.4rem,7.2vw,2.25rem)] font-bold leading-tight">
          {data ? (
            <Money amount={data.totalValue} currency={currency} locale={locale} />
          ) : (
            "…"
          )}
        </p>
        {data && data.totalGrams > 0 ? (
          <p className="mt-2 text-sm opacity-80">
            {data.totalGrams} · {t("goldGrams")}
          </p>
        ) : null}
        {data?.totalPaid != null && data.totalGainLoss != null ? (
          <div className="mt-3 space-y-1 border-t border-white/20 pt-3 text-sm">
            <p className="flex items-center justify-between gap-2 opacity-90">
              <span>{t("goldTotalPaid")}</span>
              <Money
                amount={data.totalPaid}
                currency={currency}
                locale={locale}
              />
            </p>
            <p
              className={`flex items-center justify-between gap-2 font-semibold ${gainLossClass(data.totalGainLoss, true)}`}
            >
              <span>{t("goldTotalGainLoss")}</span>
              <span className="inline-flex flex-wrap items-baseline justify-end gap-1">
                <Money
                  amount={data.totalGainLoss}
                  currency={currency}
                  locale={locale}
                  extraSign={data.totalGainLoss >= 0 ? "+" : "−"}
                />
                {data.totalGainLossPct != null ? (
                  <span>
                    ({data.totalGainLossPct >= 0 ? "+" : ""}
                    {data.totalGainLossPct}%)
                  </span>
                ) : null}
              </span>
            </p>
          </div>
        ) : null}
      </section>

      <section className="surface mt-4 rounded-[1.75rem] p-4">
        <h2 className="text-xl font-semibold">{t("goldLivePrices")}</h2>
        {quotes?.error && !quotes.prices.length ? (
          <p className="mt-2 text-red-700">{t("goldNoPrice")}</p>
        ) : null}
        {quotes?.stale && quotes.prices.length ? (
          <Hint>{t("goldStale")}</Hint>
        ) : null}
        <div className="mt-3 grid grid-cols-1 gap-2 min-[380px]:grid-cols-3">
          {([18, 21, 24] as Karat[]).map((k) => {
            const price = quotes?.prices.find((p) => p.karat === k)?.egpPerGram;
            return (
              <div key={k} className="rounded-2xl bg-amber-50 px-3 py-3">
                <p className="text-sm text-stone-600">{karatLabel(k, t)}</p>
                <p className="mt-1 font-semibold">
                  {price != null ? (
                    <Money amount={price} currency={currency} locale={locale} />
                  ) : (
                    "…"
                  )}
                </p>
                <p className="text-xs text-stone-500">{t("goldPerGram")}</p>
              </div>
            );
          })}
        </div>
        {updated ? (
          <p className="mt-3 text-sm text-stone-500">
            {t("goldUpdated")}: {updated}
          </p>
        ) : null}
      </section>

      <form
        onSubmit={onAdd}
        className="mt-5 space-y-3 rounded-[1.75rem] bg-white p-4 shadow-sm"
      >
        <h2 className="text-xl font-semibold">➕ {t("goldAdd")}</h2>
        <label className="block">
          <span className="mb-1 block font-medium">{t("goldGrams")}</span>
          <input
            inputMode="decimal"
            dir="ltr"
            required
            value={grams}
            onChange={(e) => setGrams(e.target.value)}
            className="amount-input w-full rounded-2xl border border-stone-300 bg-white px-4 py-4 text-2xl"
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
                    : "bg-stone-100 text-stone-700"
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
            className="amount-input w-full rounded-2xl border border-stone-300 bg-white px-4 py-4 text-2xl"
            placeholder="50000"
          />
          <Hint>{t("goldPaidAmountHint")}</Hint>
        </label>
        <label className="block">
          <span className="mb-1 block font-medium">{t("noteOptional")}</span>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="w-full rounded-2xl border border-stone-300 bg-white px-4 py-3 text-lg"
          />
        </label>
        <button
          type="submit"
          disabled={busy || !personal}
          className="flex min-h-14 w-full items-center justify-center rounded-2xl bg-amber-800 text-lg font-semibold text-white disabled:opacity-60"
        >
          {busy ? t("saving") : t("save")}
        </button>
      </form>

      <section className="surface mt-6 overflow-hidden rounded-[1.75rem]">
        <div className="border-b border-amber-100/80 bg-amber-50/60 px-4 py-3">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="text-xl font-semibold">{t("goldHoldings")}</h2>
            {data && data.holdings.length > 0 ? (
              <span className="text-sm font-medium text-stone-500">
                {data.holdings.length === 1
                  ? t("goldPieceOne")
                  : fill(t("goldPieces"), {
                      n: String(data.holdings.length),
                    })}
              </span>
            ) : null}
          </div>
          <Hint>{t("goldHoldingsHint")}</Hint>
        </div>

        {!data ? (
          <p className="px-4 py-5 text-stone-500">…</p>
        ) : data.holdings.length === 0 ? (
          <p className="px-4 py-5 text-stone-500">{t("goldEmpty")}</p>
        ) : (
          <ul className="divide-y divide-stone-100">
            {data.holdings.map((h) => {
              const gain = h.gainLoss;
              return (
                <li key={h.id} className="px-4 py-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0" dir="auto">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-lg font-semibold text-stone-900">
                          {h.grams}{" "}
                          <span className="text-base font-medium text-stone-500">
                            {t("goldGrams")}
                          </span>
                        </p>
                        <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-sm font-semibold text-amber-900">
                          {karatLabel(h.karat, t)}
                        </span>
                      </div>
                      {h.note ? (
                        <p className="mt-1 text-sm text-stone-500">{h.note}</p>
                      ) : null}
                      {h.acquiredOn ? (
                        <p className="mt-0.5 text-xs text-stone-400">
                          {h.acquiredOn}
                        </p>
                      ) : null}
                    </div>
                    <div className="shrink-0 text-left">
                      <p className="text-xs text-stone-500">{t("goldCurrent")}</p>
                      <p className="font-bold text-stone-900">
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

                  {h.paidAmount != null ? (
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <div className="rounded-2xl bg-stone-50 px-3 py-2.5">
                        <p className="text-xs text-stone-500">{t("goldPaid")}</p>
                        <p className="mt-0.5 font-semibold text-stone-800">
                          <Money
                            amount={h.paidAmount}
                            currency={currency}
                            locale={locale}
                          />
                        </p>
                      </div>
                      <div
                        className={`rounded-2xl px-3 py-2.5 ${
                          gain == null
                            ? "bg-stone-50"
                            : gain >= 0
                              ? "bg-emerald-50"
                              : "bg-[#fef2f2]"
                        }`}
                      >
                        <p className="text-xs text-stone-500">
                          {gain == null
                            ? t("goldTotalGainLoss")
                            : gain >= 0
                              ? t("goldGain")
                              : t("goldLoss")}
                        </p>
                        {gain != null ? (
                          <p
                            className={`mt-0.5 font-semibold ${gainLossClass(gain)}`}
                          >
                            <span className="inline-flex flex-wrap items-baseline gap-1">
                              <Money
                                amount={gain}
                                currency={currency}
                                locale={locale}
                                extraSign={gain >= 0 ? "+" : "−"}
                              />
                              {h.gainLossPct != null ? (
                                <span className="text-sm">
                                  ({h.gainLossPct >= 0 ? "+" : ""}
                                  {h.gainLossPct}%)
                                </span>
                              ) : null}
                            </span>
                          </p>
                        ) : (
                          <p className="mt-0.5 text-stone-400">…</p>
                        )}
                      </div>
                    </div>
                  ) : null}

                  <div className="mt-3 flex justify-end">
                    <button
                      type="button"
                      disabled={!!deletingId}
                      onClick={() => onDelete(h.id)}
                      className="rounded-xl px-3 py-1.5 text-sm font-semibold text-red-800 hover:bg-[#fef2f2] disabled:opacity-60"
                    >
                      {deletingId === h.id ? t("saving") : t("goldDelete")}
                    </button>
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
