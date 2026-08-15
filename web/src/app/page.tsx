"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api, money, todayISO } from "@/lib/api";
import { fill, labelFor } from "@/lib/i18n";
import { useCalendarClock } from "@/hooks/useCalendarClock";
import { BottomNav } from "@/components/BottomNav";
import { PageShell } from "@/components/PageShell";
import { useI18n } from "@/components/I18nProvider";
import { useBooks } from "@/components/BooksProvider";
import { householdPath } from "@/lib/space";
import { Hint } from "@/components/Hint";
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

export default function HomePage() {
  const { t, locale } = useI18n();
  const { name, active } = useBooks();
  const cal = useCalendarClock();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [txs, setTxs] = useState<Tx[]>([]);
  const [charity, setCharity] = useState<CharityMonth | null>(null);
  const [claims, setClaims] = useState<Claim[]>([]);
  const [payingId, setPayingId] = useState("");
  const [payWalletId, setPayWalletId] = useState("");
  const [payAmounts, setPayAmounts] = useState<Record<string, string>>({});
  const [error, setError] = useState("");

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
      );
    } else {
      setCharity(null);
      setClaims([]);
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

  async function payClaim(claim: Claim) {
    if (!active || !cashId) return;
    const typed = Number(payAmounts[claim.id]);
    const amount = Number.isFinite(typed) ? typed : 0;
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
      const [s, a, tx, list] = await Promise.all([
        api<Summary>(householdPath(active.householdId, "/analytics/summary")),
        api<Account[]>(householdPath(active.householdId, "/accounts")),
        api<Tx[]>(householdPath(active.householdId, "/transactions")),
        api<Claim[]>(householdPath(active.householdId, "/claims")),
      ]);
      setSummary(s);
      setAccounts(a);
      setTxs(
        tx
          .filter((row) => !row.account || isCashAccount(row.account))
          .slice(0, 8),
      );
      setClaims(list);
      setPayAmounts((prev) => ({ ...prev, [claim.id]: "" }));
    } catch (e) {
      setError(e instanceof Error ? e.message : t("couldNotSave"));
    } finally {
      setPayingId("");
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
      {error ? <p className="mt-2 text-red-700">{error}</p> : null}

      <section
        className={`mt-3 rounded-[1.75rem] p-5 text-white shadow-lg ${
          isHouse
            ? "bg-gradient-to-br from-emerald-700 to-emerald-950"
            : "bg-gradient-to-br from-sky-700 to-sky-950"
        }`}
      >
        <p className={`text-base ${isHouse ? "text-emerald-100" : "text-sky-100"}`}>
          💵 {isHouse ? t("houseMoneyNow") : t("yourMoneyNow")}
        </p>
        <p className="mt-1 amount text-[clamp(1.4rem,7.2vw,2.25rem)] font-bold leading-tight">
          {accounts.length ? money(cashTotal, currency, locale) : "…"}
        </p>
        <div className="mt-4 grid grid-cols-1 gap-3 min-[380px]:grid-cols-2">
          <div className="rounded-2xl bg-white/15 px-3 py-2">
            <p className="text-sm opacity-90">💵 {t("currentWallet")}</p>
            <p className="amount text-xl font-semibold leading-tight">
              {accounts.length
                ? money(currentWallet?.balance ?? 0, currency, locale)
                : "…"}
            </p>
            <p className="mt-1 text-xs opacity-80">{t("currentHint")}</p>
          </div>
          <div className="rounded-2xl bg-white/15 px-3 py-2">
            <p className="text-sm opacity-90">💰 {t("savingsWallet")}</p>
            <p className="amount text-xl font-semibold leading-tight">
              {accounts.length
                ? money(savingsWallet?.balance ?? 0, currency, locale)
                : "…"}
            </p>
            <p className="mt-1 text-xs opacity-80">{t("savingsHint")}</p>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-1 gap-3 min-[380px]:grid-cols-2">
          <div className="rounded-2xl bg-white/15 px-3 py-2">
            <p className="text-sm opacity-90">📈 {t("monthIn")}</p>
            <p className="amount text-lg font-semibold leading-tight">
              {summary ? money(summary.monthIncome, currency, locale) : "…"}
            </p>
            <p className="mt-1 text-xs opacity-80">{t("monthInHint")}</p>
          </div>
          <div className="rounded-2xl bg-white/15 px-3 py-2">
            <p className="text-sm opacity-90">📉 {t("monthOut")}</p>
            <p className="amount text-lg font-semibold leading-tight">
              {summary ? money(summary.monthExpense, currency, locale) : "…"}
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

      {isHouse && summary ? (
        <div className="mt-4 space-y-2">
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
            {waitingClaims.map((c) => (
              <li key={c.id} className="rounded-2xl bg-amber-50 px-3 py-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold">{c.member.name}</p>
                    <p className="text-stone-600">
                      {labelFor(c.category.name, t)}
                      {c.note ? ` · ${c.note}` : ""}
                    </p>
                  </div>
                  <span className="amount shrink-0 text-lg font-bold">
                    {money(c.remaining, currency, locale)}
                  </span>
                </div>
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
                            ? `💰 ${t("savingsWallet")}`
                            : `💵 ${t("currentWallet")}`}
                        </button>
                      ))}
                    </div>
                    <input
                      inputMode="decimal"
                      className="w-full rounded-2xl border border-stone-300 bg-white px-4 py-3 text-2xl"
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
                      onClick={() => payClaim(c)}
                      className="flex min-h-12 w-full items-center justify-center rounded-2xl bg-emerald-800 font-semibold text-white disabled:opacity-60"
                    >
                      {payingId === c.id ? t("saving") : `💸 ${t("payFromHouseCash")}`}
                    </button>
                    <Hint>{t("payClaimHint")}</Hint>
                  </div>
                ) : null}
              </li>
            ))}
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
            <span className="font-semibold tabular-nums">
              {charity ? money(charity.familyTotal, currency, locale) : ""}
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
            href="/add?mode=give"
            className="flex min-h-16 items-center justify-center rounded-3xl bg-teal-800 text-lg font-semibold text-white"
          >
            💵 {t("giveFromHouse")}
          </Link>
          <Hint>{t("giveFromHouseHomeHint")}</Hint>
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
                <div className="flex min-w-0 items-center justify-between gap-3">
                  <span className="min-w-0 font-medium">{labelFor(tx.category.name, t)}</span>
                  <span
                    className={`amount shrink-0 font-semibold ${
                      tx.type === "INCOME" ? "text-emerald-800" : "text-red-800"
                    }`}
                  >
                    {tx.type === "INCOME" ? "+" : "−"}
                    {money(Number(tx.amount), currency, locale)}
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
