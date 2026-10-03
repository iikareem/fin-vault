"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { api, parseAmount, todayISO } from "@/lib/api";
import { BottomNav } from "@/components/BottomNav";
import { PageShell } from "@/components/PageShell";
import { Money } from "@/components/Money";
import { useI18n } from "@/components/I18nProvider";
import { useBooks } from "@/components/BooksProvider";
import { householdPath } from "@/lib/space";
import { Hint } from "@/components/Hint";
import { DateField } from "@/components/DateField";
import { CURRENCY_OPTIONS } from "@/lib/currencies";
import { fill } from "@/lib/i18n";
import { formatItemDate } from "@/lib/calendar";

type TravelCard = {
  id: string;
  name: string;
  currency: string;
  softLimit: number | null;
  startsOn: string;
  endsOn: string;
  status: "upcoming" | "active" | "past";
  spent: number;
  remaining: number | null;
  pct: number | null;
  overLimit: boolean;
};

type TravelsData = {
  active: TravelCard | null;
  open: TravelCard | null;
  upcoming: TravelCard[];
  past: TravelCard[];
  travels: TravelCard[];
};

function LimitBar({
  pct,
  over,
}: {
  pct: number | null;
  over: boolean;
}) {
  if (pct == null) return null;
  const width = Math.min(100, Math.max(0, pct));
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--panel-soft)]">
      <div
        className={`h-full rounded-full transition-[width] duration-500 ${
          over ? "bg-amber-600" : "bg-sky-600"
        }`}
        style={{ width: `${width}%` }}
      />
    </div>
  );
}

function tripRangeLabel(
  trip: TravelCard,
  locale: "ar" | "en",
) {
  const from = formatItemDate(trip.startsOn, locale) || trip.startsOn;
  const to = formatItemDate(trip.endsOn, locale) || trip.endsOn;
  if (trip.startsOn === trip.endsOn) return from;
  return `${from} → ${to}`;
}

export default function TravelsPage() {
  const { t, locale } = useI18n();
  const { personal, setKind } = useBooks();
  const hid = personal?.householdId ?? "";

  const [data, setData] = useState<TravelsData | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState("");
  const [currency, setCurrency] = useState(personal?.currency ?? "EGP");
  const [startsOn, setStartsOn] = useState(todayISO());
  const [endsOn, setEndsOn] = useState(todayISO());
  const [limit, setLimit] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  function load(householdId: string) {
    return api<TravelsData>(householdPath(householdId, "/travels")).then(
      setData,
    );
  }

  useEffect(() => {
    if (!personal) return;
    setKind("PERSONAL");
    setCurrency(personal.currency);
    load(personal.householdId).catch((e) => setError(e.message));
  }, [personal?.householdId]);

  useEffect(() => {
    if (!data) return;
    // Only auto-open create when there are no trips at all.
    if (!data.open && data.travels.length === 0) setShowCreate(true);
  }, [data]);

  const openTrip = data?.open ?? data?.active ?? null;
  const canAdd = !openTrip;

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    if (!hid || busy) return;
    if (!canAdd) {
      setError(t("travelsOneActiveHint"));
      return;
    }
    const trimmed = name.trim();
    if (!trimmed) {
      setError(t("travelsNameHint"));
      return;
    }
    if (startsOn > endsOn) {
      setError(t("travelsDateOrder"));
      return;
    }
    const limitRaw = limit.trim();
    const limitAmt = limitRaw ? parseAmount(limitRaw) : undefined;
    if (limitRaw && (!Number.isFinite(limitAmt) || (limitAmt ?? 0) <= 0)) {
      setError(t("travelsLimitHint"));
      return;
    }
    setBusy(true);
    setError("");
    try {
      const created = await api<TravelCard>(
        householdPath(hid, "/travels"),
        {
          method: "POST",
          body: JSON.stringify({
            name: trimmed,
            currency,
            startsOn,
            endsOn,
            ...(limitAmt != null ? { softLimit: limitAmt } : {}),
          }),
        },
      );
      if (!created?.id) {
        throw new Error(t("travelsSaveFailed"));
      }
      window.location.assign(`/travels/${created.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("travelsSaveFailed"));
      setBusy(false);
    }
  }

  function openCreate() {
    setError("");
    setShowCreate(true);
    setName("");
    setLimit("");
    setStartsOn(todayISO());
    setEndsOn(todayISO());
    setCurrency(personal?.currency ?? "EGP");
  }

  return (
    <PageShell>
      <header className="mb-4 flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-sky-800">
            {t("navTravels")}
          </p>
          <h1 className="text-2xl font-bold text-[var(--foreground)]">
            {t("travelsTitle")}
          </h1>
          <p className="mt-1 text-sm text-[var(--muted)]">
            {t("travelsPageHint")}
          </p>
        </div>
        {canAdd ? (
          <button
            type="button"
            onClick={() => (showCreate ? setShowCreate(false) : openCreate())}
            className="shrink-0 rounded-2xl bg-sky-800 px-3 py-2 text-sm font-semibold text-white"
          >
            {showCreate ? t("travelsCancel") : `＋ ${t("travelsAdd")}`}
          </button>
        ) : null}
      </header>

      {error ? (
        <p className="mb-3 text-sm text-red-700">{error}</p>
      ) : null}

      {openTrip ? (
        <Link
          href={`/travels/${openTrip.id}`}
          className="mb-4 block overflow-hidden rounded-[1.75rem] bg-[var(--soft-sky)] p-4 shadow-sm ring-1 ring-sky-200/60"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="rounded-full bg-sky-800 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-white">
              {openTrip.status === "upcoming"
                ? t("travelsUpcoming")
                : t("travelsActive")}
            </span>
            <span className="text-xs font-medium text-sky-900/70">
              {tripRangeLabel(openTrip, locale)}
            </span>
          </div>
          <h2 className="mt-2 text-xl font-bold text-[var(--foreground)]">
            ✈ {openTrip.name}
          </h2>
          <p className="mt-1 text-2xl font-bold tabular-nums">
            <Money
              amount={openTrip.spent}
              currency={openTrip.currency}
              locale={locale}
            />
            {openTrip.softLimit != null ? (
              <span className="text-base font-semibold text-[var(--muted)]">
                {" "}
                /{" "}
                <Money
                  amount={openTrip.softLimit}
                  currency={openTrip.currency}
                  locale={locale}
                />
              </span>
            ) : null}
          </p>
          <div className="mt-3">
            <LimitBar pct={openTrip.pct} over={openTrip.overLimit} />
          </div>
          <p className="mt-2 text-sm font-semibold text-sky-900">
            {t("travelsOpenTrip")} →
          </p>
        </Link>
      ) : null}

      {showCreate && canAdd ? (
        <form
          onSubmit={onCreate}
          className="surface mb-5 space-y-3 rounded-[1.75rem] p-4"
        >
          <h2 className="text-lg font-bold">{t("travelsAdd")}</h2>
          <Hint>{t("travelsCreateHint")}</Hint>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-[var(--muted)]">
              {t("travelsName")}
            </span>
            <input
              className="field text-base"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("travelsNamePlaceholder")}
              required
              autoFocus
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-[var(--muted)]">
              {t("travelsCurrency")}
            </span>
            <select
              className="field text-base"
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
            >
              {CURRENCY_OPTIONS.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.code} — {locale === "ar" ? c.labelAr : c.labelEn}
                </option>
              ))}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-[var(--muted)]">
                {t("travelsFrom")}
              </span>
              <DateField value={startsOn} onChange={setStartsOn} />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-[var(--muted)]">
                {t("travelsTo")}
              </span>
              <DateField value={endsOn} onChange={setEndsOn} />
            </label>
          </div>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-[var(--muted)]">
              {t("travelsLimit")}
            </span>
            <input
              inputMode="decimal"
              dir="ltr"
              className="amount-input field text-2xl font-bold"
              value={limit}
              onChange={(e) => setLimit(e.target.value)}
              placeholder={t("travelsLimitPlaceholder")}
            />
            <Hint>{t("travelsLimitHintUi")}</Hint>
          </label>
          <button
            disabled={busy}
            className="w-full rounded-3xl bg-sky-800 px-4 py-3.5 text-base font-semibold text-white disabled:opacity-60"
          >
            {busy ? t("saving") : `✅ ${t("travelsSave")}`}
          </button>
        </form>
      ) : null}

      {data &&
      data.upcoming.filter((t) => t.id !== openTrip?.id).length > 0 ? (
        <section className="mb-5">
          <h2 className="mb-2 text-sm font-semibold text-[var(--muted)]">
            {t("travelsUpcoming")}
          </h2>
          <ul className="space-y-2">
            {data.upcoming
              .filter((t) => t.id !== openTrip?.id)
              .map((trip) => (
              <li key={trip.id}>
                <Link
                  href={`/travels/${trip.id}`}
                  className="surface flex items-center justify-between gap-3 rounded-[1.5rem] px-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="font-semibold">{trip.name}</p>
                    <p className="text-xs text-[var(--muted)]">
                      {tripRangeLabel(trip, locale)} · {trip.currency}
                    </p>
                  </div>
                  <span className="shrink-0 text-xs font-bold text-sky-800">
                    {t("travelsOpenLog")} →
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {data && data.past.length > 0 ? (
        <section className="mb-5">
          <div className="mb-2 flex items-end justify-between gap-2">
            <h2 className="text-sm font-semibold text-[var(--muted)]">
              {t("travelsPast")}
            </h2>
            <p className="text-xs text-[var(--muted)]">
              {fill(t("travelsPastCount"), { n: String(data.past.length) })}
            </p>
          </div>
          <ul className="space-y-2">
            {data.past.map((trip) => (
              <li key={trip.id}>
                <Link
                  href={`/travels/${trip.id}`}
                  className="surface block rounded-[1.5rem] px-4 py-3.5 transition hover:opacity-95 active:scale-[0.99]"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold text-[var(--foreground)]">
                        ✈ {trip.name}
                      </p>
                      <p className="mt-0.5 text-xs text-[var(--muted)]">
                        {tripRangeLabel(trip, locale)}
                      </p>
                    </div>
                    <div className="shrink-0 text-end">
                      <p className="text-sm font-bold tabular-nums">
                        <Money
                          amount={trip.spent}
                          currency={trip.currency}
                          locale={locale}
                        />
                      </p>
                      <p className="text-[11px] font-medium text-sky-800">
                        {trip.currency}
                      </p>
                    </div>
                  </div>
                  {trip.softLimit != null ? (
                    <div className="mt-2.5 space-y-1">
                      <LimitBar pct={trip.pct} over={trip.overLimit} />
                      <p className="text-[11px] text-[var(--muted)]">
                        <Money
                          amount={trip.spent}
                          currency={trip.currency}
                          locale={locale}
                        />
                        {" / "}
                        <Money
                          amount={trip.softLimit}
                          currency={trip.currency}
                          locale={locale}
                        />
                        {trip.pct != null
                          ? ` · ${fill(t("travelsProgressHint"), {
                              pct: String(Math.round(trip.pct)),
                            })}`
                          : ""}
                      </p>
                    </div>
                  ) : null}
                  <p className="mt-2 text-xs font-semibold text-sky-800">
                    {t("travelsOpenLog")} →
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {data && !openTrip && data.travels.length === 0 && !showCreate ? (
        <div className="surface rounded-[1.75rem] p-6 text-center">
          <p className="text-4xl" aria-hidden>
            ✈
          </p>
          <p className="mt-2 font-semibold">{t("travelsEmpty")}</p>
          <p className="mt-1 text-sm text-[var(--muted)]">
            {t("travelsEmptyHint")}
          </p>
          <button
            type="button"
            onClick={openCreate}
            className="mt-4 rounded-2xl bg-sky-800 px-4 py-2.5 text-sm font-semibold text-white"
          >
            {t("travelsAdd")}
          </button>
        </div>
      ) : null}

      {data && data.past.length > 0 && !showCreate && canAdd ? (
        <button
          type="button"
          onClick={openCreate}
          className="mb-4 w-full rounded-3xl bg-sky-800 px-4 py-3.5 text-base font-semibold text-white"
        >
          ＋ {t("travelsAdd")}
        </button>
      ) : null}

      {openTrip ? <Hint>{t("travelsOneActiveHint")}</Hint> : null}

      <BottomNav />
    </PageShell>
  );
}
