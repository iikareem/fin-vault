"use client";

import { FormEvent, useEffect, useState } from "react";
import { api, money, todayISO } from "@/lib/api";
import { BottomNav } from "@/components/BottomNav";
import { useI18n } from "@/components/I18nProvider";
import { useBooks } from "@/components/BooksProvider";
import { labelFor } from "@/lib/i18n";
import { householdPath } from "@/lib/space";
import { Hint } from "@/components/Hint";
import { useCalendarClock } from "@/hooks/useCalendarClock";
import { shiftMonthKey } from "@/lib/calendar";

type MemberTotal = { userId: string; name: string; total: number };
type Gift = {
  id: string;
  amount: number;
  occurredOn: string;
  note: string;
  member: { id: string; name: string };
};
type CharityTypeRow = {
  id: string;
  name: string;
  color: string;
  monthlyGoal: number;
  total: number;
  paid: boolean;
  byMember: MemberTotal[];
  gifts: Gift[];
};
type MonthData = {
  month: string;
  familyTotal: number;
  types: CharityTypeRow[];
};

export default function CharityPage() {
  const { t, locale } = useI18n();
  const cal = useCalendarClock();
  const { house, setKind, active } = useBooks();
  const isAdmin = house?.role === "ADMIN";
  const currency = house?.currency ?? "EGP";
  const [month, setMonth] = useState(cal.monthKey);
  const [data, setData] = useState<MonthData | null>(null);
  const [typeId, setTypeId] = useState("");
  const [amount, setAmount] = useState("");
  const [occurredOn, setOccurredOn] = useState(todayISO());
  const [note, setNote] = useState("");
  const [newType, setNewType] = useState("");
  const [goals, setGoals] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setMonth(cal.monthKey);
  }, [cal.monthKey]);

  useEffect(() => {
    setOccurredOn(cal.today);
  }, [cal.today]);

  function load(hid: string, m: string) {
    return api<MonthData>(householdPath(hid, `/charity?month=${m}`)).then(
      (res) => {
        setData(res);
        setGoals(
          Object.fromEntries(
            res.types.map((row) => [row.id, String(row.monthlyGoal || "")]),
          ),
        );
        if (res.types[0] && !typeId) setTypeId(res.types[0].id);
      },
    );
  }

  useEffect(() => {
    if (!house) return;
    setKind("HOUSE");
    load(house.householdId, month).catch((e) => setError(e.message));
  }, [house?.householdId, month]);

  async function contribute(e: FormEvent) {
    e.preventDefault();
    if (!house) return;
    setBusy(true);
    setError("");
    try {
      await api(householdPath(house.householdId, "/charity/gifts"), {
        method: "POST",
        body: JSON.stringify({
          typeId,
          amount: Number(amount),
          occurredOn,
          note,
        }),
      });
      setAmount("");
      setNote("");
      await load(house.householdId, month);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("couldNotSave"));
    } finally {
      setBusy(false);
    }
  }

  async function saveGoal(id: string) {
    if (!house) return;
    setError("");
    try {
      await api(householdPath(house.householdId, `/charity/types/${id}`), {
        method: "PATCH",
        body: JSON.stringify({ monthlyGoal: Number(goals[id] || 0) }),
      });
      await load(house.householdId, month);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("couldNotSave"));
    }
  }

  async function createType(name: string) {
    if (!house || !name.trim()) return;
    setBusy(true);
    setError("");
    try {
      await api(householdPath(house.householdId, "/charity/types"), {
        method: "POST",
        body: JSON.stringify({ name: name.trim() }),
      });
      setNewType("");
      await load(house.householdId, month);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("couldNotSave"));
    } finally {
      setBusy(false);
    }
  }

  async function addType(e: FormEvent) {
    e.preventDefault();
    await createType(newType);
  }

  function addKnownType(name: string) {
    void createType(name);
  }

  if (active?.kind === "PERSONAL") {
    return (
      <main className="mx-auto max-w-lg px-4 pb-32 pt-4">
        <p className="text-stone-600">{t("charityHint")}</p>
        <BottomNav />
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-lg px-4 pb-32 pt-4">
      <h1 className="text-3xl font-bold">🕌 {t("charityTitle")}</h1>
      <p className="mt-2 text-stone-600">{t("charityHint")}</p>

      <div className="mt-4 flex items-center justify-between gap-3">
        <button
          type="button"
          className="rounded-2xl bg-white px-4 py-3 text-xl font-bold shadow-sm"
          onClick={() => setMonth((m) => shiftMonthKey(m, -1))}
        >
          ‹
        </button>
        <input
          type="month"
          value={month}
          onChange={(e) => {
            if (e.target.value) setMonth(e.target.value);
          }}
          className="min-w-0 flex-1 rounded-2xl border border-stone-200 bg-white px-3 py-2 text-center text-lg font-semibold"
        />
        <button
          type="button"
          className="rounded-2xl bg-white px-4 py-3 text-xl font-bold shadow-sm"
          onClick={() => setMonth((m) => shiftMonthKey(m, 1))}
        >
          ›
        </button>
      </div>
      <Hint>{t("charityMonthHint")}</Hint>

      {error ? <p className="mt-3 text-red-700">{error}</p> : null}

      <p className="mt-4 rounded-2xl bg-teal-800 px-4 py-3 text-lg font-semibold text-white">
        {t("charityFamilyTotal")}:{" "}
        {data ? money(data.familyTotal, currency, locale) : "…"}
      </p>
      <Hint>{t("charityTotalHint")}</Hint>

      <form
        onSubmit={contribute}
        className="mt-5 space-y-3 rounded-3xl bg-white p-4 shadow-sm"
      >
        <h2 className="text-xl font-semibold">🤲 {t("charityIPaid")}</h2>
        <Hint>{t("charityPayHint")}</Hint>
        <label className="block">
          <span className="text-stone-500">{t("forWhat")}</span>
          <select
            className="mt-1 w-full rounded-2xl border border-stone-200 px-3 py-3 text-lg"
            value={typeId}
            onChange={(e) => setTypeId(e.target.value)}
            required
          >
            {data?.types.map((row) => (
              <option key={row.id} value={row.id}>
                {labelFor(row.name, t)}
              </option>
            ))}
          </select>
          <Hint>{t("charityTypeHint")}</Hint>
        </label>
        <label className="block">
          <span className="text-stone-500">{t("amount")}</span>
          <input
            type="number"
            min="0.01"
            step="0.01"
            required
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="mt-1 w-full rounded-2xl border border-stone-200 px-3 py-3 text-lg"
          />
          <Hint>{t("amountHint")}</Hint>
        </label>
        <label className="block">
          <span className="text-stone-500">{t("day")}</span>
          <input
            type="date"
            required
            value={occurredOn}
            onChange={(e) => setOccurredOn(e.target.value)}
            className="mt-1 w-full rounded-2xl border border-stone-200 px-3 py-3 text-lg"
          />
          <Hint>{t("dayHint")}</Hint>
        </label>
        <label className="block">
          <span className="text-stone-500">{t("noteOptional")}</span>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="mt-1 w-full rounded-2xl border border-stone-200 px-3 py-3 text-lg"
          />
          <Hint>{t("noteHint")}</Hint>
        </label>
        <button
          type="submit"
          disabled={busy}
          className="flex min-h-14 w-full items-center justify-center rounded-2xl bg-teal-800 text-lg font-semibold text-white"
        >
          {busy ? t("saving") : t("save")}
        </button>
      </form>

      <ul className="mt-6 space-y-4">
        {data?.types.map((row) => {
          const goal = row.monthlyGoal;
          const max = Math.max(goal, row.total, 1);
          return (
            <li key={row.id} className="rounded-3xl bg-white p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <h2 className="text-xl font-semibold">
                  {labelFor(row.name, t)}
                </h2>
                <span
                  className={`rounded-full px-3 py-1 text-sm font-bold ${
                    row.paid
                      ? "bg-emerald-100 text-emerald-800"
                      : "bg-amber-100 text-amber-800"
                  }`}
                >
                  {row.paid ? t("charityPaid") : t("charityNotPaid")}
                </span>
              </div>
              <p className="mt-2 text-2xl font-bold">
                {money(row.total, currency, locale)}
                {goal > 0 ? (
                  <span className="text-base font-normal text-stone-500">
                    {" "}
                    / {money(goal, currency, locale)}
                  </span>
                ) : null}
              </p>
              <div className="mt-2 h-3 overflow-hidden rounded-full bg-stone-200">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${Math.min(100, (row.total / max) * 100)}%`,
                    background: row.color,
                  }}
                />
              </div>
              {isAdmin ? (
                <>
                <label className="mt-3 flex items-end gap-2">
                  <span className="flex-1">
                    <span className="text-sm text-stone-500">
                      {t("charityGoal")}
                    </span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={goals[row.id] ?? ""}
                      onChange={(e) =>
                        setGoals((g) => ({ ...g, [row.id]: e.target.value }))
                      }
                      className="mt-1 w-full rounded-2xl border border-stone-200 px-3 py-2"
                    />
                  </span>
                  <button
                    type="button"
                    onClick={() => saveGoal(row.id)}
                    className="rounded-2xl bg-stone-900 px-4 py-2 font-semibold text-white"
                  >
                    {t("save")}
                  </button>
                </label>
                <Hint>{t("charityGoalHint")}</Hint>
                </>
              ) : (
                <p className="mt-2 text-sm text-stone-500">
                  {goal > 0 ? t("charityGoal") : t("charityNoGoal")}
                </p>
              )}

              <h3 className="mt-4 font-semibold">{t("charityWhoPaid")}</h3>
              {row.byMember.length === 0 ? (
                <p className="text-stone-500">{t("charityNotPaid")}</p>
              ) : (
                <ul className="mt-2 space-y-1">
                  {row.byMember.map((m) => (
                    <li key={m.userId} className="flex justify-between">
                      <span>{m.name}</span>
                      <span className="font-semibold">
                        {money(m.total, currency, locale)}
                      </span>
                    </li>
                  ))}
                  <li className="flex justify-between border-t border-stone-200 pt-1 font-bold">
                    <span>{t("charityFamilyTotal")}</span>
                    <span>{money(row.total, currency, locale)}</span>
                  </li>
                </ul>
              )}
            </li>
          );
        })}
      </ul>

      {isAdmin ? (
        <div className="mt-6 space-y-3 rounded-3xl bg-white p-4 shadow-sm">
          <h2 className="text-xl font-semibold">{t("charityAddWhenNeeded")}</h2>
          <Hint>{t("charityAddTypeHint")}</Hint>
          <div className="grid grid-cols-3 gap-2">
            {(["Zakat", "Orphans", "Sadaqah"] as const)
              .filter((name) => !data?.types.some((row) => row.name === name))
              .map((name) => (
                <button
                  key={name}
                  type="button"
                  disabled={busy}
                  onClick={() => addKnownType(name)}
                  className="min-h-14 rounded-2xl bg-stone-900 px-2 text-lg font-semibold text-white disabled:opacity-60"
                >
                  {labelFor(name, t)}
                </button>
              ))}
          </div>
          <form onSubmit={addType} className="space-y-3">
            <label className="block">
              <span className="text-stone-500">{t("charityTypeName")}</span>
              <input
                value={newType}
                onChange={(e) => setNewType(e.target.value)}
                className="mt-1 w-full rounded-2xl border border-stone-200 px-3 py-3 text-lg"
                placeholder={t("charityAddType")}
              />
            </label>
            <button
              type="submit"
              disabled={busy || !newType.trim()}
              className="flex min-h-12 w-full items-center justify-center rounded-2xl bg-stone-900 font-semibold text-white disabled:opacity-60"
            >
              {t("save")}
            </button>
          </form>
        </div>
      ) : null}
      <BottomNav />
    </main>
  );
}
