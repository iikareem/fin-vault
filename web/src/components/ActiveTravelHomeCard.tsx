"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api, todayISO } from "@/lib/api";
import { fill } from "@/lib/i18n";
import { formatItemDate } from "@/lib/calendar";
import { householdPath } from "@/lib/space";
import { useI18n } from "@/components/I18nProvider";
import { PrivateMoney } from "@/components/PrivateMoney";
import {
  cacheOfflinePage,
  rememberOfflineTrip,
} from "@/components/ServiceWorkerRegister";
import {
  listTravelSnapshots,
  saveTravelSnapshot,
} from "@/lib/offline-queue";
import { cachedPageNavigate } from "@/lib/offline-nav";

type TravelHomeCard = {
  id: string;
  name: string;
  currency: string;
  softLimit: number | null;
  startsOn: string;
  endsOn: string;
  spent: number;
  remaining: number | null;
  pct: number | null;
  overLimit: boolean;
  status: "upcoming" | "active" | "past";
};

type TravelsHome = {
  open: TravelHomeCard | null;
};

type Props = {
  householdId: string;
  moneyVisible: boolean;
};

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

export function ActiveTravelHomeCard({
  householdId,
  moneyVisible,
}: Props) {
  const { t, locale } = useI18n();
  const [trip, setTrip] = useState<TravelHomeCard | null>(null);

  useEffect(() => {
    let cancelled = false;
    api<TravelsHome>(householdPath(householdId, "/travels/home"))
      .then((result) => {
        if (cancelled) return;
        setTrip(result.open);
        if (!result.open) return;
        const open = result.open;
        rememberOfflineTrip(open.id);
        void cacheOfflinePage(`/travels/${open.id}`);
        const detailPath = householdPath(
          householdId,
          `/travels/${open.id}`,
        );
        void Promise.all([
          api<TravelHomeCard>(detailPath),
          api<unknown[]>(householdPath(householdId, "/categories")),
        ])
          .then(([detail, categories]) =>
            saveTravelSnapshot(householdId, open.id, detail, categories),
          )
          .catch(() => {
            /* The last complete travel snapshot remains usable offline. */
          });
      })
      .catch(async () => {
        const snapshots = await listTravelSnapshots(householdId).catch(() => []);
        const open = snapshots
          .map((snapshot) => snapshot.detail as TravelHomeCard)
          .find((detail) => detail?.status !== "past");
        if (!cancelled) setTrip(open ?? null);
      });
    return () => {
      cancelled = true;
    };
  }, [householdId]);

  if (!trip) return null;

  const today = todayISO();
  const timing =
    trip.status === "upcoming"
      ? (() => {
          const days = Math.max(1, dayDistance(today, trip.startsOn));
          return days === 1
            ? t("travelsStartsTomorrow")
            : fill(t("travelsStartsIn"), { n: String(days) });
        })()
      : (() => {
          const days = Math.max(0, dayDistance(today, trip.endsOn));
          if (days === 0) return t("travelsLastDayToday");
          if (days === 1) return t("travelsOneDayLeft");
          return fill(t("travelsDaysLeft"), { n: String(days) });
        })();
  const range = `${formatItemDate(trip.startsOn, locale)} → ${formatItemDate(
    trip.endsOn,
    locale,
  )}`;

  return (
    <Link
      href={`/travels/${trip.id}`}
      onClick={(event) =>
        cachedPageNavigate(`/travels/${trip.id}`, event)
      }
      className="group relative mt-4 block overflow-hidden rounded-[1.5rem] bg-[var(--wallet-b)] p-4 text-white shadow-[var(--surface-shadow)] transition hover:opacity-95 active:scale-[0.99]"
    >
      <span
        className="pointer-events-none absolute -end-10 -top-12 h-36 w-36 rounded-full bg-white/10"
        aria-hidden
      />
      <span className="relative flex items-center justify-between gap-3">
        <span className="rounded-full bg-white/15 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-white ring-1 ring-white/20">
          {trip.status === "upcoming"
            ? t("travelsUpcoming")
            : t("travelsActive")}
        </span>
        <span className="text-xs font-semibold text-white/75">{timing}</span>
      </span>

      <span className="relative mt-3 block">
        <span className="block truncate text-lg font-bold leading-tight">
          ✈️ {trip.name}
        </span>
        <span className="mt-1 block text-xs font-medium text-white/70">
          {range}
        </span>
      </span>

      {trip.status === "active" ? (
        <span className="relative mt-4 grid grid-cols-2 gap-3">
          <span>
            <span className="block text-[10px] font-semibold uppercase tracking-wide text-white/60">
              {t("travelsSpent")}
            </span>
            <span className="mt-0.5 block text-lg font-bold tabular-nums">
              <PrivateMoney
                amount={trip.spent}
                currency={trip.currency}
                locale={locale}
                visible={moneyVisible}
              />
            </span>
          </span>
          <span>
            <span className="block text-[10px] font-semibold uppercase tracking-wide text-white/60">
              {trip.softLimit != null
                ? t("travelsRemaining")
                : t("travelsLimit")}
            </span>
            <span className="mt-0.5 block text-lg font-bold tabular-nums">
              {trip.softLimit != null ? (
                <PrivateMoney
                  amount={Math.max(0, trip.remaining ?? 0)}
                  currency={trip.currency}
                  locale={locale}
                  visible={moneyVisible}
                />
              ) : (
                "—"
              )}
            </span>
          </span>
        </span>
      ) : trip.softLimit != null ? (
        <span className="relative mt-4 block">
          <span className="block text-[10px] font-semibold uppercase tracking-wide text-white/60">
            {t("travelsLimit")}
          </span>
          <span className="mt-0.5 block text-lg font-bold tabular-nums">
            <PrivateMoney
              amount={trip.softLimit}
              currency={trip.currency}
              locale={locale}
              visible={moneyVisible}
            />
          </span>
        </span>
      ) : null}

      {trip.status === "active" && trip.softLimit != null ? (
        <span className="relative mt-3 block">
          <span className="block h-1.5 overflow-hidden rounded-full bg-white/15">
            <span
              className={`block h-full rounded-full ${
                trip.overLimit ? "bg-amber-300" : "bg-white"
              }`}
              style={{
                width: `${Math.min(100, Math.max(0, trip.pct ?? 0))}%`,
              }}
            />
          </span>
        </span>
      ) : null}

      <span className="relative mt-3 flex items-center justify-between border-t border-white/15 pt-3 text-sm font-semibold">
        <span>
          {trip.status === "active"
            ? t("travelsAddSpend")
            : t("travelsViewTrip")}
        </span>
        <span
          className="transition-transform group-hover:translate-x-0.5 rtl:group-hover:-translate-x-0.5"
          aria-hidden
        >
          →
        </span>
      </span>
    </Link>
  );
}
