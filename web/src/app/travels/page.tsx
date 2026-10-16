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
import { cacheOfflinePage } from "@/components/ServiceWorkerRegister";
import {
  isLikelyOffline,
  isOfflineNetworkError,
  loadTravelsSnapshot,
  saveTravelSnapshot,
  saveTravelsSnapshot,
} from "@/lib/offline-queue";
import { cachedPageNavigate } from "@/lib/offline-nav";

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

function tripRangeLabel(
  trip: TravelCard,
  locale: "ar" | "en",
) {
  const from = formatItemDate(trip.startsOn, locale) || trip.startsOn;
  const to = formatItemDate(trip.endsOn, locale) || trip.endsOn;
  if (trip.startsOn === trip.endsOn) return from;
  return `${from} → ${to}`;
}

const DAY_MS = 86_400_000;

function dayDistance(from: string, to: string) {
  const [fromYear, fromMonth, fromDay] = from.split("-").map(Number);
  const [toYear, toMonth, toDay] = to.split("-").map(Number);
  return Math.round(
    (Date.UTC(toYear, toMonth - 1, toDay) -
      Date.UTC(fromYear, fromMonth - 1, fromDay)) /
      DAY_MS,
  );
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

  async function load(householdId: string) {
    try {
      const result = await api<TravelsData>(
        householdPath(householdId, "/travels"),
      );
      setData(result);
      void saveTravelsSnapshot(householdId, result);
      if (result.open) {
        const open = result.open;
        cacheOfflinePage(`/travels/${open.id}`);
        void Promise.all([
          api<unknown>(householdPath(householdId, `/travels/${open.id}`)),
          api<unknown[]>(householdPath(householdId, "/categories")),
        ])
          .then(([detail, categories]) =>
            saveTravelSnapshot(
              householdId,
              open.id,
              detail,
              categories,
            ),
          )
          .catch(() => undefined);
      }
    } catch (error) {
      if (!isOfflineNetworkError(error) && !isLikelyOffline()) throw error;
      const snapshot = await loadTravelsSnapshot(householdId);
      if (!snapshot) throw error;
      setData(snapshot.data as TravelsData);
    }
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
  const today = todayISO();
  const openTripDays = openTrip
    ? Math.max(
        1,
        dayDistance(
          openTrip.status === "upcoming" ? openTrip.startsOn : today,
          openTrip.endsOn,
        ) + 1,
      )
    : 1;
  const openTripTiming = openTrip
    ? (() => {
        if (openTrip.status === "upcoming") {
          const days = Math.max(1, dayDistance(today, openTrip.startsOn));
          return days === 1
            ? t("travelsStartsTomorrow")
            : fill(t("travelsStartsIn"), { n: String(days) });
        }
        const days = Math.max(0, dayDistance(today, openTrip.endsOn));
        if (days === 0) return t("travelsLastDayToday");
        if (days === 1) return t("travelsOneDayLeft");
        return fill(t("travelsDaysLeft"), { n: String(days) });
      })()
    : "";

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
      <Link
        href="/tools"
        className="inline-flex min-h-10 items-center gap-1 text-sm font-semibold text-[var(--accent-b-text)]"
      >
        ← {t("toolsTitle")}
      </Link>

      <header className="mt-1 mb-4">
        <h1 className="page-title">{t("travelsTitle")}</h1>
        <p className="mt-1 text-sm leading-relaxed text-[var(--muted)]">
          {t("travelsPageHint")}
        </p>
      </header>

      {error ? (
        <p className="mb-3 text-sm text-red-700">{error}</p>
      ) : null}

      {openTrip ? (
        <Link
          href={`/travels/${openTrip.id}`}
          onClick={(event) =>
            cachedPageNavigate(`/travels/${openTrip.id}`, event)
          }
          className="group relative mb-4 block overflow-hidden rounded-[1.75rem] bg-[var(--wallet-b)] p-5 text-white shadow-[var(--surface-shadow)] transition active:scale-[0.99]"
        >
          <div
            className="pointer-events-none absolute -end-10 -top-10 h-36 w-36 rounded-full bg-white/10 blur-sm"
            aria-hidden
          />
          <div className="relative flex items-center justify-between gap-2">
            <span className="rounded-full bg-white/15 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-white ring-1 ring-white/20">
              {openTrip.status === "upcoming"
                ? t("travelsUpcoming")
                : t("travelsActive")}
            </span>
            <span className="text-xs font-semibold text-white/75">
              {openTripTiming}
            </span>
          </div>
          <div className="relative mt-4">
            <h2 className="text-[1.35rem] font-bold leading-tight">
              {openTrip.name}
            </h2>
            <p className="mt-1 text-xs font-medium text-white/70">
              {tripRangeLabel(openTrip, locale)}
            </p>
          </div>
          <div className="relative mt-5 grid grid-cols-2 gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-white/60">
                {t("travelsSpent")}
              </p>
              <p className="mt-0.5 text-xl font-bold tabular-nums">
                <Money
                  amount={openTrip.spent}
                  currency={openTrip.currency}
                  locale={locale}
                />
              </p>
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-white/60">
                {openTrip.softLimit != null
                  ? t("travelsRemaining")
                  : t("travelsDailyBudget")}
              </p>
              <p className="mt-0.5 text-xl font-bold tabular-nums">
                {openTrip.softLimit != null ? (
                  <Money
                    amount={Math.max(0, openTrip.remaining ?? 0)}
                    currency={openTrip.currency}
                    locale={locale}
                  />
                ) : (
                  "—"
                )}
              </p>
            </div>
          </div>
          {openTrip.softLimit != null ? (
            <div className="relative mt-4">
              <div className="h-2 overflow-hidden rounded-full bg-white/15">
                <div
                  className={`h-full rounded-full transition-[width] duration-500 ${
                    openTrip.overLimit ? "bg-amber-300" : "bg-white"
                  }`}
                  style={{
                    width: `${Math.min(100, Math.max(0, openTrip.pct ?? 0))}%`,
                  }}
                />
              </div>
              <div className="mt-2 flex items-center justify-between gap-3 text-xs">
                <span className="font-medium text-white/70">
                  {openTrip.overLimit
                    ? t("travelsHomeOverLimit")
                    : fill(t("travelsProgressHint"), {
                        pct: String(Math.round(openTrip.pct ?? 0)),
                      })}
                </span>
                {!openTrip.overLimit ? (
                  <span className="font-semibold text-white/90">
                    {t("travelsDailyBudget")}:{" "}
                    <Money
                      amount={Math.max(0, openTrip.remaining ?? 0) / openTripDays}
                      currency={openTrip.currency}
                      locale={locale}
                    />
                  </span>
                ) : null}
              </div>
            </div>
          ) : (
            <p className="relative mt-4 text-xs leading-relaxed text-white/70">
              {t("travelsNoLimitInsight")}
            </p>
          )}
          <div className="relative mt-4 flex items-center justify-between border-t border-white/15 pt-3 text-sm font-semibold">
            <span>{t("travelsViewTrip")}</span>
            <span
              className="transition-transform group-hover:translate-x-0.5 rtl:group-hover:-translate-x-0.5"
              aria-hidden
            >
              →
            </span>
          </div>
        </Link>
      ) : null}

      {canAdd ? (
        <button
          type="button"
          onClick={() => (showCreate ? setShowCreate(false) : openCreate())}
          className="mb-4 flex min-h-12 w-full items-center justify-center rounded-2xl bg-[var(--cta-bg)] text-base font-semibold text-[var(--cta-fg)] shadow-sm"
        >
          {showCreate ? t("travelsCancel") : `＋ ${t("travelsAdd")}`}
        </button>
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
            className="w-full rounded-2xl bg-[var(--cta-bg)] px-4 py-3.5 text-base font-semibold text-[var(--cta-fg)] disabled:opacity-60"
          >
            {busy ? t("saving") : t("travelsSave")}
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
                  onClick={(event) =>
                    cachedPageNavigate(`/travels/${trip.id}`, event)
                  }
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
                  onClick={(event) =>
                    cachedPageNavigate(`/travels/${trip.id}`, event)
                  }
                  className="surface flex items-center gap-3 rounded-[1.35rem] px-4 py-3.5 transition hover:opacity-95 active:scale-[0.99]"
                >
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full bg-sky-600"
                    aria-hidden
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-[var(--foreground)]">
                          {trip.name}
                        </p>
                        <p className="mt-0.5 text-xs text-[var(--muted)]">
                          {tripRangeLabel(trip, locale)}
                        </p>
                      </div>
                      <p className="shrink-0 text-sm font-bold tabular-nums">
                        <Money
                          amount={trip.spent}
                          currency={trip.currency}
                          locale={locale}
                        />
                      </p>
                    </div>
                  </div>
                  <span className="shrink-0 text-[var(--muted)] opacity-60" aria-hidden>
                    →
                  </span>
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

      {openTrip ? (
        <p className="mb-2 text-xs text-[var(--muted)]">
          {t("travelsOneActiveHint")}
        </p>
      ) : null}

      <BottomNav />
    </PageShell>
  );
}
