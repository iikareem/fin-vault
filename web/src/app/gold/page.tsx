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
  note: string;
  acquiredOn: string | null;
  egpPerGram: number | null;
  currentValue: number | null;
};

type GoldSummary = {
  quotes: GoldQuotes;
  holdings: Holding[];
  totalGrams: number;
  totalValue: number;
};

function karatLabel(
  karat: Karat,
  t: (k: "goldKarat18" | "goldKarat21" | "goldKarat24") => string,
) {
  if (karat === 18) return t("goldKarat18");
  if (karat === 21) return t("goldKarat21");
  return t("goldKarat24");
}

export default function GoldPage() {
  const { t, locale } = useI18n();
  const { personal, setKind, active } = useBooks();
  const currency = personal?.currency ?? "EGP";
  const [data, setData] = useState<GoldSummary | null>(null);
  const [grams, setGrams] = useState("");
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
            note: note.trim() || undefined,
          }),
        },
      );
      setData(next);
      setGrams("");
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
      <h1 className="text-2xl font-bold leading-tight sm:text-3xl">
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

      <section className="mt-6">
        <h2 className="text-xl font-semibold">{t("goldHoldings")}</h2>
        {!data ? (
          <p className="mt-3 text-stone-500">…</p>
        ) : data.holdings.length === 0 ? (
          <p className="mt-3 text-stone-500">{t("goldEmpty")}</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {data.holdings.map((h) => (
              <li key={h.id} className="surface rounded-2xl px-4 py-3">
                <div className="money-row">
                  <div className="min-w-0" dir="auto">
                    <p className="font-semibold">
                      {h.grams} {t("goldGrams")} · {karatLabel(h.karat, t)}
                    </p>
                    {h.note ? (
                      <p className="text-sm text-stone-500">{h.note}</p>
                    ) : null}
                  </div>
                  <span className="shrink-0 font-semibold">
                    {h.currentValue != null ? (
                      <Money
                        amount={h.currentValue}
                        currency={currency}
                        locale={locale}
                      />
                    ) : (
                      "…"
                    )}
                  </span>
                </div>
                <button
                  type="button"
                  disabled={!!deletingId}
                  onClick={() => onDelete(h.id)}
                  className="mt-2 text-sm font-semibold text-red-800 disabled:opacity-60"
                >
                  {deletingId === h.id ? t("saving") : t("goldDelete")}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
      <BottomNav />
    </PageShell>
  );
}
