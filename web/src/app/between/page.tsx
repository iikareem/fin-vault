"use client";

import { FormEvent, useEffect, useState } from "react";
import { api, money, parseAmount, todayISO } from "@/lib/api";
import { BottomNav } from "@/components/BottomNav";
import { PageShell } from "@/components/PageShell";
import { useI18n } from "@/components/I18nProvider";
import { useBooks } from "@/components/BooksProvider";
import { labelFor, fill } from "@/lib/i18n";
import { householdPath } from "@/lib/space";
import { Money } from "@/components/Money";

type Person = { id: string; name: string };
type Category = { id: string; name: string; kind: string };
type Loan = {
  id: string;
  fromUserId: string;
  toUserId: string;
  recordedByUserId?: string | null;
  originalAmount: number;
  remaining: number;
  repaid: number;
  status: string;
  note: string;
  fromUser: { id: string; name: string };
  toUser: { id: string; name: string };
  category: { id: string; name: string; color: string };
};

export default function BetweenPage() {
  const { t, locale } = useI18n();
  const { userId, house, setKind } = useBooks();
  const houseId = house?.householdId ?? "";
  const currency = house?.currency ?? "EGP";
  const [people, setPeople] = useState<Person[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [youOwe, setYouOwe] = useState<Loan[]>([]);
  const [youAreOwed, setYouAreOwed] = useState<Loan[]>([]);
  const [toUserId, setToUserId] = useState("");
  const [direction, setDirection] = useState<"I_GAVE" | "THEY_GAVE">("I_GAVE");
  const [categoryId, setCategoryId] = useState("");
  const [amount, setAmount] = useState("");
  const [occurredOn, setOccurredOn] = useState(todayISO());
  const [note, setNote] = useState("");
  const [payAmount, setPayAmount] = useState<Record<string, string>>({});
  const [editId, setEditId] = useState("");
  const [editAmount, setEditAmount] = useState("");
  const [editNote, setEditNote] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  function refresh(hid: string) {
    return Promise.all([
      api<{ youOwe: Loan[]; youAreOwed: Loan[] }>(householdPath(hid, "/loans")),
      api<Person[]>(householdPath(hid, "/users")),
      api<Category[]>(householdPath(hid, "/categories")),
    ]).then(([loans, users, cats]) => {
      setYouOwe(loans.youOwe);
      setYouAreOwed(loans.youAreOwed);
      setPeople(users);
      const peer = cats.filter((c) => c.kind === "PEER");
      setCategories(peer);
      if (peer[0] && !categoryId) setCategoryId(peer[0].id);
    });
  }

  useEffect(() => {
    if (!house) return;
    setKind("HOUSE");
    const hid = house.householdId;
    Promise.all([
      api<Person[]>(householdPath(hid, "/users")),
      refresh(hid),
    ])
      .then(([users]) => {
        const others = users.filter((u) => u.id !== userId);
        if (others[0]) setToUserId(others[0].id);
      })
      .catch((e) => setError(e.message));
  }, [house?.householdId, userId]);

  async function give(e: FormEvent) {
    e.preventDefault();
    if (!houseId) return;
    setBusy(true);
    setError("");
    try {
      await api(householdPath(houseId, "/loans"), {
        method: "POST",
        body: JSON.stringify({
          toUserId,
          direction,
          categoryId,
          amount: parseAmount(amount),
          occurredOn,
          note,
        }),
      });
      setAmount("");
      setNote("");
      await refresh(houseId);
    } catch {
      setError(t("couldNotSave"));
    } finally {
      setBusy(false);
    }
  }

  async function repay(loanId: string) {
    const value = parseAmount(payAmount[loanId] ?? "");
    if (!houseId || !value) return;
    setBusy(true);
    setError("");
    try {
      await api(householdPath(houseId, `/loans/${loanId}/repayments`), {
        method: "POST",
        body: JSON.stringify({ amount: value, occurredOn: todayISO() }),
      });
      setPayAmount((prev) => ({ ...prev, [loanId]: "" }));
      await refresh(houseId);
    } catch {
      setError(t("couldNotSave"));
    } finally {
      setBusy(false);
    }
  }

  function canManageLoan(loan: Loan) {
    if (loan.repaid > 0.001) return false;
    if (loan.recordedByUserId) return loan.recordedByUserId === userId;
    return loan.fromUserId === userId || loan.toUserId === userId;
  }

  async function saveLoanEdit(loanId: string) {
    if (!houseId) return;
    setBusy(true);
    setError("");
    try {
      await api(householdPath(houseId, `/loans/${loanId}`), {
        method: "PATCH",
        body: JSON.stringify({
          amount: parseAmount(editAmount),
          note: editNote,
        }),
      });
      setEditId("");
      await refresh(houseId);
    } catch {
      setError(t("couldNotSave"));
    } finally {
      setBusy(false);
    }
  }

  async function deleteLoan(loanId: string) {
    if (!houseId) return;
    setBusy(true);
    setError("");
    try {
      await api(householdPath(houseId, `/loans/${loanId}`), {
        method: "DELETE",
      });
      setConfirmDeleteId("");
      setEditId("");
      await refresh(houseId);
    } catch {
      setError(t("couldNotSave"));
    } finally {
      setBusy(false);
    }
  }

  const others = people.filter((p) => p.id !== userId);
  const otherName = others.find((p) => p.id === toUserId)?.name ?? "";

  function loanCard(loan: Loan, asDebtor: boolean) {
    const other = asDebtor ? loan.fromUser : loan.toUser;
    const manage = canManageLoan(loan);
    return (
      <li key={loan.id} className="rounded-2xl bg-white px-4 py-3 shadow-sm">
        <div className="money-row">
          <span className="font-semibold" dir="auto">
            {other.name}
          </span>
          <span className="font-semibold">
            <Money
              amount={loan.remaining}
              currency={currency}
              locale={locale}
            />
          </span>
        </div>
        <p className="text-sm text-stone-500">
          {labelFor(loan.category.name, t)} · {t("remaining")} ·{" "}
          {t("ofOriginal", {
            amount: money(loan.originalAmount, currency, locale),
          })}
          {loan.note ? ` · ${loan.note}` : ""}
        </p>
        {manage ? (
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                setEditId(loan.id);
                setConfirmDeleteId("");
                setEditAmount(String(loan.originalAmount));
                setEditNote(loan.note);
              }}
              className="rounded-xl bg-stone-100 px-3 py-2 text-sm font-semibold text-stone-800"
            >
              {t("edit")}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                confirmDeleteId === loan.id
                  ? deleteLoan(loan.id)
                  : setConfirmDeleteId(loan.id)
              }
              className="rounded-xl bg-stone-100 px-3 py-2 text-sm font-semibold text-red-800"
            >
              {confirmDeleteId === loan.id
                ? t("confirmDelete")
                : t("deleteItem")}
            </button>
          </div>
        ) : null}
        {editId === loan.id ? (
          <div className="mt-3 space-y-2">
            <input
              inputMode="decimal"
              dir="ltr"
              className="amount-input w-full rounded-xl border border-stone-300 px-3 py-2 text-xl"
              value={editAmount}
              onChange={(e) => setEditAmount(e.target.value)}
            />
            <input
              className="w-full rounded-xl border border-stone-300 px-3 py-2"
              value={editNote}
              onChange={(e) => setEditNote(e.target.value)}
              placeholder={t("noteOptional")}
            />
            <button
              type="button"
              disabled={busy}
              onClick={() => saveLoanEdit(loan.id)}
              className="w-full rounded-xl bg-stone-900 px-3 py-2 font-semibold text-white disabled:opacity-60"
            >
              {busy ? t("saving") : t("save")}
            </button>
          </div>
        ) : null}
        {asDebtor && loan.remaining > 0.001 ? (
          <div className="mt-3 space-y-1">
            <p className="text-sm text-stone-500">{t("payBackHint")}</p>
            <div className="flex gap-2">
              <input
                inputMode="decimal"
                dir="ltr"
                className="amount-input min-w-0 flex-1 rounded-xl border border-stone-300 px-3 py-2"
                placeholder={t("payBackAmount")}
                value={payAmount[loan.id] ?? ""}
                onChange={(e) =>
                  setPayAmount((prev) => ({ ...prev, [loan.id]: e.target.value }))
                }
              />
              <button
                type="button"
                disabled={busy}
                onClick={() => repay(loan.id)}
                className="rounded-xl bg-emerald-800 px-3 py-2 font-semibold text-white"
              >
                {t("payBack")}
              </button>
            </div>
          </div>
        ) : loan.remaining > 0.001 ? (
          <p className="mt-2 text-sm text-stone-500">{t("waitingOtherToPay")}</p>
        ) : (
          <p className="mt-2 text-sm text-emerald-800">{t("settled")}</p>
        )}
      </li>
    );
  }

  return (
    <PageShell>
      <h1 className="text-2xl font-bold leading-tight sm:text-3xl">🤝 {t("betweenTitle")}</h1>
      <p className="mt-2 text-stone-600">{t("betweenHint")}</p>
      {error ? <p className="mt-3 text-red-700">{error}</p> : null}

      <form onSubmit={give} className="surface mt-6 space-y-4 rounded-3xl p-4">
        <div>
          <h2 className="text-xl font-semibold">{t("betweenNewTitle")}</h2>
        </div>
        <div>
          <p className="mb-1 font-medium">{t("betweenWhatHappened")}</p>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setDirection("I_GAVE")}
              className={`rounded-2xl px-3 py-3 text-lg font-bold ${
                direction === "I_GAVE"
                  ? "bg-emerald-800 text-white shadow"
                  : "bg-white text-stone-700"
              }`}
            >
              📤 {t("iGave")}
            </button>
            <button
              type="button"
              onClick={() => setDirection("THEY_GAVE")}
              className={`rounded-2xl px-3 py-3 text-lg font-bold ${
                direction === "THEY_GAVE"
                  ? "bg-amber-800 text-white shadow"
                  : "bg-white text-stone-700"
              }`}
            >
              📥 {t("theyGaveMe")}
            </button>
          </div>
          <p className="mt-2 text-sm leading-relaxed text-stone-500">
            {direction === "I_GAVE" ? t("iGaveHint") : t("theyGaveMeHint")}
          </p>
        </div>
        <label className="block">
          <span className="mb-1 block font-medium">{t("who")}</span>
          <select
            className="w-full rounded-2xl border border-stone-300 px-4 py-3 text-lg"
            value={toUserId}
            onChange={(e) => setToUserId(e.target.value)}
            required
          >
            {others.length === 0 ? (
              <option value="">{t("pickPerson")}</option>
            ) : null}
            {others.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <p className="mt-1 text-sm leading-relaxed text-stone-500">
            {direction === "I_GAVE" ? t("whoHintIGave") : t("whoHintTheyGave")}
          </p>
        </label>
        {otherName ? (
          <p className="rounded-2xl bg-emerald-50 px-4 py-3 text-base leading-relaxed text-emerald-950">
            {fill(
              direction === "I_GAVE"
                ? t("betweenSummaryIGave")
                : t("betweenSummaryTheyGave"),
              { name: otherName },
            )}
          </p>
        ) : null}
        <label className="block">
          <span className="mb-1 block font-medium">{t("forWhat")}</span>
          <select
            className="w-full rounded-2xl border border-stone-300 px-4 py-3 text-lg"
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
          >
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {labelFor(c.name, t)}
              </option>
            ))}
          </select>
          <p className="mt-1 text-sm leading-relaxed text-stone-500">{t("forWhatHint")}</p>
        </label>
        <label className="block">
          <span className="mb-1 block font-medium">{t("amount")}</span>
          <input
            inputMode="decimal"
            dir="ltr"
            className="amount-input w-full rounded-2xl border border-stone-300 px-4 py-3 text-2xl"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0"
            required
          />
          <p className="mt-1 text-sm leading-relaxed text-stone-500">{t("amountHint")}</p>
        </label>
        <label className="block">
          <span className="mb-1 block font-medium">{t("day")}</span>
          <input
            type="date"
            className="w-full rounded-2xl border border-stone-300 px-4 py-3 text-lg"
            value={occurredOn}
            onChange={(e) => setOccurredOn(e.target.value)}
            required
          />
          <p className="mt-1 text-sm leading-relaxed text-stone-500">{t("dayHint")}</p>
        </label>
        <label className="block">
          <span className="mb-1 block font-medium">{t("noteOptional")}</span>
          <input
            className="w-full rounded-2xl border border-stone-300 px-4 py-3 text-lg"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          <p className="mt-1 text-sm leading-relaxed text-stone-500">{t("noteHint")}</p>
        </label>
        <button
          disabled={busy || !toUserId}
          className="w-full rounded-2xl bg-stone-900 py-4 text-lg font-semibold text-white disabled:opacity-60"
        >
          {busy ? t("saving") : t("save")}
        </button>
        <p className="text-sm leading-relaxed text-stone-500">{t("saveBetweenHint")}</p>
      </form>

      <h2 className="mt-8 text-xl font-semibold">{t("youOweTitle")}</h2>
      <p className="mt-1 text-stone-600">{t("youOweHint")}</p>
      <ul className="mt-3 space-y-2">
        {youOwe.length === 0 ? (
          <li className="text-stone-500">{t("noLoansOwe")}</li>
        ) : (
          youOwe.map((l) => loanCard(l, true))
        )}
      </ul>

      <h2 className="mt-8 text-xl font-semibold">{t("theyOweTitle")}</h2>
      <p className="mt-1 text-stone-600">{t("theyOweHint")}</p>
      <ul className="mt-3 space-y-2">
        {youAreOwed.length === 0 ? (
          <li className="text-stone-500">{t("noLoansOwed")}</li>
        ) : (
          youAreOwed.map((l) => loanCard(l, false))
        )}
      </ul>
      <BottomNav />
    </PageShell>
  );
}
