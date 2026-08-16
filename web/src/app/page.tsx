"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api, money, parseAmount, todayISO } from "@/lib/api";
import { fill, labelFor } from "@/lib/i18n";
import { useCalendarClock } from "@/hooks/useCalendarClock";
import { BottomNav } from "@/components/BottomNav";
import { PageShell } from "@/components/PageShell";
import { useI18n } from "@/components/I18nProvider";
import { useBooks } from "@/components/BooksProvider";
import { householdPath } from "@/lib/space";
import { Hint } from "@/components/Hint";
import { Money } from "@/components/Money";
import {
  isCashWallet,
  isCurrentWallet,
  isSavingsWallet,
  sortCashWallets,
} from "@/lib/wallets";

type Summary = {
  totalMoney: number;
  cashNow: number;
  broughtForward: number;
  savedThisMonth: number;
  monthIncome: number;
  monthExpense: number;
  todayIncome: number;
  todayExpense: number;
  youOwe: number;
  youAreOwed: number;
  claimsWaiting: number;
  claimsPendingTotal?: number;
  claimsPendingCount?: number;
  coversWaiting?: number;
  coversPendingTotal?: number;
  coversPendingCount?: number;
};
type Account = { id: string; name: string; type?: string; balance: number };
type CharityTypeRow = {
  id: string;
  name: string;
  total: number;
  paid: boolean;
  monthlyGoal: number;
};
type CharityMonth = { familyTotal: number; types: CharityTypeRow[] };
type Tx = {
  id: string;
  type: "INCOME" | "EXPENSE" | "REIMBURSEMENT";
  amount: string | number;
  note: string;
  category: { name: string };
  user: { name: string };
  account?: { name: string; type?: string };
};

function isCashAccount(a: { type?: string; name: string }) {
  return isCashWallet(a);
}
type Claim = {
  id: string;
  amount: number;
  remaining: number;
  reimbursed: number;
  status: string;
  note: string;
  occurredOn: string;
  member: { id: string; name: string };
  category: { name: string };
};
type Cover = {
  id: string;
  amount: number;
  remaining: number;
  repaid: number;
  status: string;
  note: string;
  occurredOn: string;
  member: { id: string; name: string };
  category: { name: string };
};

export default function HomePage() {
  const { t, locale } = useI18n();
  const { name, userId, active, setKind } = useBooks();
  const cal = useCalendarClock();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [txs, setTxs] = useState<Tx[]>([]);
  const [charity, setCharity] = useState<CharityMonth | null>(null);
  const [claims, setClaims] = useState<Claim[]>([]);
  const [covers, setCovers] = useState<Cover[]>([]);
  const [payingId, setPayingId] = useState("");
  const [repayingId, setRepayingId] = useState("");
  const [payWalletId, setPayWalletId] = useState("");
  const [payAmounts, setPayAmounts] = useState<Record<string, string>>({});
  const [repayAmounts, setRepayAmounts] = useState<Record<string, string>>({});
  const [editId, setEditId] = useState("");
  const [editAmount, setEditAmount] = useState("");
  const [editNote, setEditNote] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState("");
  const [error, setError] = useState("");
  const [flash, setFlash] = useState("");
  const [busyEdit, setBusyEdit] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const key = sessionStorage.getItem("fb_flash");
    if (key === "claimSaved") {
      sessionStorage.removeItem("fb_flash");
      setFlash(t("claimSaved"));
    } else if (key === "payBackDone") {
      sessionStorage.removeItem("fb_flash");
      setFlash(t("payBackDone"));
    } else if (key === "housePaidForSaved") {
      sessionStorage.removeItem("fb_flash");
      setFlash(t("housePaidForSaved"));
    } else if (key === "coverRepayDone") {
      sessionStorage.removeItem("fb_flash");
      setFlash(t("coverRepayDone"));
    }
  }, [t]);

  useEffect(() => {
    if (!active) return;
    setError("");
    const month = cal.monthKey;
    const jobs: Promise<unknown>[] = [
      api<Summary>(householdPath(active.householdId, "/analytics/summary")),
      api<Account[]>(householdPath(active.householdId, "/accounts")),
      api<Tx[]>(householdPath(active.householdId, "/transactions")),
    ];
    if (active.kind === "HOUSE") {
      jobs.push(
        api<CharityMonth>(
          householdPath(active.householdId, `/charity?month=${month}`),
        ),
        api<Claim[]>(householdPath(active.householdId, "/claims")),
        api<Cover[]>(householdPath(active.householdId, "/covers")),
      );
    } else {
      setCharity(null);
      setClaims([]);
      setCovers([]);
    }
    Promise.all(jobs)
      .then((result) => {
        setSummary(result[0] as Summary);
        setAccounts(result[1] as Account[]);
        setTxs(
          (result[2] as Tx[])
            .filter((tx) => !tx.account || isCashAccount(tx.account))
            .slice(0, 8),
        );
        if (active.kind === "HOUSE") {
          setCharity(result[3] as CharityMonth);
          setClaims(result[4] as Claim[]);
          setCovers(result[5] as Cover[]);
        }
      })
      .catch((e) => setError(e.message));
  }, [active?.householdId, active?.kind, cal.monthKey]);

  const currency = active?.currency ?? "EGP";
  const isHouse = active?.kind === "HOUSE";
  const isAdmin = active?.role === "ADMIN";
  const cashAccounts = sortCashWallets(accounts.filter(isCashAccount));
  const currentWallet = cashAccounts.find(isCurrentWallet);
  const savingsWallet = cashAccounts.find(isSavingsWallet);
  const cashTotal = cashAccounts.reduce((s, a) => s + a.balance, 0);
  const cashId = payWalletId || currentWallet?.id || cashAccounts[0]?.id;
  const waitingClaims = claims.filter((c) => c.remaining > 0.001);
  const waitingCovers = covers.filter((c) => c.remaining > 0.001);
  const pendingTotal =
    summary?.claimsPendingTotal ??
    waitingClaims.reduce((s, c) => s + c.remaining, 0);
  const pendingCount = summary?.claimsPendingCount ?? waitingClaims.length;
  const coverPendingTotal =
    summary?.coversPendingTotal ??
    waitingCovers.reduce((s, c) => s + c.remaining, 0);
  const coverPendingCount =
    summary?.coversPendingCount ?? waitingCovers.length;

  async function refreshHouseLists() {
    if (!active) return;
    const [s, a, tx, list, coverList] = await Promise.all([
      api<Summary>(householdPath(active.householdId, "/analytics/summary")),
      api<Account[]>(householdPath(active.householdId, "/accounts")),
      api<Tx[]>(householdPath(active.householdId, "/transactions")),
      api<Claim[]>(householdPath(active.householdId, "/claims")),
      api<Cover[]>(householdPath(active.householdId, "/covers")),
    ]);
    setSummary(s);
    setAccounts(a);
    setTxs(
      tx
        .filter((row) => !row.account || isCashAccount(row.account))
        .slice(0, 8),
    );
    setClaims(list);
    setCovers(coverList);
  }

  async function payClaim(claim: Claim, full = false) {
    if (!active || !cashId) return;
    const typed = parseAmount(payAmounts[claim.id] ?? "");
    const amount = full
      ? claim.remaining
      : Number.isFinite(typed) && typed > 0
        ? typed
        : claim.remaining;
    if (amount <= 0) {
      setError(t("payBackAmount"));
      return;
    }
    if (amount > claim.remaining + 0.001) {
      setError(t("payBackTooMuch"));
      return;
    }
    setPayingId(claim.id);
    setError("");
    try {
      await api(
        householdPath(active.householdId, `/claims/${claim.id}/reimbursements`),
        {
          method: "POST",
          body: JSON.stringify({
            amount,
            accountId: cashId,
            occurredOn: todayISO(),
          }),
        },
      );
      await refreshHouseLists();
      setPayAmounts((prev) => ({ ...prev, [claim.id]: "" }));
      setFlash(t("payBackDone"));
    } catch (e) {
      setError(e instanceof Error ? e.message : t("couldNotSave"));
    } finally {
      setPayingId("");
    }
  }

  async function repayCover(cover: Cover, full = false) {
    if (!active || !cashId) return;
    const typed = parseAmount(repayAmounts[cover.id] ?? "");
    const amount = full
      ? cover.remaining
      : Number.isFinite(typed) && typed > 0
        ? typed
        : cover.remaining;
    if (amount <= 0) {
      setError(t("payBackAmount"));
      return;
    }
    if (amount > cover.remaining + 0.001) {
      setError(t("payBackTooMuch"));
      return;
    }
    setRepayingId(cover.id);
    setError("");
    try {
      await api(
        householdPath(active.householdId, `/covers/${cover.id}/repayments`),
        {
          method: "POST",
          body: JSON.stringify({
            amount,
            accountId: cashId,
            occurredOn: todayISO(),
          }),
        },
      );
      await refreshHouseLists();
      setRepayAmounts((prev) => ({ ...prev, [cover.id]: "" }));
      setFlash(t("coverRepayDone"));
    } catch (e) {
      setError(e instanceof Error ? e.message : t("couldNotSave"));
    } finally {
      setRepayingId("");
    }
  }

  function startEditObligation(id: string, amount: number, note: string) {
    setEditId(id);
    setConfirmDeleteId("");
    setEditAmount(String(amount));
    setEditNote(note);
  }

  async function saveClaimEdit(id: string) {
    if (!active) return;
    setBusyEdit(true);
    setError("");
    try {
      await api(householdPath(active.householdId, `/claims/${id}`), {
        method: "PATCH",
        body: JSON.stringify({
          amount: parseAmount(editAmount),
          note: editNote,
        }),
      });
      setEditId("");
      await refreshHouseLists();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("couldNotSave"));
    } finally {
      setBusyEdit(false);
    }
  }

  async function saveCoverEdit(id: string) {
    if (!active) return;
    setBusyEdit(true);
    setError("");
    try {
      await api(householdPath(active.householdId, `/covers/${id}`), {
        method: "PATCH",
        body: JSON.stringify({
          amount: parseAmount(editAmount),
          note: editNote,
        }),
      });
      setEditId("");
      await refreshHouseLists();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("couldNotSave"));
    } finally {
      setBusyEdit(false);
    }
  }

  async function deleteObligation(path: string) {
    if (!active) return;
    setBusyEdit(true);
    setError("");
    try {
      await api(householdPath(active.householdId, path), { method: "DELETE" });
      setConfirmDeleteId("");
      setEditId("");
      await refreshHouseLists();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("couldNotSave"));
    } finally {
      setBusyEdit(false);
    }
  }

  return (
    <PageShell>
      <p className="text-lg text-stone-600">
        👋 {name ? t("helloName", { name }) : t("hello")}
      </p>
      <p className="mt-1 text-sm leading-relaxed text-stone-500">
        {isHouse ? t("homeHintHouse") : t("homeHintMine")}
      </p>
      {flash ? (
        <p className="mt-3 rounded-2xl bg-emerald-50 px-4 py-3 text-emerald-900">
          {flash}
        </p>
      ) : null}
      {error ? <p className="mt-2 text-red-700">{error}</p> : null}

      <section
        className="mt-3 rounded-[1.75rem] p-5 shadow-lg"
        style={{
          color: "#fff",
          background: isHouse
            ? "linear-gradient(to bottom right, #047857, #022c22)"
            : "linear-gradient(to bottom right, #0369a1, #082f49)",
        }}
      >
        <p className="text-base" style={{ color: "#fff" }}>
          💵 {isHouse ? t("houseMoneyNow") : t("yourMoneyNow")}
        </p>
        <p className="mt-1 text-[clamp(1.4rem,7.2vw,2.25rem)] font-bold leading-tight">
          {accounts.length ? (
            <Money amount={cashTotal} currency={currency} locale={locale} />
          ) : (
            "…"
          )}
        </p>
        <div className="mt-4 grid grid-cols-1 gap-3 min-[380px]:grid-cols-2">
          <div
            className="rounded-2xl px-3 py-2"
            style={{ background: "rgba(255,255,255,0.18)" }}
          >
            <p className="text-sm opacity-90">💵 {t("currentWallet")}</p>
            <p className="text-xl font-semibold leading-tight">
              {accounts.length ? (
                <Money
                  amount={currentWallet?.balance ?? 0}
                  currency={currency}
                  locale={locale}
                />
              ) : (
                "…"
              )}
            </p>
            <p className="mt-1 text-xs opacity-80">{t("currentHint")}</p>
          </div>
          <div
            className="rounded-2xl px-3 py-2"
            style={{ background: "rgba(255,255,255,0.18)" }}
          >
            <p className="text-sm opacity-90">💰 {t("savingsWallet")}</p>
            <p className="text-xl font-semibold leading-tight">
              {accounts.length ? (
                <Money
                  amount={savingsWallet?.balance ?? 0}
                  currency={currency}
                  locale={locale}
                />
              ) : (
                "…"
              )}
            </p>
            <p className="mt-1 text-xs opacity-80">{t("savingsHint")}</p>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-1 gap-3 min-[380px]:grid-cols-2">
          <div
            className="rounded-2xl px-3 py-2"
            style={{ background: "rgba(255,255,255,0.18)" }}
          >
            <p className="text-sm opacity-90">📈 {t("monthIn")}</p>
            <p className="text-lg font-semibold leading-tight">
              {summary ? (
                <Money
                  amount={summary.monthIncome}
                  currency={currency}
                  locale={locale}
                />
              ) : (
                "…"
              )}
            </p>
            <p className="mt-1 text-xs opacity-80">{t("monthInHint")}</p>
          </div>
          <div
            className="rounded-2xl px-3 py-2"
            style={{ background: "rgba(255,255,255,0.18)" }}
          >
            <p className="text-sm opacity-90">📉 {t("monthOut")}</p>
            <p className="text-lg font-semibold leading-tight">
              {summary ? (
                <Money
                  amount={summary.monthExpense}
                  currency={currency}
                  locale={locale}
                />
              ) : (
                "…"
              )}
            </p>
            <p className="mt-1 text-xs opacity-80">{t("monthOutHint")}</p>
          </div>
        </div>
        <p className="mt-3 text-sm opacity-90">
          📅{" "}
          {cal.remainingDays === 0
            ? t("lastDayOfMonth")
            : cal.remainingDays === 1
              ? t("daysLeftOne")
              : fill(t("daysLeft"), { n: String(cal.remainingDays) })}
          {" · "}
          {fill(t("monthLength"), { n: String(cal.daysInMonth) })}
        </p>
      </section>

      {summary &&
      ((summary.claimsWaiting ?? 0) > 0.001 ||
        (summary.coversWaiting ?? 0) > 0.001) &&
      !isHouse ? (
        <div className="mt-4 space-y-2">
          {summary.claimsWaiting > 0.001 ? (
            <button
              type="button"
              onClick={() => setKind("HOUSE")}
              className="surface block w-full rounded-2xl px-4 py-3 text-right"
            >
              <p className="font-semibold text-amber-900">
                🏠{" "}
                {t("houseOwesYou", {
                  amount: money(summary.claimsWaiting, currency, locale),
                })}
              </p>
              <p className="mt-1 text-sm text-stone-600">
                {t("houseOwesYouAction")}
              </p>
              <p className="mt-2 text-sm font-semibold text-emerald-800">
                {t("openHouseBooks")} →
              </p>
            </button>
          ) : null}
          {(summary.coversWaiting ?? 0) > 0.001 ? (
            <button
              type="button"
              onClick={() => setKind("HOUSE")}
              className="surface block w-full rounded-2xl px-4 py-3 text-right"
            >
              <p className="font-semibold text-indigo-900">
                🏠{" "}
                {t("youOweHouse", {
                  amount: money(summary.coversWaiting ?? 0, currency, locale),
                })}
              </p>
              <p className="mt-1 text-sm text-stone-600">
                {t("youOweHouseAction")}
              </p>
              <p className="mt-2 text-sm font-semibold text-emerald-800">
                {t("openHouseBooks")} →
              </p>
            </button>
          ) : null}
        </div>
      ) : null}

      {isHouse && summary ? (
        <div className="mt-4 space-y-2">
          {summary.claimsWaiting > 0.001 ? (
            <div className="rounded-2xl bg-amber-50 px-4 py-3">
              <p className="font-semibold text-amber-950">
                🏠{" "}
                {t("houseOwesYou", {
                  amount: money(summary.claimsWaiting, currency, locale),
                })}
              </p>
              <p className="mt-1 text-sm text-amber-900/80">{t("waitingPayback")}</p>
            </div>
          ) : null}
          {(summary.coversWaiting ?? 0) > 0.001 ? (
            <div className="rounded-2xl bg-indigo-50 px-4 py-3">
              <p className="font-semibold text-indigo-950">
                🏠{" "}
                {t("youOweHouse", {
                  amount: money(summary.coversWaiting ?? 0, currency, locale),
                })}
              </p>
              <p className="mt-1 text-sm text-indigo-900/80">
                {t("yourCoverWaiting")}
              </p>
            </div>
          ) : null}
          {isAdmin && pendingCount > 0 ? (
            <div className="rounded-2xl bg-amber-100 px-4 py-3">
              <p className="font-semibold text-amber-950">
                ⏳{" "}
                {pendingCount === 1
                  ? t("claimsAdminBannerOne", {
                      amount: money(pendingTotal, currency, locale),
                    })
                  : t("claimsAdminBanner", {
                      amount: money(pendingTotal, currency, locale),
                      n: String(pendingCount),
                    })}
              </p>
              <Hint>{t("claimsHomeHint")}</Hint>
            </div>
          ) : null}
          {isAdmin && coverPendingCount > 0 ? (
            <div className="rounded-2xl bg-indigo-100 px-4 py-3">
              <p className="font-semibold text-indigo-950">
                ⏳{" "}
                {coverPendingCount === 1
                  ? t("coversAdminBannerOne", {
                      amount: money(coverPendingTotal, currency, locale),
                    })
                  : t("coversAdminBanner", {
                      amount: money(coverPendingTotal, currency, locale),
                      n: String(coverPendingCount),
                    })}
              </p>
              <Hint>{t("housePaidForHint")}</Hint>
            </div>
          ) : null}
          {summary.youOwe > 0.001 || summary.youAreOwed > 0.001 ? (
            <p className="text-sm text-stone-500">{t("homeIouHint")}</p>
          ) : null}
          {summary.youOwe > 0.001 ? (
            <Link href="/between" className="surface block rounded-2xl px-4 py-3">
              📤 {t("youOwe", { amount: money(summary.youOwe, currency, locale) })}
            </Link>
          ) : null}
          {summary.youAreOwed > 0.001 ? (
            <Link href="/between" className="surface block rounded-2xl px-4 py-3">
              📥 {t("theyOweYou", {
                amount: money(summary.youAreOwed, currency, locale),
              })}
            </Link>
          ) : null}
        </div>
      ) : null}

      {isHouse && waitingClaims.length > 0 ? (
        <section className="surface mt-5 rounded-[1.75rem] p-4">
          <h2 className="text-xl font-semibold">⏳ {t("peoplePaidTitle")}</h2>
          <Hint>{t("claimsHomeHint")}</Hint>
          <ul className="mt-3 space-y-3">
            {waitingClaims.map((c) => {
              const mine = c.member.id === userId;
              const canManage =
                (mine || isAdmin) && c.reimbursed < 0.001 && c.remaining > 0.001;
              return (
              <li
                key={c.id}
                className={`rounded-2xl px-3 py-3 ${
                  mine ? "bg-sky-50" : "bg-amber-50"
                }`}
              >
                <div className="money-row">
                  <div className="min-w-0 text-right" dir="auto">
                    <p className="font-semibold">{c.member.name}</p>
                    <p className="text-stone-600">
                      {labelFor(c.category.name, t)}
                      {c.note ? ` · ${c.note}` : ""}
                    </p>
                    <p className="mt-1 text-sm font-medium text-amber-900">
                      {mine ? t("yourClaimWaiting") : t("waitingPayback")}
                    </p>
                  </div>
                  <span className="shrink-0 text-lg font-bold">
                    <Money
                      amount={c.remaining}
                      currency={currency}
                      locale={locale}
                    />
                  </span>
                </div>
                {canManage ? (
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => startEditObligation(c.id, c.amount, c.note)}
                      className="rounded-xl bg-white px-3 py-2 text-sm font-semibold text-stone-800"
                    >
                      {t("edit")}
                    </button>
                    <button
                      type="button"
                      disabled={busyEdit}
                      onClick={() =>
                        confirmDeleteId === c.id
                          ? deleteObligation(`/claims/${c.id}`)
                          : setConfirmDeleteId(c.id)
                      }
                      className="rounded-xl bg-white px-3 py-2 text-sm font-semibold text-red-800"
                    >
                      {confirmDeleteId === c.id
                        ? t("confirmDelete")
                        : t("deleteItem")}
                    </button>
                  </div>
                ) : null}
                {editId === c.id ? (
                  <div className="mt-3 space-y-2">
                    <input
                      inputMode="decimal"
                      dir="ltr"
                      className="amount-input w-full rounded-2xl border border-stone-300 bg-white px-4 py-3 text-xl"
                      value={editAmount}
                      onChange={(e) => setEditAmount(e.target.value)}
                    />
                    <input
                      className="w-full rounded-2xl border border-stone-300 bg-white px-4 py-3"
                      value={editNote}
                      onChange={(e) => setEditNote(e.target.value)}
                      placeholder={t("noteOptional")}
                    />
                    <button
                      type="button"
                      disabled={busyEdit}
                      onClick={() => saveClaimEdit(c.id)}
                      className="flex min-h-11 w-full items-center justify-center rounded-2xl bg-stone-900 font-semibold text-white disabled:opacity-60"
                    >
                      {busyEdit ? t("saving") : t("save")}
                    </button>
                  </div>
                ) : null}
                {isAdmin ? (
                  <div className="mt-3 space-y-2">
                    <p className="text-sm text-stone-500">{t("payFromWhich")}</p>
                    <div className="grid grid-cols-2 gap-2">
                      {cashAccounts.map((a) => (
                        <button
                          key={a.id}
                          type="button"
                          onClick={() => setPayWalletId(a.id)}
                          className={`rounded-2xl px-3 py-2 font-semibold ${
                            (payWalletId || cashId) === a.id
                              ? "bg-emerald-800 text-white"
                              : "bg-white text-stone-700"
                          }`}
                        >
                          {isSavingsWallet(a)
                            ? "💰 " + t("savingsWallet")
                            : "💵 " + t("currentWallet")}
                        </button>
                      ))}
                    </div>
                    <input
                      inputMode="decimal"
                      dir="ltr"
                      className="amount-input w-full rounded-2xl border border-stone-300 bg-white px-4 py-3 text-2xl"
                      value={payAmounts[c.id] ?? ""}
                      onChange={(e) =>
                        setPayAmounts((prev) => ({
                          ...prev,
                          [c.id]: e.target.value,
                        }))
                      }
                      placeholder={String(c.remaining)}
                    />
                    <button
                      type="button"
                      disabled={!!payingId || !cashId}
                      onClick={() => payClaim(c, true)}
                      className="flex min-h-12 w-full items-center justify-center rounded-2xl bg-emerald-800 font-semibold text-white disabled:opacity-60"
                    >
                      {payingId === c.id
                        ? t("saving")
                        : "💸 " + t("payFullRemaining")}
                    </button>
                    <button
                      type="button"
                      disabled={!!payingId || !cashId}
                      onClick={() => payClaim(c, false)}
                      className="flex min-h-11 w-full items-center justify-center rounded-2xl bg-white font-semibold text-emerald-900 disabled:opacity-60"
                    >
                      {payingId === c.id
                        ? t("saving")
                        : "💸 " + t("payFromHouseCash")}
                    </button>
                    <Hint>{t("payClaimHint")}</Hint>
                  </div>
                ) : null}
              </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {isHouse && waitingCovers.length > 0 ? (
        <section className="surface mt-5 rounded-[1.75rem] p-4">
          <h2 className="text-xl font-semibold">🏠 {t("peopleCoveredTitle")}</h2>
          <Hint>{t("housePaidForHint")}</Hint>
          <ul className="mt-3 space-y-3">
            {waitingCovers.map((c) => {
              const mine = c.member.id === userId;
              const canRepay = isAdmin || mine;
              const canManage = isAdmin && c.repaid < 0.001 && c.remaining > 0.001;
              return (
                <li
                  key={c.id}
                  className={`rounded-2xl px-3 py-3 ${
                    mine ? "bg-indigo-50" : "bg-stone-100"
                  }`}
                >
                  <div className="money-row">
                    <div className="min-w-0 text-right" dir="auto">
                      <p className="font-semibold">{c.member.name}</p>
                      <p className="text-stone-600">
                        {labelFor(c.category.name, t)}
                        {c.note ? ` · ${c.note}` : ""}
                      </p>
                      <p className="mt-1 text-sm font-medium text-indigo-900">
                        {mine ? t("yourCoverWaiting") : t("waitingPayback")}
                      </p>
                    </div>
                    <span className="shrink-0 text-lg font-bold">
                      <Money
                        amount={c.remaining}
                        currency={currency}
                        locale={locale}
                      />
                    </span>
                  </div>
                  {canManage ? (
                    <div className="mt-2 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          startEditObligation(c.id, c.amount, c.note)
                        }
                        className="rounded-xl bg-white px-3 py-2 text-sm font-semibold text-stone-800"
                      >
                        {t("edit")}
                      </button>
                      <button
                        type="button"
                        disabled={busyEdit}
                        onClick={() =>
                          confirmDeleteId === c.id
                            ? deleteObligation(`/covers/${c.id}`)
                            : setConfirmDeleteId(c.id)
                        }
                        className="rounded-xl bg-white px-3 py-2 text-sm font-semibold text-red-800"
                      >
                        {confirmDeleteId === c.id
                          ? t("confirmDelete")
                          : t("deleteItem")}
                      </button>
                    </div>
                  ) : null}
                  {editId === c.id ? (
                    <div className="mt-3 space-y-2">
                      <input
                        inputMode="decimal"
                        dir="ltr"
                        className="amount-input w-full rounded-2xl border border-stone-300 bg-white px-4 py-3 text-xl"
                        value={editAmount}
                        onChange={(e) => setEditAmount(e.target.value)}
                      />
                      <input
                        className="w-full rounded-2xl border border-stone-300 bg-white px-4 py-3"
                        value={editNote}
                        onChange={(e) => setEditNote(e.target.value)}
                        placeholder={t("noteOptional")}
                      />
                      <button
                        type="button"
                        disabled={busyEdit}
                        onClick={() => saveCoverEdit(c.id)}
                        className="flex min-h-11 w-full items-center justify-center rounded-2xl bg-stone-900 font-semibold text-white disabled:opacity-60"
                      >
                        {busyEdit ? t("saving") : t("save")}
                      </button>
                    </div>
                  ) : null}
                  {canRepay ? (
                    <div className="mt-3 space-y-2">
                      <p className="text-sm text-stone-500">{t("payFromWhich")}</p>
                      <div className="grid grid-cols-2 gap-2">
                        {cashAccounts.map((a) => (
                          <button
                            key={a.id}
                            type="button"
                            onClick={() => setPayWalletId(a.id)}
                            className={`rounded-2xl px-3 py-2 font-semibold ${
                              (payWalletId || cashId) === a.id
                                ? "bg-indigo-800 text-white"
                                : "bg-white text-stone-700"
                            }`}
                          >
                            {isSavingsWallet(a)
                              ? "💰 " + t("savingsWallet")
                              : "💵 " + t("currentWallet")}
                          </button>
                        ))}
                      </div>
                      <input
                        inputMode="decimal"
                        dir="ltr"
                        className="amount-input w-full rounded-2xl border border-stone-300 bg-white px-4 py-3 text-2xl"
                        value={repayAmounts[c.id] ?? ""}
                        onChange={(e) =>
                          setRepayAmounts((prev) => ({
                            ...prev,
                            [c.id]: e.target.value,
                          }))
                        }
                        placeholder={String(c.remaining)}
                      />
                      <button
                        type="button"
                        disabled={!!repayingId || !cashId}
                        onClick={() => repayCover(c, true)}
                        className="flex min-h-12 w-full items-center justify-center rounded-2xl bg-indigo-800 font-semibold text-white disabled:opacity-60"
                      >
                        {repayingId === c.id
                          ? t("saving")
                          : "💸 " + t("repayFullToHouse")}
                      </button>
                      <button
                        type="button"
                        disabled={!!repayingId || !cashId}
                        onClick={() => repayCover(c, false)}
                        className="flex min-h-11 w-full items-center justify-center rounded-2xl bg-white font-semibold text-indigo-900 disabled:opacity-60"
                      >
                        {repayingId === c.id
                          ? t("saving")
                          : "💸 " + t("repayToHouse")}
                      </button>
                      <Hint>{t("repayCoverHint")}</Hint>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {isHouse ? (
        <Link
          href="/charity"
          className="surface mt-4 flex flex-col rounded-[1.75rem] p-4"
        >
          <div className="flex items-center justify-between">
            <span className="text-xl font-semibold">🕌 {t("navCharity")}</span>
            <span className="font-semibold">
              {charity ? (
                <Money
                  amount={charity.familyTotal}
                  currency={currency}
                  locale={locale}
                />
              ) : (
                ""
              )}
            </span>
          </div>
          <Hint>{t("charityHomeHint")}</Hint>
        </Link>
      ) : null}

      {isHouse && !isAdmin ? (
        <>
          <Link
            href="/add"
            className="mt-5 flex min-h-16 items-center justify-center rounded-3xl bg-stone-900 text-lg font-semibold text-white"
          >
            ➕ {t("addFromMyMoney")}
          </Link>
          <Hint>{t("addFromMyMoneyHomeHint")}</Hint>
        </>
      ) : isHouse && isAdmin ? (
        <div className="mt-5 grid grid-cols-1 gap-2">
          <Link
            href="/add"
            className="flex min-h-16 items-center justify-center rounded-3xl bg-stone-900 text-lg font-semibold text-white"
          >
            🧾 {t("addHousePayment")}
          </Link>
          <Hint>{t("addHousePaymentHint")}</Hint>
          <Link
            href="/add?mode=cover"
            className="flex min-h-14 items-center justify-center rounded-3xl bg-indigo-800 text-lg font-semibold text-white"
          >
            🏠 {t("housePaidForTitle")}
          </Link>
          <Hint>{t("housePaidForHint")}</Hint>
        </div>
      ) : (
        <>
        <Link
          href="/add"
          className="mt-5 flex min-h-16 items-center justify-center rounded-3xl bg-stone-900 text-lg font-semibold text-white"
        >
          ➕ {t("addPersonal")}
        </Link>
        <Hint>{t("addPersonalHint")}</Hint>
        </>
      )}

      {txs.length > 0 ? (
        <>
          <h2 className="mt-8 text-xl font-semibold">🕒 {t("latest")}</h2>
          <Hint>{t("latestHint")}</Hint>
          <ul className="mt-3 space-y-2">
            {txs.map((tx) => (
              <li key={tx.id} className="surface rounded-2xl px-4 py-3">
                <div className="money-row min-w-0">
                  <span className="min-w-0 font-medium" dir="auto">
                    {labelFor(tx.category.name, t)}
                  </span>
                  <span
                    className={`shrink-0 font-semibold ${
                      tx.type === "INCOME" ? "text-emerald-800" : "text-red-800"
                    }`}
                  >
                    <Money
                      amount={Number(tx.amount)}
                      currency={currency}
                      locale={locale}
                      extraSign={tx.type === "INCOME" ? "+" : "−"}
                    />
                  </span>
                </div>
                {tx.user.name !== "House" || tx.note ? (
                  <p className="text-sm text-stone-500">
                    {[tx.user.name === "House" ? null : labelFor(tx.user.name, t), tx.account ? labelFor(tx.account.name, t) : null, tx.note || null]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        </>
      ) : null}
      <BottomNav />
    </PageShell>
  );
}
