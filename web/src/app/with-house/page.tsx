"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api, money } from "@/lib/api";
import { BottomNav } from "@/components/BottomNav";
import { PageShell } from "@/components/PageShell";
import { useI18n } from "@/components/I18nProvider";
import { useBooks } from "@/components/BooksProvider";
import { labelFor, type MessageKey } from "@/lib/i18n";
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
};
type HistoryPayload = {
  member: Person;
  from: string;
  to: string;
  status: { houseOwesMember: number; memberOwesHouse: number };
  events: EventRow[];
};

const DIRECTION_KEY: Record<string, MessageKey> = {
  MEMBER_PAID_FOR_HOUSE: "eventMemberPaidHouse",
  HOUSE_PAID_MEMBER: "eventHousePaidMember",
  HOUSE_PAID_FOR_MEMBER: "eventHouseCovered",
  MEMBER_PAID_HOUSE: "eventMemberRepaidHouse",
};

export default function WithHouseHistoryPage() {
  const { t, locale } = useI18n();
  const cal = useCalendarClock();
  const { house, userId, setKind } = useBooks();
  const houseId = house?.householdId ?? "";
  const currency = house?.currency ?? "EGP";
  const [people, setPeople] = useState<Person[]>([]);
  const [memberId, setMemberId] = useState("");
  const [period, setPeriod] = useState<HistoryPeriod>("month");
  const [cursor, setCursor] = useState(() => new Date());
  const [data, setData] = useState<HistoryPayload | null>(null);
  const [error, setError] = useState("");
  const { from, to } = rangeForPeriod(period, cursor);
  const memberName =
    people.find((p) => p.id === memberId)?.name ?? data?.member.name ?? "";

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
        setMemberId((prev) => prev || userId || users[0]?.id || "");
      })
      .catch((e) => setError(e.message));
  }, [houseId, userId]);

  useEffect(() => {
    if (!houseId || !memberId) return;
    setError("");
    api<HistoryPayload>(
      householdPath(
        houseId,
        `/history/with-member?memberId=${encodeURIComponent(memberId)}&from=${from}&to=${to}`,
      ),
    )
      .then(setData)
      .catch((e) => setError(e.message));
  }, [houseId, memberId, from, to]);

  return (
    <PageShell>
      <h1 className="text-2xl font-bold leading-tight sm:text-3xl">
        🏠 {t("withHouseTitle")}
      </h1>
      <Hint>{t("withHouseHint")}</Hint>
      {error ? <p className="mt-2 text-red-700">{error}</p> : null}

      <label className="mt-5 block text-sm font-semibold text-stone-600">
        {t("withHousePick")}
        <select
          className="mt-2 w-full rounded-2xl border border-stone-300 bg-white px-4 py-3 text-base"
          value={memberId}
          onChange={(e) => setMemberId(e.target.value)}
        >
          {people.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </label>

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
            {data.status.houseOwesMember > 0.001 ? (
              <p>
                {t("houseOwesPerson", {
                  name: memberName,
                  amount: money(data.status.houseOwesMember, currency, locale),
                })}
              </p>
            ) : null}
            {data.status.memberOwesHouse > 0.001 ? (
              <p>
                {t("personOwesHouse", {
                  name: memberName,
                  amount: money(data.status.memberOwesHouse, currency, locale),
                })}
              </p>
            ) : null}
            {data.status.houseOwesMember <= 0.001 &&
            data.status.memberOwesHouse <= 0.001 ? (
              <p className="text-stone-500">{t("settledNow")}</p>
            ) : null}
          </div>
        </section>
      ) : null}

      {data && data.events.length === 0 ? (
        <p className="mt-5 text-stone-500">{t("withHouseEmpty")}</p>
      ) : null}

      {data && data.events.length > 0 ? (
        <ul className="mt-5 space-y-2">
          {data.events.map((ev) => (
            <li key={ev.id} className="surface rounded-2xl px-4 py-3">
              <div className="money-row">
                <div className="min-w-0 text-right" dir="auto">
                  <p className="font-semibold">
                    {t(DIRECTION_KEY[ev.direction] ?? "stillOpen")}
                  </p>
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
          ))}
        </ul>
      ) : null}

      <Link
        href="/more"
        className="mt-6 block text-center text-sm font-semibold text-stone-500"
      >
        ← {t("moreTitle")}
      </Link>
      <BottomNav />
    </PageShell>
  );
}
