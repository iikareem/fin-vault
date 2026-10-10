"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api, money, parseAmount, todayISO } from "@/lib/api";
import { fill, labelFor, categoryLabel, personLabel } from "@/lib/i18n";
import { useCalendarClock } from "@/hooks/useCalendarClock";
import { BottomNav } from "@/components/BottomNav";
import { PageShell } from "@/components/PageShell";
import { useI18n } from "@/components/I18nProvider";
import { useBooks } from "@/components/BooksProvider";
import { householdPath } from "@/lib/space";
import { Hint } from "@/components/Hint";
import { Money } from "@/components/Money";
import { PrivateMoney } from "@/components/PrivateMoney";
import { ItemDate } from "@/components/ItemDate";
import { sortByOccurredOnDesc } from "@/lib/calendar";
import {
  isCashWallet,
  isCurrentWallet,
  isSavingsWallet,
  sortCashWallets,
} from "@/lib/wallets";
import { useMoneyVisible } from "@/hooks/useUiPrefs";
import {
  MonthSoftLimitCard,
  type MonthSoftLimitStatus,
} from "@/components/MonthSoftLimitCard";
import { MoneyToolsHomeCard } from "@/components/MoneyToolsHomeCard";
import {
  isLikelyOffline,
  isOfflineNetworkError,
  loadHomeSnapshot,
  saveAddSnapshot,
  saveHomeSnapshot,
} from "@/lib/offline-queue";
import { offlineAwareNavigate } from "@/lib/offline-nav";
import { formatItemDate, toDateKey } from "@/lib/calendar";

type Summary = {
  totalMoney: number;
  cashNow: number;
  broughtForward: number;
  savedThisMonth: number;
  monthIncome: number;
  monthExpense: number;
  softLimit?: MonthSoftLimitStatus | null;
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
type SubsHome = {
  unpaidCount: number;
  dueAmount: number;
  monthlyTotal: number;
  paidCount: number;
  subscriptions: {
    id: string;
    amount: number;
    dueOn: string;
    status: "paid" | "due" | "upcoming" | "overdue" | "scheduled";
  }[];
};

type Tx = {
  id: string;
  type: "INCOME" | "EXPENSE" | "REIMBURSEMENT" | "TRACK";
  amount: string | number;
  note: string;
  occurredOn?: string;
  category: { name: string; nameAr?: string | null };
  user: { name: string; nameAr?: string | null };
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
  member: { id: string; name: string; nameAr?: string | null };
  category: { name: string; nameAr?: string | null };
};
type Cover = {
  id: string;
  amount: number;
  remaining: number;
  repaid: number;
  status: string;
  note: string;
  occurredOn: string;
  member: { id: string; name: string; nameAr?: string | null };
  category: { name: string; nameAr?: string | null };
};

export default function HomePage() {
  const { t, locale } = useI18n();
  const {
    displayName,
    userId,
    active,
    personal,
    house,
    setKind,
    personalOnly,
    budgetMonthStartDay,
  } = useBooks();
  const personalStartDay =
    active?.kind === "PERSONAL" ? budgetMonthStartDay : 1;
  const cal = useCalendarClock(personalStartDay);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [personalAccounts, setPersonalAccounts] = useState<Account[]>([]);
  const [txs, setTxs] = useState<Tx[]>([]);
  const [charity, setCharity] = useState<CharityMonth | null>(null);
  const [subs, setSubs] = useState<SubsHome | null>(null);
  const [claims, setClaims] = useState<Claim[]>([]);
  const [covers, setCovers] = useState<Cover[]>([]);
  const [payingId, setPayingId] = useState("");
  const [repayingId, setRepayingId] = useState("");
  const [payWalletId, setPayWalletId] = useState("");
  const [repayWalletId, setRepayWalletId] = useState("");
  const [payAmounts, setPayAmounts] = useState<Record<string, string>>({});
  const [repayAmounts, setRepayAmounts] = useState<Record<string, string>>({});
  const [editId, setEditId] = useState("");
  const [editAmount, setEditAmount] = useState("");
  const [editNote, setEditNote] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState("");
  const [error, setError] = useState("");
  const [flash, setFlash] = useState("");
  const [offlineMode, setOfflineMode] = useState(false);
  const [busyEdit, setBusyEdit] = useState(false);
  const [personalMoneyVisible, setPersonalMoneyVisible] = useMoneyVisible();

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
    } else if (key === "transferSaved") {
      sessionStorage.removeItem("fb_flash");
      setFlash(t("transferSaved"));
    } else if (key === "cashWithdrawSaved") {
      sessionStorage.removeItem("fb_flash");
      setFlash(t("cashWithdrawSaved"));
    } else if (key === "savedOffline") {
      sessionStorage.removeItem("fb_flash");
      setFlash(t("savedOffline"));
    }
  }, [t]);

  useEffect(() => {
    if (!active) return;
    setError("");
    let cancelled = false;

    // Show last-known balances immediately (online refresh still runs below).
    void loadHomeSnapshot(active.householdId).then((snap) => {
      if (cancelled || !snap) return;
      if (isLikelyOffline()) setOfflineMode(true);
      setAccounts((snap.accounts as Account[]) ?? []);
      // Do not restore txs offline — avoids wrong "recent" / day-like data.
      if (!isLikelyOffline()) {
        setTxs((snap.txs as Tx[]) ?? []);
        if (snap.summary) setSummary(snap.summary as Summary);
      }
    });

    if (isLikelyOffline()) {
      setOfflineMode(true);
      return () => {
        cancelled = true;
      };
    }

    setOfflineMode(false);
    const month = cal.monthKey;
    const jobs: Promise<unknown>[] = [
      api<Summary>(householdPath(active.householdId, "/analytics/summary")),
      api<Account[]>(householdPath(active.householdId, "/accounts")),
      api<Tx[]>(householdPath(active.householdId, "/transactions")),
      api<{ id: string; name: string; nameAr?: string | null; kind: string }[]>(
        householdPath(active.householdId, "/categories"),
      ),
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
      jobs.push(
        api<SubsHome>(householdPath(active.householdId, "/subscriptions")),
      );
    }
    Promise.all(jobs)
      .then((result) => {
        if (cancelled) return;
        const nextSummary = result[0] as Summary;
        const nextAccounts = result[1] as Account[];
        const nextTxs = sortByOccurredOnDesc(
          (result[2] as Tx[]).filter(
            (tx) => !tx.account || isCashAccount(tx.account),
          ),
        ).slice(0, 8);
        const categories = result[3] as {
          id: string;
          name: string;
          nameAr?: string | null;
          kind: string;
        }[];
        setSummary(nextSummary);
        setAccounts(nextAccounts);
        setTxs(nextTxs);
        setOfflineMode(false);
        void saveHomeSnapshot({
          householdId: active.householdId,
          kind: active.kind,
          accounts: nextAccounts,
          txs: nextTxs,
          summary: nextSummary,
        });
        void saveAddSnapshot(
          active.householdId,
          sortCashWallets(nextAccounts.filter(isCashAccount)),
          categories,
        );
        if (active.kind === "HOUSE") {
          setCharity(result[4] as CharityMonth);
          setClaims(sortByOccurredOnDesc(result[5] as Claim[]));
          setCovers(sortByOccurredOnDesc(result[6] as Cover[]));
          setSubs(null);
        } else {
          setSubs(result[4] as SubsHome);
        }
      })
      .catch(async (e) => {
        if (cancelled) return;
        if (isOfflineNetworkError(e) || isLikelyOffline()) {
          setOfflineMode(true);
          setError("");
          setTxs([]);
          setSummary(null);
          setSubs(null);
          const snap = await loadHomeSnapshot(active.householdId);
          if (snap) {
            setAccounts((snap.accounts as Account[]) ?? []);
          }
          return;
        }
        setError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      cancelled = true;
    };
  }, [active?.householdId, active?.kind, cal.monthKey]);

  useEffect(() => {
    if (!personal?.householdId || active?.kind !== "HOUSE") {
      setPersonalAccounts([]);
      return;
    }
    api<Account[]>(householdPath(personal.householdId, "/accounts"))
      .then(setPersonalAccounts)
      .catch(() => setPersonalAccounts([]));
  }, [personal?.householdId, active?.kind]);

  const currency = active?.currency ?? "EGP";
  const isHouse = active?.kind === "HOUSE";
  const isAdmin = (isHouse ? active?.role : house?.role) === "ADMIN";
  const houseAdmin = house?.role === "ADMIN";
  /** Non-admins never see house cash totals on home. */
  const houseCashHidden = isHouse && !houseAdmin;
  /** Personal cash is masked until tapped. */
  const moneyVisible = isHouse ? !houseCashHidden : personalMoneyVisible;
  const cashAccounts = sortCashWallets(accounts.filter(isCashAccount));
  const currentWallet = cashAccounts.find(isCurrentWallet);
  const savingsWallet = cashAccounts.find(isSavingsWallet);
  const cashTotal = cashAccounts.reduce((s, a) => s + a.balance, 0);
  const currentBal = currentWallet?.balance ?? 0;
  const savingsBal = savingsWallet?.balance ?? 0;
  const suggestTransferToCurrent =
    !isHouse && savingsBal > 0.001 && currentBal < savingsBal * 0.35;
  const personalTransferHref = suggestTransferToCurrent
    ? "/add?mode=transfer&from=savings&to=current"
    : "/add?mode=transfer&from=current&to=savings";
  const cashId = payWalletId || currentWallet?.id || cashAccounts[0]?.id;
  const personalCashAccounts = sortCashWallets(
    personalAccounts.filter(isCashAccount),
  );
  const personalCashId =
    repayWalletId ||
    personalCashAccounts.find(isCurrentWallet)?.id ||
    personalCashAccounts[0]?.id;
  const waitingClaims = sortByOccurredOnDesc(
    claims.filter((c) => c.remaining > 0.001),
  );
  const waitingCovers = sortByOccurredOnDesc(
    covers.filter((c) => c.remaining > 0.001),
  );
  const pendingTotal =
    summary?.claimsPendingTotal ??
    waitingClaims.reduce((s, c) => s + c.remaining, 0);
  const pendingCount = summary?.claimsPendingCount ?? waitingClaims.length;
  const coverPendingTotal =
    summary?.coversPendingTotal ??
    waitingCovers.reduce((s, c) => s + c.remaining, 0);
  const coverPendingCount =
    summary?.coversPendingCount ?? waitingCovers.length;
  const peerIouCount =
    (summary && summary.youOwe > 0.001 ? 1 : 0) +
    (summary && summary.youAreOwed > 0.001 ? 1 : 0);
  const attentionCount =
    waitingClaims.length + waitingCovers.length + peerIouCount;
  const quietAdminHome = Boolean(isHouse && isAdmin);
  const hour = cal.now.getHours();
  const greetingKey =
    hour < 12
      ? "homeGreetingMorning"
      : hour < 17
        ? "homeGreetingAfternoon"
        : "homeGreetingEvening";
  const weekdayLabel = cal.now.toLocaleDateString(
    locale === "ar" ? "ar" : "en",
    { weekday: "long" },
  );
  const daysLeftShort =
    cal.remainingDays === 0
      ? t("homeLastDayShort")
      : cal.remainingDays === 1
        ? t("homeDaysLeftShortOne")
        : fill(t("homeDaysLeftShort"), { n: String(cal.remainingDays) });
  const avatarLetter = (displayName?.trim()?.[0] || "?").toUpperCase();
  const moveHint = suggestTransferToCurrent
    ? t("currentWallet")
    : t("savingsWallet");

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
      sortByOccurredOnDesc(
        tx.filter((row) => !row.account || isCashAccount(row.account)),
      ).slice(0, 8),
    );
    setClaims(list);
    setCovers(coverList);
  }

  async function payClaim(claim: Claim) {
    if (!active || !cashId) return;
    const amount = parseAmount(payAmounts[claim.id] ?? "");
    if (!Number.isFinite(amount) || amount <= 0) {
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

  async function repayCover(cover: Cover) {
    if (!active || !personalCashId) return;
    const amount = parseAmount(repayAmounts[cover.id] ?? "");
    if (!Number.isFinite(amount) || amount <= 0) {
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
            accountId: personalCashId,
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
      {isHouse ? (
        <>
          <p className="text-lg font-semibold text-[var(--foreground)]">
            👋{" "}
            {displayName ? t("helloName", { name: displayName }) : t("hello")}
          </p>
          <p className="mt-1 text-sm leading-relaxed text-[var(--muted)]">
            {t("homeHintHouse")}
          </p>
        </>
      ) : (
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-[1.35rem] font-bold leading-tight tracking-tight text-[var(--foreground)]">
              {displayName
                ? t(greetingKey, { name: displayName })
                : t("hello")}
            </h1>
            <p className="mt-1 text-sm text-[var(--muted)]">
              {fill(t("homeGreetingSub"), {
                day: weekdayLabel,
                left: daysLeftShort,
              })}
            </p>
          </div>
          <Link
            href="/profile"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[var(--accent-b-soft)] text-base font-semibold text-[var(--accent-b-text)] ring-1 ring-[var(--chrome-edge)] transition hover:opacity-90 active:scale-[0.98]"
            aria-label={t("navProfile")}
          >
            {avatarLetter}
          </Link>
        </div>
      )}
      {flash ? <p className="flash mt-3">{flash}</p> : null}
      {error ? <p className="mt-2 text-red-700">{error}</p> : null}
      {offlineMode ? (
        <section className="mt-3 rounded-[1.75rem] border border-[color-mix(in_srgb,var(--foreground)_12%,transparent)] bg-[color-mix(in_srgb,var(--foreground)_5%,transparent)] p-4">
          <p className="text-base font-semibold text-[var(--foreground)]">
            {t("offlineHomeTitle")}
          </p>
          <p className="mt-1 text-sm leading-relaxed text-[var(--muted)]">
            {t("offlineHomeBody")}
          </p>
          <Link
            href="/add?type=expense"
            onClick={(e) => offlineAwareNavigate("/add?type=expense", e)}
            className="mt-3 inline-flex min-h-12 w-full items-center justify-center rounded-2xl bg-emerald-800 px-3 text-sm font-semibold text-white"
          >
            {t("homeSpend")}
          </Link>
          <p className="mt-2 text-xs text-[var(--muted)]">
            {t("offlineHomeLastKnown")}
          </p>
        </section>
      ) : null}

      {!isHouse ? (
        <section
          className="mt-4 rounded-[1.75rem] p-5 shadow-lg"
          style={{ color: "#fff", background: "var(--wallet-b)" }}
        >
          <div className="flex items-start justify-between gap-3">
            <p className="text-sm font-medium opacity-90">{t("yourMoneyNow")}</p>
            <button
              type="button"
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition hover:opacity-95 active:scale-[0.98]"
              style={{ background: "rgba(255,255,255,0.22)" }}
              aria-label={
                moneyVisible ? t("tapToHideMoney") : t("tapToShowMoney")
              }
              aria-pressed={personalMoneyVisible}
              onClick={() => setPersonalMoneyVisible((v) => !v)}
            >
              {moneyVisible ? (
                <svg
                  viewBox="0 0 24 24"
                  className="h-5 w-5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden
                >
                  <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
              ) : (
                <svg
                  viewBox="0 0 24 24"
                  className="h-5 w-5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden
                >
                  <path d="M3 3l18 18" />
                  <path d="M10.6 10.6a3 3 0 0 0 4.2 4.2" />
                  <path d="M9.9 5.1A10.5 10.5 0 0 1 12 5c6.5 0 10 7 10 7a17.9 17.9 0 0 1-2.2 3.3" />
                  <path d="M6.1 6.1C3.9 7.7 2 12 2 12s3.5 7 10 7a10.4 10.4 0 0 0 4.3-.9" />
                </svg>
              )}
            </button>
          </div>
          <p className="mt-1 text-[clamp(1.6rem,7.5vw,2.35rem)] font-bold leading-tight tracking-tight">
            {accounts.length ? (
              <PrivateMoney
                amount={cashTotal}
                currency={currency}
                locale={locale}
                visible={moneyVisible}
              />
            ) : (
              "…"
            )}
          </p>
          <div className="mt-3.5 grid grid-cols-2 gap-2.5">
            <div
              className="rounded-2xl px-3 py-2.5"
              style={{ background: "rgba(255,255,255,0.18)" }}
            >
              <p className="text-xs opacity-90">{t("currentWallet")}</p>
              <p className="mt-0.5 text-lg font-semibold leading-tight">
                {accounts.length ? (
                  <PrivateMoney
                    amount={currentWallet?.balance ?? 0}
                    currency={currency}
                    locale={locale}
                    visible={moneyVisible}
                  />
                ) : (
                  "…"
                )}
              </p>
            </div>
            <div
              className="rounded-2xl px-3 py-2.5"
              style={{ background: "rgba(255,255,255,0.18)" }}
            >
              <p className="text-xs opacity-90">{t("savingsWallet")}</p>
              <p className="mt-0.5 text-lg font-semibold leading-tight">
                {accounts.length ? (
                  <PrivateMoney
                    amount={savingsWallet?.balance ?? 0}
                    currency={currency}
                    locale={locale}
                    visible={moneyVisible}
                  />
                ) : (
                  "…"
                )}
              </p>
            </div>
          </div>
          <Link
            href="/net"
            className="mt-3 flex min-h-11 items-center justify-between gap-3 rounded-2xl px-3 py-2.5 transition hover:opacity-95 active:scale-[0.99]"
            style={{ background: "rgba(255,255,255,0.14)" }}
          >
            <span className="min-w-0 text-start">
              <span className="block text-sm font-semibold leading-snug">
                {t("homeNetWorth")}
              </span>
              <span className="mt-0.5 block text-xs font-medium leading-snug opacity-80">
                {t("homeNetSeeFull")}
              </span>
            </span>
            <span className="shrink-0 text-base opacity-80" aria-hidden>
              →
            </span>
          </Link>
        </section>
      ) : (
        <section
          className="mt-3 rounded-[1.75rem] p-5 shadow-lg"
          style={{ color: "#fff", background: "var(--wallet-a)" }}
        >
          <div className="flex items-start justify-between gap-3">
            <p className="text-base" style={{ color: "#fff" }}>
              💵 {t("houseMoneyNow")}
            </p>
          </div>
          {houseCashHidden ? (
            <p className="mt-3 text-base opacity-90">{t("houseCashAdminOnly")}</p>
          ) : (
            <>
              <p className="mt-1 text-[clamp(1.4rem,7.2vw,2.25rem)] font-bold leading-tight">
                {accounts.length ? (
                  <PrivateMoney
                    amount={cashTotal}
                    currency={currency}
                    locale={locale}
                    visible={moneyVisible}
                  />
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
                      <PrivateMoney
                        amount={currentWallet?.balance ?? 0}
                        currency={currency}
                        locale={locale}
                        visible={moneyVisible}
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
                      <PrivateMoney
                        amount={savingsWallet?.balance ?? 0}
                        currency={currency}
                        locale={locale}
                        visible={moneyVisible}
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
                      <PrivateMoney
                        amount={summary.monthIncome}
                        currency={currency}
                        locale={locale}
                        visible={moneyVisible}
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
                      <PrivateMoney
                        amount={summary.monthExpense}
                        currency={currency}
                        locale={locale}
                        visible={moneyVisible}
                      />
                    ) : (
                      "…"
                    )}
                  </p>
                  <p className="mt-1 text-xs opacity-80">{t("monthOutHint")}</p>
                </div>
              </div>
            </>
          )}
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
      )}

      {!offlineMode && !isHouse && active ? (
        <div className="mt-4">
          <MonthSoftLimitCard
            householdId={active.householdId}
            currency={currency}
            moneyVisible={moneyVisible}
            loading={!summary}
            status={summary?.softLimit ?? null}
            variant="strip"
            onUpdated={(next) =>
              setSummary((prev) => (prev ? { ...prev, softLimit: next } : prev))
            }
          />
        </div>
      ) : null}

      {!offlineMode && !isHouse ? (
        <div className="mt-4 space-y-2.5">
          <Link
            href="/add?type=expense"
            className="flex min-h-14 items-center justify-between gap-3 rounded-[1.15rem] px-4 py-3.5 shadow-md transition hover:opacity-95 active:scale-[0.99]"
            style={{ background: "var(--accent-b)", color: "var(--accent-b-fg)" }}
          >
            <span className="min-w-0 text-start">
              <span className="block text-base font-semibold leading-snug">
                {t("homeSpend")}
              </span>
              <span className="mt-0.5 block text-xs font-medium leading-snug opacity-80">
                {t("homeSpendLogHint")}
              </span>
            </span>
            <span className="shrink-0 text-lg opacity-80" aria-hidden>
              →
            </span>
          </Link>
          <div className="grid grid-cols-2 gap-2.5">
            <Link
              href="/add?type=income"
              className="rounded-[1.15rem] bg-[var(--soft-emerald)] px-3.5 py-3.5 transition hover:opacity-95 active:scale-[0.99]"
            >
              <span className="block text-sm font-semibold text-[var(--accent-a-text)]">
                {t("homeIncome")}
              </span>
              <span className="mt-1 block text-[11px] font-medium leading-snug text-[var(--accent-a-text)] opacity-80">
                {t("homeIncomeAddHint")}
              </span>
            </Link>
            <Link
              href={personalTransferHref}
              className="rounded-[1.15rem] bg-[var(--soft-sky)] px-3.5 py-3.5 transition hover:opacity-95 active:scale-[0.99]"
            >
              <span className="block text-sm font-semibold text-[var(--accent-b-text)]">
                {t("homeMove")}
              </span>
              <span className="mt-1 block text-[11px] font-medium leading-snug text-[var(--accent-b-text)] opacity-80">
                {moveHint}
              </span>
            </Link>
          </div>
        </div>
      ) : null}

      {summary &&
      !offlineMode &&
      !personalOnly &&
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

      {isHouse && summary && !quietAdminHome ? (
        <div className="mt-4 space-y-2">
          {summary.claimsWaiting > 0.001 ? (
            <div className="banner-warn">
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
            <div className="banner-info">
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

      {quietAdminHome && attentionCount > 0 ? (
        <details className="group surface mt-4 overflow-hidden rounded-[1.75rem]">
          <summary className="cursor-pointer list-none px-4 py-3 marker:content-none [&::-webkit-details-marker]:hidden">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0 text-right">
                <p className="font-semibold text-stone-800">
                  {t("attentionTitle")}
                </p>
                <p className="mt-0.5 text-sm text-stone-500">
                  {attentionCount === 1
                    ? t("attentionSummaryOne")
                    : t("attentionSummary", { n: String(attentionCount) })}
                </p>
              </div>
              <span
                className="shrink-0 text-stone-400 transition-transform group-open:rotate-180"
                aria-hidden
              >
                ▾
              </span>
            </div>
          </summary>
          <div className="space-y-4 border-t border-stone-200 px-4 py-4">
            <p className="text-sm text-stone-500">{t("attentionHint")}</p>
            {pendingCount > 0 ? (
              <p className="text-sm text-stone-600">
                {pendingCount === 1
                  ? t("claimsAdminBannerOne", {
                      amount: money(pendingTotal, currency, locale),
                    })
                  : t("claimsAdminBanner", {
                      amount: money(pendingTotal, currency, locale),
                      n: String(pendingCount),
                    })}
              </p>
            ) : null}
            {coverPendingCount > 0 ? (
              <p className="text-sm text-stone-600">
                {coverPendingCount === 1
                  ? t("coversAdminBannerOne", {
                      amount: money(coverPendingTotal, currency, locale),
                    })
                  : t("coversAdminBanner", {
                      amount: money(coverPendingTotal, currency, locale),
                      n: String(coverPendingCount),
                    })}
              </p>
            ) : null}
            {summary && summary.claimsWaiting > 0.001 ? (
              <p className="text-sm text-stone-600">
                {t("houseOwesYou", {
                  amount: money(summary.claimsWaiting, currency, locale),
                })}
              </p>
            ) : null}
            {summary && (summary.coversWaiting ?? 0) > 0.001 ? (
              <p className="text-sm text-stone-600">
                {t("youOweHouse", {
                  amount: money(summary.coversWaiting ?? 0, currency, locale),
                })}
              </p>
            ) : null}
            {waitingClaims.length > 0 ? (
              <div>
                <h2 className="text-base font-semibold text-stone-800">
                  {t("peoplePaidTitle")}
                </h2>
                <ul className="mt-2 space-y-2">
                  {waitingClaims.map((c) => {
                    const mine = c.member.id === userId;
                    const canManage =
                      (mine || isAdmin) &&
                      c.reimbursed < 0.001 &&
                      c.remaining > 0.001;
                    return (
                      <li
                        key={c.id}
                        className="rounded-2xl bg-stone-50 px-3 py-3"
                      >
                        <div className="money-row">
                          <div className="min-w-0 text-right" dir="auto">
                            <p className="font-semibold">{personLabel(c.member, locale)}</p>
                            <p className="text-stone-600">
                              {categoryLabel(c.category, locale, t)}
                              {c.note ? ` · ${c.note}` : ""}
                            </p>
                            <p className="mt-1 text-sm text-stone-500">
                              {mine ? t("yourClaimWaiting") : t("waitingPayback")}
                            </p>
                            <ItemDate
                              value={c.occurredOn}
                              locale={locale}
                              className="mt-1"
                            />
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
                        <div className="mt-3 space-y-2">
                          <p className="text-sm text-stone-500">
                            {t("payFromWhich")}
                          </p>
                          <div className="seg grid-cols-2">
                            {cashAccounts.map((a) => (
                              <button
                                key={a.id}
                                type="button"
                                onClick={() => setPayWalletId(a.id)}
                                className={`seg-item ${
                                  (payWalletId || cashId) === a.id
                                    ? "seg-active"
                                    : ""
                                }`}
                                aria-pressed={(payWalletId || cashId) === a.id}
                              >
                                <span className="seg-ico" aria-hidden>
                                  {isSavingsWallet(a) ? "💰" : "💵"}
                                </span>
                                {isSavingsWallet(a)
                                  ? t("savingsWallet")
                                  : t("currentWallet")}
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
                            placeholder={t("payBackAmount")}
                          />
                          <button
                            type="button"
                            disabled={!!payingId || !cashId}
                            onClick={() => payClaim(c)}
                            className="flex min-h-12 w-full items-center justify-center rounded-2xl bg-emerald-800 font-semibold text-white disabled:opacity-60"
                          >
                            {payingId === c.id
                              ? t("saving")
                              : "💸 " + t("payFromHouseCash")}
                          </button>
                          <Hint>{t("payClaimHint")}</Hint>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ) : null}
            {waitingCovers.length > 0 ? (
              <div>
                <h2 className="text-base font-semibold text-stone-800">
                  {t("peopleCoveredTitle")}
                </h2>
                <ul className="mt-2 space-y-2">
                  {waitingCovers.map((c) => {
                    const mine = c.member.id === userId;
                    const canRepay = mine;
                    const canManage =
                      isAdmin && c.repaid < 0.001 && c.remaining > 0.001;
                    return (
                      <li
                        key={c.id}
                        className="rounded-2xl bg-stone-50 px-3 py-3"
                      >
                        <div className="money-row">
                          <div className="min-w-0 text-right" dir="auto">
                            <p className="font-semibold">{personLabel(c.member, locale)}</p>
                            <p className="text-stone-600">
                              {categoryLabel(c.category, locale, t)}
                              {c.note ? ` · ${c.note}` : ""}
                            </p>
                            <p className="mt-1 text-sm text-stone-500">
                              {mine
                                ? t("yourCoverWaiting")
                                : t("waitingOtherToPay")}
                            </p>
                            <ItemDate
                              value={c.occurredOn}
                              locale={locale}
                              className="mt-1"
                            />
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
                            <p className="text-sm text-stone-500">
                              {t("payFromWhich")}
                            </p>
                            <div className="seg grid-cols-2">
                              {personalCashAccounts.map((a) => (
                                <button
                                  key={a.id}
                                  type="button"
                                  onClick={() => setRepayWalletId(a.id)}
                                  className={`seg-item ${
                                    (repayWalletId || personalCashId) === a.id
                                      ? "seg-active"
                                      : ""
                                  }`}
                                  aria-pressed={
                                    (repayWalletId || personalCashId) === a.id
                                  }
                                >
                                  <span className="seg-ico" aria-hidden>
                                    {isSavingsWallet(a) ? "💰" : "💵"}
                                  </span>
                                  {isSavingsWallet(a)
                                    ? t("savingsWallet")
                                    : t("currentWallet")}
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
                              placeholder={t("payBackAmount")}
                            />
                            <button
                              type="button"
                              disabled={!!repayingId || !personalCashId}
                              onClick={() => repayCover(c)}
                              className="flex min-h-12 w-full items-center justify-center rounded-2xl bg-indigo-800 font-semibold text-white disabled:opacity-60"
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
              </div>
            ) : null}
            {summary &&
            (summary.youOwe > 0.001 || summary.youAreOwed > 0.001) ? (
              <div className="space-y-2">
                <p className="text-sm text-stone-500">{t("homeIouHint")}</p>
                {summary.youOwe > 0.001 ? (
                  <Link
                    href="/between"
                    className="block rounded-2xl bg-stone-50 px-4 py-3"
                  >
                    📤{" "}
                    {t("youOwe", {
                      amount: money(summary.youOwe, currency, locale),
                    })}
                  </Link>
                ) : null}
                {summary.youAreOwed > 0.001 ? (
                  <Link
                    href="/between"
                    className="block rounded-2xl bg-stone-50 px-4 py-3"
                  >
                    📥{" "}
                    {t("theyOweYou", {
                      amount: money(summary.youAreOwed, currency, locale),
                    })}
                  </Link>
                ) : null}
              </div>
            ) : null}
          </div>
        </details>
      ) : null}

      {!quietAdminHome && isHouse && waitingClaims.length > 0 ? (
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
                    <p className="font-semibold">{personLabel(c.member, locale)}</p>
                    <p className="text-stone-600">
                      {categoryLabel(c.category, locale, t)}
                      {c.note ? ` · ${c.note}` : ""}
                    </p>
                    <p className="mt-1 text-sm font-medium text-amber-900">
                      {mine ? t("yourClaimWaiting") : t("waitingPayback")}
                    </p>
                    <ItemDate
                      value={c.occurredOn}
                      locale={locale}
                      className="mt-1"
                    />
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
                    <div className="seg grid-cols-2">
                      {cashAccounts.map((a) => (
                        <button
                          key={a.id}
                          type="button"
                          onClick={() => setPayWalletId(a.id)}
                          className={`seg-item ${
                            (payWalletId || cashId) === a.id ? "seg-active" : ""
                          }`}
                          aria-pressed={(payWalletId || cashId) === a.id}
                        >
                          <span className="seg-ico" aria-hidden>
                            {isSavingsWallet(a) ? "💰" : "💵"}
                          </span>
                          {isSavingsWallet(a)
                            ? t("savingsWallet")
                            : t("currentWallet")}
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
                      placeholder={t("payBackAmount")}
                    />
                    <button
                      type="button"
                      disabled={!!payingId || !cashId}
                      onClick={() => payClaim(c)}
                      className="flex min-h-12 w-full items-center justify-center rounded-2xl bg-emerald-800 font-semibold text-white disabled:opacity-60"
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

      {!quietAdminHome && isHouse && waitingCovers.length > 0 ? (
        <section className="surface mt-5 rounded-[1.75rem] p-4">
          <h2 className="text-xl font-semibold">🏠 {t("peopleCoveredTitle")}</h2>
          <Hint>{t("housePaidForHint")}</Hint>
          <ul className="mt-3 space-y-3">
            {waitingCovers.map((c) => {
              const mine = c.member.id === userId;
              const canRepay = mine;
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
                      <p className="font-semibold">{personLabel(c.member, locale)}</p>
                      <p className="text-stone-600">
                        {categoryLabel(c.category, locale, t)}
                        {c.note ? ` · ${c.note}` : ""}
                      </p>
                      <p className="mt-1 text-sm font-medium text-indigo-900">
                        {mine ? t("yourCoverWaiting") : t("waitingOtherToPay")}
                      </p>
                      <ItemDate
                        value={c.occurredOn}
                        locale={locale}
                        className="mt-1"
                      />
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
                      <div className="seg grid-cols-2">
                        {personalCashAccounts.map((a) => (
                          <button
                            key={a.id}
                            type="button"
                            onClick={() => setRepayWalletId(a.id)}
                            className={`seg-item ${
                              (repayWalletId || personalCashId) === a.id
                                ? "seg-active"
                                : ""
                            }`}
                            aria-pressed={
                              (repayWalletId || personalCashId) === a.id
                            }
                          >
                            <span className="seg-ico" aria-hidden>
                              {isSavingsWallet(a) ? "💰" : "💵"}
                            </span>
                            {isSavingsWallet(a)
                              ? t("savingsWallet")
                              : t("currentWallet")}
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
                        placeholder={t("payBackAmount")}
                      />
                      <button
                        type="button"
                        disabled={!!repayingId || !personalCashId}
                        onClick={() => repayCover(c)}
                        className="flex min-h-12 w-full items-center justify-center rounded-2xl bg-indigo-800 font-semibold text-white disabled:opacity-60"
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

      {!offlineMode && isHouse ? (
        <Link
          href="/charity"
          className="surface mt-4 flex items-center justify-between rounded-[1.75rem] px-4 py-3"
        >
          <span className="font-semibold text-stone-800">
            🕌 {t("navCharity")}
          </span>
          <span className="font-semibold text-stone-700">
            {charity && !houseCashHidden ? (
              <Money
                amount={charity.familyTotal}
                currency={currency}
                locale={locale}
              />
            ) : charity && houseCashHidden ? (
              "••••"
            ) : (
              ""
            )}
          </span>
        </Link>
      ) : !offlineMode && active ? (
        <MoneyToolsHomeCard
          householdId={active.householdId}
          currency={currency}
          moneyVisible={moneyVisible}
          subs={subs}
        />
      ) : null}

      {!offlineMode && isHouse ? (
        <Link
          href="/with-house"
          className="mt-3 block text-center text-sm font-semibold text-stone-500"
        >
          🕒 {t("withHouseTitle")} →
        </Link>
      ) : null}

      {!offlineMode && isHouse && isAdmin ? (
        <div className="mt-5 grid grid-cols-1 gap-2">
          <Link
            href="/add"
            className="flex min-h-16 items-center justify-center rounded-3xl bg-stone-900 text-lg font-semibold text-white shadow-md transition hover:opacity-95"
          >
            🧾 {t("addHousePayment")}
          </Link>
          <Link
            href="/add?mode=cover"
            className="flex min-h-14 items-center justify-center rounded-3xl bg-indigo-800 text-lg font-semibold text-white shadow-md transition hover:opacity-95"
          >
            🏠 {t("housePaidForTitle")}
          </Link>
        </div>
      ) : !offlineMode && isHouse && !isAdmin ? (
        <>
          <Link
            href="/add"
            className="mt-5 flex min-h-16 items-center justify-center rounded-3xl bg-stone-900 text-lg font-semibold text-white shadow-md transition hover:opacity-95"
          >
            ➕ {t("addFromMyMoney")}
          </Link>
          <Hint>{t("addFromMyMoneyHomeHint")}</Hint>
        </>
      ) : null}

      {!offlineMode && txs.length > 0 ? (
        isHouse ? (
          <>
            <div className="mt-8 flex items-end justify-between gap-3">
              <div className="min-w-0">
                <h2 className="text-xl font-semibold">🕒 {t("latest")}</h2>
                <Hint>{t("latestHint")}</Hint>
              </div>
            </div>
            <ul className="mt-3 space-y-2">
              {txs.map((tx) => (
                <li key={tx.id} className="list-row text-[var(--foreground)]">
                  <div className="money-row min-w-0">
                    <div className="min-w-0 text-start" dir="auto">
                      <span className="font-medium">
                        {categoryLabel(tx.category, locale, t)}
                        {tx.type === "TRACK" ? (
                          <span className="ms-2 text-sm font-normal text-[var(--muted)]">
                            ({t("trackOnlyBadge")})
                          </span>
                        ) : null}
                      </span>
                      <ItemDate
                        value={tx.occurredOn}
                        locale={locale}
                        className="mt-1 block"
                      />
                    </div>
                    <span
                      className={`shrink-0 font-semibold ${
                        tx.type === "INCOME"
                          ? "text-emerald-800 dark:text-emerald-300"
                          : tx.type === "TRACK"
                            ? "text-[var(--muted)]"
                            : "text-red-800 dark:text-red-300"
                      }`}
                    >
                      <Money
                        amount={Number(tx.amount)}
                        currency={currency}
                        locale={locale}
                        extraSign={
                          tx.type === "INCOME"
                            ? "+"
                            : tx.type === "TRACK"
                              ? undefined
                              : "−"
                        }
                      />
                    </span>
                  </div>
                  {(() => {
                    const parts = [
                      tx.user.name !== "House"
                        ? personLabel(tx.user, locale)
                        : null,
                      tx.type === "TRACK"
                        ? null
                        : tx.account
                          ? labelFor(tx.account.name, t)
                          : null,
                      tx.note || null,
                    ].filter(Boolean);
                    if (parts.length === 0) return null;
                    return (
                      <p
                        className="mt-1 text-start text-sm text-[var(--muted)]"
                        dir="auto"
                      >
                        {parts.join(" · ")}
                      </p>
                    );
                  })()}
                </li>
              ))}
            </ul>
          </>
        ) : (
          <section className="mt-6">
            <div className="flex items-center justify-between gap-3 px-0.5">
              <h2 className="text-[15px] font-semibold text-[var(--foreground)]">
                {t("latest")}
              </h2>
              <Link
                href="/history"
                className="text-xs font-medium text-[var(--accent-b-text)]"
              >
                {t("latestSeeAll")}
              </Link>
            </div>
            <ul className="mt-2.5 space-y-2">
              {txs.map((tx) => {
                const isIn = tx.type === "INCOME";
                const isTrack = tx.type === "TRACK";
                const dayKey = toDateKey(tx.occurredOn);
                const dateLabel =
                  dayKey === cal.today
                    ? t("today")
                    : dayKey ===
                        toDateKey(
                          new Date(
                            cal.now.getFullYear(),
                            cal.now.getMonth(),
                            cal.now.getDate() - 1,
                          ),
                        )
                      ? t("yesterday")
                      : formatItemDate(tx.occurredOn, locale);
                const walletLabel =
                  !isTrack && tx.account
                    ? labelFor(tx.account.name, t)
                    : null;
                const meta = [dateLabel, walletLabel].filter(Boolean).join(" · ");
                return (
                  <li
                    key={tx.id}
                    className="flex items-center gap-3 rounded-2xl bg-[var(--surface-bg)] px-3.5 py-3 ring-1 ring-[var(--surface-border)]"
                  >
                    <span
                      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
                        isIn
                          ? "bg-[var(--soft-emerald)]"
                          : isTrack
                            ? "bg-[var(--panel-soft)]"
                            : "bg-[var(--soft-red)]"
                      }`}
                      aria-hidden
                    >
                      <span
                        className={`h-2 w-2 rounded-full ${
                          isIn
                            ? "bg-emerald-600"
                            : isTrack
                              ? "bg-[var(--muted)]"
                              : "bg-red-600"
                        }`}
                      />
                    </span>
                    <div className="min-w-0 flex-1 text-start" dir="auto">
                      <p className="truncate text-sm font-semibold text-[var(--foreground)]">
                        {categoryLabel(tx.category, locale, t)}
                        {isTrack ? (
                          <span className="ms-1.5 text-xs font-normal text-[var(--muted)]">
                            ({t("trackOnlyBadge")})
                          </span>
                        ) : null}
                      </p>
                      {meta ? (
                        <p className="mt-0.5 truncate text-xs text-[var(--muted)]">
                          {meta}
                        </p>
                      ) : null}
                    </div>
                    <span
                      className={`shrink-0 text-sm font-semibold tabular-nums ${
                        isIn
                          ? "text-emerald-800 dark:text-emerald-300"
                          : isTrack
                            ? "text-[var(--muted)]"
                            : "text-red-800 dark:text-red-300"
                      }`}
                    >
                      <PrivateMoney
                        amount={Number(tx.amount)}
                        currency={currency}
                        locale={locale}
                        visible={moneyVisible}
                        extraSign={
                          isIn ? "+" : isTrack ? undefined : "−"
                        }
                      />
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>
        )
      ) : null}
      <BottomNav />
    </PageShell>
  );
}
