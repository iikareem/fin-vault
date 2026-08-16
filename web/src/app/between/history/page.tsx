"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api, money } from "@/lib/api";
import { BottomNav } from "@/components/BottomNav";
import { PageShell } from "@/components/PageShell";
import { useI18n } from "@/components/I18nProvider";
import { useBooks } from "@/components/BooksProvider";
import { labelFor } from "@/lib/i18n";
import { householdPath } from "@/lib/space";
import { Hint } from "@/components/Hint";
import { Money } from "@/components/Money";
import { ItemDate } from "@/components/ItemDate";
import { useCalendarClock } from "@/hooks/useCalendarClock";
import {
  HistoryPeriod,
  periodLabel,
  rangeForPeriod,
  shiftPeriod,
} from "@/lib/period";

type Person = { id: string; name: string };
type EventRow = {
  id: string;
  kind: string;
  occurredOn: string;
  amount: number;
  note: string;
  status?: string;
  remaining?: number;
  categoryName?: string;
  direction: string;
  fromName?: string;
  toName?: string;
};
type HistoryPayload = {
  a: Person;
  b: Person;
  from: string;
  to: string;
  status: { aOwesB: number; bOwesA: number };
  events: EventRow[];
};

export default function BetweenHistoryPage() {
  const { t, locale } = useI18n();
  const cal = useCalendarClock();
  const { house, userId, setKind, active } = useBooks();
  const houseId = house?.householdId ?? "";
  const currency = house?.currency ?? "EGP";
  const isAdmin = active?.role === "ADMIN" || house?.role === "ADMIN";
  const [people, setPeople] = useState<Person[]>([]);
  const [userA, setUserA] = useState("");
  const [userB, setUserB] = useState("");
  const [period, setPeriod] = useState<HistoryPeriod>("month");
  const [cursor, setCursor] = useState(() => new Date());
  const [data, setData] = useState<HistoryPayload | null>(null);
  const [error, setError] = useState("");
  const { from, to } = rangeForPeriod(period, cursor);

  useEffect(() => {
    setKind("HOUSE");
  }, [setKind]);

  useEffect(() => {
    setCursor(new Date(cal.year, cal.month - 1, cal.day));
  }, [cal.monthKey]);

  useEffect(() => {
    if (!houseId) return;
    api<Person[]>(householdPath(houseId, "/users"))
      .then((users) => {
        setPeople(users);
        const me = userId || users[0]?.id || "";
        const other = users.find((u) => u.id !== me)?.id || "";
        setUserA((prev) => prev || me);
        setUserB((prev) => prev || other);
      })
      .catch((e) => setError(e.message));
  }, [houseId, userId]);

  useEffect(() => {
    if (!houseId || !userA || !userB || userA === userB) return;
    setError("");
    api<HistoryPayload>(
      householdPath(
        houseId,
        `/history/between?userA=${encodeURIComponent(userA)}&userB=${encodeURIComponent(userB)}&from=${from}&to=${to}`,
      ),
    )
      .then(setData)
      .catch((e) => {
        setData(null);
        setError(e.message);
      });
  }, [houseId, userA, userB, from, to]);

  const pickOptionsA = isAdmin
    ? people
    : people.filter((p) => p.id === userId);
  const pickOptionsB = people.filter((p) => p.id !== userA);

  return (
    <PageShell>
      <h1 className="text-2xl font-bold leading-tight sm:text-3xl">
        🤝 {t("betweenHistoryTitle")}
      </h1>
      <Hint>{t("betweenHistoryHint")}</Hint>
      {error ? <p className="mt-2 text-red-700">{error}</p> : null}

      <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="block text-sm font-semibold text-stone-600">
          {t("betweenPickA")}
          <select
            className="mt-2 w-full rounded-2xl border border-stone-300 bg-white px-4 py-3 text-base"
            value={userA}
            onChange={(e) => {
              const next = e.target.value;
              setUserA(next);
              if (next === userB) {
                const other = people.find((p) => p.id !== next)?.id || "";
                setUserB(other);
              }
            }}
            disabled={!isAdmin}
          >
            {pickOptionsA.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm font-semibold text-stone-600">
          {t("betweenPickB")}
          <select
            className="mt-2 w-full rounded-2xl border border-stone-300 bg-white px-4 py-3 text-base"
            value={userB}
            onChange={(e) => setUserB(e.target.value)}
          >
            {pickOptionsB.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {(["day", "week", "month"] as HistoryPeriod[]).map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => setPeriod(p)}
            className={`rounded-2xl px-4 py-2 font-semibold ${
              period === p
                ? "bg-emerald-800 text-white"
                : "bg-white text-stone-700"
            }`}
          >
            {p === "day"
              ? t("periodDay")
              : p === "week"
                ? t("periodWeek")
                : t("periodMonth")}
          </button>
        ))}
      </div>

      <div className="mt-3 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setCursor((c) => shiftPeriod(period, c, -1))}
          className="rounded-2xl bg-white px-4 py-2 font-semibold"
        >
          ←
        </button>
        <p className="text-center text-sm font-semibold text-stone-700">
          {periodLabel(period, cursor, from, to, locale)}
        </p>
        <button
          type="button"
          onClick={() => setCursor((c) => shiftPeriod(period, c, 1))}
          className="rounded-2xl bg-white px-4 py-2 font-semibold"
        >
          →
        </button>
      </div>

      {data ? (
        <section className="surface mt-5 rounded-[1.75rem] p-4">
          <h2 className="font-semibold text-stone-800">{t("withHouseStatus")}</h2>
          <div className="mt-3 space-y-2 text-sm">
            {data.status.aOwesB > 0.001 ? (
              <p>
                {t("aOwesB", {
                  a: data.a.name,
                  b: data.b.name,
                  amount: money(data.status.aOwesB, currency, locale),
                })}
              </p>
            ) : null}
            {data.status.bOwesA > 0.001 ? (
              <p>
                {t("aOwesB", {
                  a: data.b.name,
                  b: data.a.name,
                  amount: money(data.status.bOwesA, currency, locale),
                })}
              </p>
            ) : null}
            {data.status.aOwesB <= 0.001 && data.status.bOwesA <= 0.001 ? (
              <p className="text-stone-500">{t("settledNow")}</p>
            ) : null}
          </div>
        </section>
      ) : null}

      {data && data.events.length === 0 ? (
        <p className="mt-5 text-stone-500">{t("betweenHistoryEmpty")}</p>
      ) : null}

      {data && data.events.length > 0 ? (
        <ul className="mt-5 space-y-2">
          {data.events.map((ev) => {
            const title =
              ev.kind === "LOAN_REPAY"
                ? t("eventLoanRepaid", {
                    from: ev.fromName ?? "",
                    to: ev.toName ?? "",
                  })
                : t("eventLoanGave", {
                    from: ev.fromName ?? "",
                    to: ev.toName ?? "",
                  });
            return (
              <li key={ev.id} className="surface rounded-2xl px-4 py-3">
                <div className="money-row">
                  <div className="min-w-0 text-right" dir="auto">
                    <p className="font-semibold">{title}</p>
                    <ItemDate
                      value={ev.occurredOn}
                      locale={locale}
                      className="mt-1"
                    />
                    {ev.categoryName || ev.note ? (
                      <p className="mt-1 text-sm text-stone-500">
                        {[
                          ev.categoryName
                            ? labelFor(ev.categoryName, t)
                            : null,
                          ev.note || null,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    ) : null}
                    {ev.remaining != null && ev.remaining > 0.001 ? (
                      <p className="mt-1 text-sm text-amber-900">
                        {t("remainingShort", {
                          amount: money(ev.remaining, currency, locale),
                        })}
                      </p>
                    ) : null}
                  </div>
                  <span className="shrink-0 text-lg font-bold">
                    <Money
                      amount={ev.amount}
                      currency={currency}
                      locale={locale}
                    />
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}

      <Link
        href="/between"
        className="mt-6 block text-center text-sm font-semibold text-stone-500"
      >
        ← {t("betweenTitle")}
      </Link>
      <BottomNav />
    </PageShell>
  );
}
