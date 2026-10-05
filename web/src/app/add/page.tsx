"use client";

import { FormEvent, Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api, parseAmount, todayISO, yesterdayISO } from "@/lib/api";
import { BottomNav } from "@/components/BottomNav";
import { PageShell } from "@/components/PageShell";
import { useI18n } from "@/components/I18nProvider";
import { useBooks } from "@/components/BooksProvider";
import { householdPath, type Space } from "@/lib/space";
import { CategoryPicker } from "@/components/CategoryPicker";
import { DateField } from "@/components/DateField";
import { Money } from "@/components/Money";
import { ItemDate } from "@/components/ItemDate";
import {
  isCashWallet,
  isCurrentWallet,
  isSavingsWallet,
  sortCashWallets,
} from "@/lib/wallets";
import {
  HIDDEN_EXPENSE_CATEGORIES,
  HIDDEN_INCOME_CATEGORIES,
} from "@/lib/category-visibility";
import { categoryLabel, personLabel } from "@/lib/i18n";

type Account = { id: string; name: string; type?: string };
type Category = {
  id: string;
  name: string;
  nameAr?: string | null;
  kind: "EXPENSE" | "INCOME" | "PEER";
  parentId?: string | null;
  color?: string | null;
};
type Person = { id: string; name: string; nameAr?: string | null };
type WalletKind = "EXPENSE" | "INCOME" | "GIVE";

const RECENT_CATS_KEY = "fb_recent_cats";
const LAST_WALLET_KEY = "fb_last_wallet";

function recentCatsKey(householdId: string) {
  return `${RECENT_CATS_KEY}:${householdId}`;
}

function lastWalletKey(householdId: string) {
  return `${LAST_WALLET_KEY}:${householdId}`;
}

function readRecentCategoryIds(householdId: string): string[] {
  try {
    const raw = localStorage.getItem(recentCatsKey(householdId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((id): id is string => typeof id === "string")
      : [];
  } catch {
    return [];
  }
}

function pushRecentCategory(householdId: string, categoryId: string) {
  const prev = readRecentCategoryIds(householdId).filter(
    (id) => id !== categoryId,
  );
  const next = [categoryId, ...prev].slice(0, 5);
  localStorage.setItem(recentCatsKey(householdId), JSON.stringify(next));
}

function readLastWalletId(householdId: string): string | null {
  try {
    return localStorage.getItem(lastWalletKey(householdId));
  } catch {
    return null;
  }
}

function writeLastWalletId(householdId: string, accountId: string) {
  localStorage.setItem(lastWalletKey(householdId), accountId);
}

function AddForm() {
  const router = useRouter();
  const search = useSearchParams();
  const { t, locale } = useI18n();
  const { active, preferredCurrency } = useBooks();
  const [space, setSpace] = useState<Space | null>(null);
  const [mode, setMode] = useState<
    "wallet" | "claim" | "cover" | "transfer" | "withdraw"
  >("wallet");
  const [type, setType] = useState<WalletKind>("EXPENSE");
  const [amount, setAmount] = useState("");
  const [currentAmt, setCurrentAmt] = useState("");
  const [savingsAmt, setSavingsAmt] = useState("");
  const [accountId, setAccountId] = useState("");
  const [toAccountId, setToAccountId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [toUserId, setToUserId] = useState("");
  const [occurredOn, setOccurredOn] = useState(todayISO());
  const [note, setNote] = useState("");
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [recentCategoryIds, setRecentCategoryIds] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [trackOnly, setTrackOnly] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const houseAdmin = space?.kind === "HOUSE" && space.role === "ADMIN";
  const personalBooks = space?.kind === "PERSONAL";
  const giveMode = mode === "wallet" && type === "GIVE";
  const coverMode = mode === "cover";
  const claimMode = mode === "claim";
  const transferMode = mode === "transfer";
  const withdrawMode = mode === "withdraw";
  const personalPaid =
    personalBooks && mode === "wallet" && type === "EXPENSE";

  useEffect(() => {
    if (!active) return;
    setSpace(active);
    const isHouseMember = active.kind === "HOUSE" && active.role === "MEMBER";
    const wantClaim = search.get("mode") === "claim";
    const wantCover = search.get("mode") === "cover";
    const wantTransfer = search.get("mode") === "transfer";
    const wantWithdraw = search.get("mode") === "withdraw";
    const wantType = (search.get("type") || "").toLowerCase();
    if (isHouseMember || wantClaim) {
      setMode("claim");
      setType("EXPENSE");
    } else if (wantCover && active.role === "ADMIN") {
      setMode("cover");
      setType("EXPENSE");
    } else if (wantTransfer && active.kind === "PERSONAL") {
      setMode("transfer");
      setType("EXPENSE");
    } else if (wantWithdraw && active.kind === "PERSONAL") {
      setMode("withdraw");
      setType("EXPENSE");
    } else {
      setMode("wallet");
      if (search.get("mode") === "give" && !isHouseMember) setType("GIVE");
      else if (wantType === "income" || wantType === "salary") setType("INCOME");
      else if (wantType === "expense" || wantType === "spend") setType("EXPENSE");
      else setType("EXPENSE");
    }
    const jobs: Promise<unknown>[] = [
      api<Account[]>(householdPath(active.householdId, "/accounts")),
      api<Category[]>(householdPath(active.householdId, "/categories")),
    ];
    if (active.kind === "HOUSE") {
      jobs.push(api<Person[]>(householdPath(active.householdId, "/users")));
    }
    Promise.all(jobs)
      .then((result) => {
        const a = sortCashWallets(
          (result[0] as Account[]).filter(isCashWallet),
        );
        const c = result[1] as Category[];
        setAccounts(a);
        setCategories(c);
        const remembered =
          active.kind === "PERSONAL"
            ? readLastWalletId(active.householdId)
            : null;
        const rememberedAccount = remembered
          ? a.find((x) => x.id === remembered)
          : null;
        const current = a.find(isCurrentWallet) ?? a[0];
        const savings = a.find(isSavingsWallet);
        const walletByKey = (key: string | null) => {
          if (key === "savings") return savings ?? null;
          if (key === "current") return current ?? null;
          return null;
        };
        const fromWanted = walletByKey(search.get("from"));
        const toWanted = walletByKey(search.get("to"));
        if (wantTransfer && active.kind === "PERSONAL") {
          const fromAcc: Account | undefined =
            fromWanted ?? current ?? a[0];
          let toAcc: Account | null =
            toWanted ?? savings ?? a[1] ?? null;
          if (toAcc && fromAcc && toAcc.id === fromAcc.id) {
            toAcc = a.find((x) => x.id !== fromAcc.id) ?? null;
          }
          if (fromAcc) setAccountId(fromAcc.id);
          if (toAcc) setToAccountId(toAcc.id);
        } else {
          if (rememberedAccount) setAccountId(rememberedAccount.id);
          else if (current) setAccountId(current.id);
          if (savings) setToAccountId(savings.id);
          else if (a[1]) setToAccountId(a[1].id);
        }
        if (active.kind === "PERSONAL") {
          setRecentCategoryIds(readRecentCategoryIds(active.householdId));
        } else {
          setRecentCategoryIds([]);
        }
        if (active.kind === "HOUSE") {
          const users = result[2] as Person[];
          setPeople(users);
          if (users[0]) setToUserId(users[0].id);
        }
      })
      .catch((e) => setError(e.message));
  }, [active?.householdId, active?.kind, active?.role, search]);

  const expenseCats = useMemo(
    () =>
      categories.filter(
        (c) => c.kind === "EXPENSE" && !HIDDEN_EXPENSE_CATEGORIES.has(c.name),
      ),
    [categories],
  );
  const walletCats = useMemo(
    () =>
      categories.filter(
        (c) =>
          c.kind === type &&
          !(type === "EXPENSE" && HIDDEN_EXPENSE_CATEGORIES.has(c.name)) &&
          !(type === "INCOME" && HIDDEN_INCOME_CATEGORIES.has(c.name)),
      ),
    [categories, type],
  );

  const recentCats = useMemo(() => {
    const list =
      mode === "claim" || mode === "cover" ? expenseCats : walletCats;
    const byId = new Map(list.map((c) => [c.id, c]));
    return recentCategoryIds
      .map((id) => byId.get(id))
      .filter((c): c is Category => Boolean(c))
      .slice(0, 5);
  }, [recentCategoryIds, expenseCats, walletCats, mode]);

  useEffect(() => {
    if (transferMode || withdrawMode) return;
    const list =
      mode === "claim" || mode === "cover" ? expenseCats : walletCats;
    if (!list.length) return;
    const recentPick = recentCategoryIds
      .map((id) => list.find((c) => c.id === id))
      .find(Boolean);
    const preferred =
      type === "INCOME" && mode === "wallet"
        ? "Salary"
        : personalBooks
          ? "Dining & cafés"
          : "Home food";
    const pick =
      recentPick ??
      list.find((c) => c.name === preferred) ??
      list.find((c) => c.name === "Consumables") ??
      list[0];
    if (pick) setCategoryId(pick.id);
  }, [
    mode,
    type,
    expenseCats,
    walletCats,
    transferMode,
    withdrawMode,
    personalBooks,
    recentCategoryIds,
  ]);

  function validateBeforeSave(): boolean {
    setError("");
    if (transferMode) {
      const value = parseAmount(amount);
      if (!accountId || !toAccountId || !(value > 0)) {
        setError(t("amountHint"));
        return false;
      }
      return true;
    }
    if (withdrawMode) {
      if (!(parseAmount(amount) > 0)) {
        setError(t("amountHint"));
        return false;
      }
      return true;
    }
    if (type === "INCOME" && !claimMode && !coverMode) {
      const intoCurrent = parseAmount(currentAmt);
      const intoSavings = parseAmount(savingsAmt);
      if (intoCurrent <= 0 && intoSavings <= 0) {
        setError(t("amountHint"));
        return false;
      }
      return true;
    }
    if (!(parseAmount(amount) > 0)) {
      setError(t("amountHint"));
      return false;
    }
    return true;
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!space) return;
    if (!validateBeforeSave()) return;
    setConfirmOpen(true);
  }

  async function confirmSave() {
    if (!space) return;
    setBusy(true);
    setError("");
    try {
      if (transferMode) {
        const value = parseAmount(amount);
        await api(householdPath(space.householdId, "/accounts/transfer"), {
          method: "POST",
          body: JSON.stringify({
            fromAccountId: accountId,
            toAccountId: toAccountId,
            amount: value,
            occurredOn,
            note,
          }),
        });
        if (typeof window !== "undefined") {
          sessionStorage.setItem("fb_flash", "transferSaved");
        }
      } else if (withdrawMode) {
        const value = parseAmount(amount);
        await api(
          householdPath(space.householdId, "/accounts/cash-withdraw"),
          {
            method: "POST",
            body: JSON.stringify({
              amount: value,
              occurredOn,
              note,
            }),
          },
        );
        if (typeof window !== "undefined") {
          sessionStorage.setItem("fb_flash", "cashWithdrawSaved");
        }
      } else if (mode === "claim") {
        await api(householdPath(space.householdId, "/claims"), {
          method: "POST",
          body: JSON.stringify({
            categoryId,
            amount: parseAmount(amount),
            occurredOn,
            note,
          }),
        });
        if (typeof window !== "undefined") {
          sessionStorage.setItem("fb_flash", "claimSaved");
        }
      } else if (mode === "cover") {
        await api(householdPath(space.householdId, "/covers"), {
          method: "POST",
          body: JSON.stringify({
            toUserId,
            categoryId,
            accountId,
            amount: parseAmount(amount),
            occurredOn,
            note,
          }),
        });
        if (typeof window !== "undefined") {
          sessionStorage.setItem("fb_flash", "housePaidForSaved");
        }
      } else if (type === "GIVE") {
        await api(householdPath(space.householdId, "/payouts"), {
          method: "POST",
          body: JSON.stringify({
            toUserId,
            accountId,
            amount: parseAmount(amount),
            occurredOn,
            note,
            kind: "Allowance",
          }),
        });
      } else if (type === "INCOME") {
        const current = accounts.find(isCurrentWallet);
        const savings = accounts.find(isSavingsWallet);
        const intoCurrent = parseAmount(currentAmt);
        const intoSavings = parseAmount(savingsAmt);
        const jobs: Promise<unknown>[] = [];
        if (current && intoCurrent > 0) {
          jobs.push(
            api(householdPath(space.householdId, "/transactions"), {
              method: "POST",
              body: JSON.stringify({
                type: "INCOME",
                amount: intoCurrent,
                accountId: current.id,
                categoryId,
                occurredOn,
                note,
              }),
            }),
          );
        }
        if (savings && intoSavings > 0) {
          jobs.push(
            api(householdPath(space.householdId, "/transactions"), {
              method: "POST",
              body: JSON.stringify({
                type: "INCOME",
                amount: intoSavings,
                accountId: savings.id,
                categoryId,
                occurredOn,
                note,
              }),
            }),
          );
        }
        if (jobs.length === 0) {
          setError(t("amountHint"));
          setBusy(false);
          return;
        }
        await Promise.all(jobs);
        if (personalBooks && typeof window !== "undefined") {
          pushRecentCategory(space.householdId, categoryId);
        }
      } else {
        await api(householdPath(space.householdId, "/transactions"), {
          method: "POST",
          body: JSON.stringify({
            type: personalPaid && trackOnly ? "TRACK" : type,
            amount: parseAmount(amount),
            ...(personalPaid && trackOnly ? {} : { accountId }),
            categoryId,
            occurredOn,
            note,
          }),
        });
        if (personalBooks && typeof window !== "undefined") {
          pushRecentCategory(space.householdId, categoryId);
          if (!(personalPaid && trackOnly) && accountId) {
            writeLastWalletId(space.householdId, accountId);
          }
        }
      }
      setConfirmOpen(false);
      router.replace("/");
    } catch {
      setError(t("couldNotSave"));
    } finally {
      setBusy(false);
    }
  }

  const today = todayISO();
  const yesterday = yesterdayISO();
  const currentWallet = accounts.find(isCurrentWallet);
  const savingsWallet = accounts.find(isSavingsWallet);
  const paidFromCurrent =
    personalPaid && !trackOnly && !!currentWallet && accountId === currentWallet.id;
  const paidFromSavings =
    personalPaid && !trackOnly && !!savingsWallet && accountId === savingsWallet.id;
  const modeHint = withdrawMode
    ? t("cashWithdrawHint")
    : transferMode
      ? t("transferWalletsHint")
      : coverMode
        ? t("housePaidForHint")
        : claimMode
          ? t("paidFromMyMoneyHint")
          : type === "GIVE"
            ? t("giveFromHouseHint")
            : type === "INCOME"
              ? t("moneyInHint")
              : personalPaid && trackOnly
                ? t("spendTrackOnlyHint")
                : personalPaid && paidFromSavings
                  ? t("spendFromSavingsHint")
                  : personalPaid && paidFromCurrent
                    ? t("currentHint")
                    : t("paidHint");

  function setPaidFrom(source: "current" | "savings" | "track") {
    if (source === "track") {
      setTrackOnly(true);
      return;
    }
    setTrackOnly(false);
    const wallet = source === "savings" ? savingsWallet : currentWallet;
    if (!wallet) return;
    setAccountId(wallet.id);
    if (space) writeLastWalletId(space.householdId, wallet.id);
  }

  /** Leave track-only; restore Savings if that wallet was still selected underneath. */
  function setDeductFromWallet() {
    if (!trackOnly && (paidFromCurrent || paidFromSavings)) return;
    const preferSavings =
      !!savingsWallet && accountId === savingsWallet.id;
    setPaidFrom(preferSavings ? "savings" : "current");
  }

  function walletBtn(active: boolean) {
    return `seg-item px-3 ${active ? "seg-active" : "ring-1 ring-[var(--input-border)]"}`;
  }

  const modeChip = (active: boolean) =>
    `chip shrink-0 whitespace-nowrap ${active ? "chip-active" : ""}`;

  const selectedCategory = categories.find((c) => c.id === categoryId);
  const selectedPerson = people.find((p) => p.id === toUserId);
  const fromWallet = accounts.find((a) => a.id === accountId);
  const toWallet = accounts.find((a) => a.id === toAccountId);
  const intoCurrent = parseAmount(currentAmt);
  const intoSavings = parseAmount(savingsAmt);
  const confirmAmount = transferMode || withdrawMode || type !== "INCOME" || claimMode || coverMode
    ? parseAmount(amount)
    : intoCurrent + intoSavings;
  const showWalletHighlight =
    personalPaid ||
    (!claimMode &&
      !transferMode &&
      !withdrawMode &&
      type !== "INCOME" &&
      !!fromWallet) ||
    coverMode ||
    giveMode;
  const walletTone = personalPaid && trackOnly
    ? "track"
    : fromWallet && isSavingsWallet(fromWallet)
      ? "savings"
      : fromWallet && isCurrentWallet(fromWallet)
        ? "current"
        : "muted";
  const walletToneClass =
    walletTone === "savings"
      ? "bg-amber-100 text-amber-950 ring-amber-300/80 dark:bg-amber-950/40 dark:text-amber-100 dark:ring-amber-700/60"
      : walletTone === "current"
        ? "bg-emerald-100 text-emerald-950 ring-emerald-300/80 dark:bg-emerald-950/40 dark:text-emerald-100 dark:ring-emerald-700/60"
        : walletTone === "track"
          ? "bg-stone-100 text-stone-800 ring-stone-300/80 dark:bg-stone-800/60 dark:text-stone-100 dark:ring-stone-600/60"
          : "bg-[var(--panel-soft)] text-[var(--foreground)] ring-[var(--input-border)]";

  return (
    <PageShell>
      <h1 className="text-lg font-semibold">➕ {t("navAdd")}</h1>
      <p className="mt-1 text-sm text-[var(--muted)]">{t("whatHappened")}</p>

      {houseAdmin ? (
        <div className="mt-3 -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
          <button
            type="button"
            onClick={() => {
              setMode("wallet");
              setType("EXPENSE");
              setTrackOnly(false);
            }}
            className={modeChip(!claimMode && !coverMode && type === "EXPENSE")}
          >
            🧾 {t("paid")}
          </button>
          <button
            type="button"
            onClick={() => {
              setMode("wallet");
              setType("INCOME");
              setTrackOnly(false);
            }}
            className={modeChip(!claimMode && !coverMode && type === "INCOME")}
          >
            📈 {t("moneyIn")}
          </button>
          <button
            type="button"
            onClick={() => {
              setMode("wallet");
              setType("GIVE");
              setTrackOnly(false);
            }}
            className={modeChip(!claimMode && !coverMode && type === "GIVE")}
          >
            💵 {t("giveFromHouse")}
          </button>
          <button
            type="button"
            onClick={() => {
              setMode("cover");
              setTrackOnly(false);
            }}
            className={modeChip(coverMode)}
          >
            🏠 {t("housePaidForTitle")}
          </button>
          <button
            type="button"
            onClick={() => {
              setMode("claim");
              setTrackOnly(false);
            }}
            className={modeChip(claimMode)}
          >
            👛 {t("paidFromMyMoneyTitle")}
          </button>
        </div>
      ) : claimMode ? null : (
        <div className="mt-3 -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
          <button
            type="button"
            onClick={() => {
              setMode("wallet");
              setType("EXPENSE");
            }}
            className={modeChip(
              !transferMode && !withdrawMode && type === "EXPENSE",
            )}
          >
            🧾 {t("paid")}
          </button>
          <button
            type="button"
            onClick={() => {
              setMode("wallet");
              setType("INCOME");
              setTrackOnly(false);
            }}
            className={modeChip(
              !transferMode && !withdrawMode && type === "INCOME",
            )}
          >
            📈 {t("moneyIn")}
          </button>
          {personalBooks ? (
            <>
              <button
                type="button"
                onClick={() => {
                  setMode("transfer");
                  setTrackOnly(false);
                }}
                className={modeChip(transferMode)}
              >
                🔁 {t("transferWallets")}
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode("withdraw");
                  setTrackOnly(false);
                }}
                className={modeChip(withdrawMode)}
              >
                💵 {t("cashWithdraw")}
              </button>
            </>
          ) : null}
        </div>
      )}
      <p className="mt-2 text-sm leading-snug text-[var(--muted)]">{modeHint}</p>

      <form onSubmit={onSubmit} className="mt-4 space-y-3.5">
        {transferMode ? (
          <section className="surface space-y-3 rounded-[1.5rem] p-3.5">
            <div>
              <p className="mb-1.5 text-xs font-medium text-[var(--muted)]">
                {t("transferFrom")}
              </p>
              <div className="grid grid-cols-2 gap-2">
                {accounts.map((a) => (
                  <button
                    key={`from-${a.id}`}
                    type="button"
                    onClick={() => {
                      setAccountId(a.id);
                      if (a.id === toAccountId) {
                        const other = accounts.find((x) => x.id !== a.id);
                        if (other) setToAccountId(other.id);
                      }
                    }}
                    className={walletBtn(accountId === a.id)}
                  >
                    {isSavingsWallet(a)
                      ? "💰 " + t("savingsWallet")
                      : "💵 " + t("currentWallet")}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <p className="mb-1.5 text-xs font-medium text-[var(--muted)]">
                {t("transferTo")}
              </p>
              <div className="grid grid-cols-2 gap-2">
                {accounts.map((a) => (
                  <button
                    key={`to-${a.id}`}
                    type="button"
                    onClick={() => {
                      setToAccountId(a.id);
                      if (a.id === accountId) {
                        const other = accounts.find((x) => x.id !== a.id);
                        if (other) setAccountId(other.id);
                      }
                    }}
                    className={walletBtn(toAccountId === a.id)}
                  >
                    {isSavingsWallet(a)
                      ? "💰 " + t("savingsWallet")
                      : "💵 " + t("currentWallet")}
                  </button>
                ))}
              </div>
            </div>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-[var(--muted)]">
                {t("amount")}
              </span>
              <input
                inputMode="decimal"
                dir="ltr"
                className="amount-input field text-3xl font-bold"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder={t("payBackAmount")}
                required
              />
            </label>
          </section>
        ) : null}

        {withdrawMode ? (
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-[var(--muted)]">
              {t("amount")}
            </span>
            <input
              inputMode="decimal"
              dir="ltr"
              className="amount-input field text-3xl font-bold"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0"
              required
            />
          </label>
        ) : null}

        {!transferMode && !withdrawMode && (giveMode || coverMode) ? (
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-[var(--muted)]">
              {t("giveTo")}
            </span>
            <select
              className="field text-base"
              value={toUserId}
              onChange={(e) => setToUserId(e.target.value)}
              required
            >
              {people.map((p) => (
                <option key={p.id} value={p.id}>
                  {personLabel(p, locale)}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        {!transferMode &&
        !withdrawMode &&
        (claimMode || coverMode || type !== "INCOME") ? (
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-[var(--muted)]">
              {t("amount")}
            </span>
            <input
              inputMode="decimal"
              dir="ltr"
              className="amount-input field text-3xl font-bold"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0"
              required
              autoFocus
            />
          </label>
        ) : null}

        {personalPaid ? (
          <div className="space-y-3">
            <div>
              <p className="mb-1.5 text-xs font-medium text-[var(--muted)]">
                {t("spendHowLabel")}
              </p>
              <div className="seg grid-cols-2">
                <button
                  type="button"
                  onClick={setDeductFromWallet}
                  className={`seg-item ${!trackOnly ? "seg-active" : ""}`}
                  aria-pressed={!trackOnly}
                >
                  <span className="seg-ico" aria-hidden>
                    👛
                  </span>
                  {t("spendDeduct")}
                </button>
                <button
                  type="button"
                  onClick={() => setPaidFrom("track")}
                  className={`seg-item ${trackOnly ? "seg-active" : ""}`}
                  aria-pressed={!!trackOnly}
                >
                  <span className="seg-ico" aria-hidden>
                    📋
                  </span>
                  {t("spendTrackOnly")}
                </button>
              </div>
            </div>
            {!trackOnly ? (
              <div>
                <p className="mb-1.5 text-xs font-medium text-[var(--muted)]">
                  {t("pickWalletSpend")}
                </p>
                <div className="seg grid-cols-2">
                  <button
                    type="button"
                    onClick={() => setPaidFrom("current")}
                    className={`seg-item ${paidFromCurrent ? "seg-active" : ""}`}
                    aria-pressed={paidFromCurrent}
                  >
                    <span className="seg-ico" aria-hidden>
                      💵
                    </span>
                    {t("currentWallet")}
                  </button>
                  <button
                    type="button"
                    onClick={() => setPaidFrom("savings")}
                    className={`seg-item ${paidFromSavings ? "seg-active" : ""}`}
                    aria-pressed={paidFromSavings}
                  >
                    <span className="seg-ico" aria-hidden>
                      💰
                    </span>
                    {t("savingsWallet")}
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        ) : null}

        {!transferMode &&
        !withdrawMode &&
        !claimMode &&
        !coverMode &&
        type === "INCOME" ? (
          <section className="surface space-y-3 rounded-[1.5rem] p-3.5">
            <p className="text-xs font-medium text-[var(--muted)]">
              {t("splitIncomeHint")}
            </p>
            <label className="block">
              <span className="mb-1 block text-sm font-semibold">
                💵 {t("incomeToCurrent")}
              </span>
              <input
                inputMode="decimal"
                dir="ltr"
                className="amount-input field text-2xl font-bold"
                value={currentAmt}
                onChange={(e) => setCurrentAmt(e.target.value)}
                placeholder="0"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-semibold">
                💰 {t("incomeToSavings")}
              </span>
              <input
                inputMode="decimal"
                dir="ltr"
                className="amount-input field text-2xl font-bold"
                value={savingsAmt}
                onChange={(e) => setSavingsAmt(e.target.value)}
                placeholder="0"
              />
            </label>
          </section>
        ) : null}

        {!transferMode && !withdrawMode && !giveMode ? (
          <div className="space-y-2.5">
            {recentCats.length > 0 ? (
              <div>
                <p className="mb-1.5 text-xs font-medium text-[var(--muted)]">
                  {t("addRecentCategories")}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {recentCats.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setCategoryId(c.id)}
                      className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                        categoryId === c.id
                          ? "bg-emerald-800 text-white shadow"
                          : "bg-[var(--panel-soft)] text-[var(--foreground)] ring-1 ring-[var(--input-border)]"
                      }`}
                    >
                      {categoryLabel(c, locale, t)}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
            <CategoryPicker
              categories={claimMode || coverMode ? expenseCats : walletCats}
              value={categoryId}
              onChange={setCategoryId}
            />
          </div>
        ) : null}

        {!transferMode &&
        !withdrawMode &&
        !personalPaid &&
        !(claimMode || (!coverMode && type === "INCOME")) ? (
          <div>
            <p className="mb-1.5 text-xs font-medium text-[var(--muted)]">
              {t("pickWalletSpend")}
            </p>
            <div className="seg grid-cols-2">
              {accounts.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => {
                    setAccountId(a.id);
                    if (personalBooks && space) {
                      writeLastWalletId(space.householdId, a.id);
                    }
                  }}
                  className={`seg-item ${accountId === a.id ? "seg-active" : ""}`}
                  aria-pressed={accountId === a.id}
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
          </div>
        ) : null}

        <div className="surface rounded-[1.5rem] p-3.5">
          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={() => setOccurredOn(today)}
              className={`chip flex-1 ${occurredOn === today ? "chip-active" : ""}`}
            >
              {t("today")}
            </button>
            <button
              type="button"
              onClick={() => setOccurredOn(yesterday)}
              className={`chip flex-1 ${
                occurredOn === yesterday ? "chip-active" : ""
              }`}
            >
              {t("yesterday")}
            </button>
          </div>
          <DateField className="mt-2" value={occurredOn} onChange={setOccurredOn} />
        </div>

        <label className="block">
          <span className="mb-1 block text-xs font-medium text-[var(--muted)]">
            {t("noteOptional")}
          </span>
          <input
            className="field text-base"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={t("notePlaceholder")}
          />
        </label>

        {error ? <p className="text-sm text-red-700">{error}</p> : null}

        <button
          disabled={busy}
          className="w-full rounded-3xl bg-emerald-800 px-4 py-3.5 text-base font-semibold text-white disabled:opacity-60"
        >
          {busy ? t("saving") : `✅ ${t("save")}`}
        </button>
      </form>

      {confirmOpen ? (
        <div
          className="fixed inset-0 z-[60] flex items-end justify-center bg-black/45 p-3 sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-labelledby="add-confirm-title"
          onClick={() => {
            if (!busy) setConfirmOpen(false);
          }}
        >
          <div
            className="surface w-full max-w-md overflow-hidden rounded-[1.75rem] shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="border-b border-[var(--surface-border)] px-4 py-3.5">
              <p
                id="add-confirm-title"
                className="text-base font-semibold text-[var(--foreground)]"
              >
                {t("addConfirmTitle")}
              </p>
              <p className="mt-0.5 text-xs leading-snug text-[var(--muted)]">
                {t("addConfirmHint")}
              </p>
            </div>

            <div className="space-y-3 px-4 py-4">
              <div className="text-center">
                <p className="text-xs font-medium text-[var(--muted)]">
                  {t("amount")}
                </p>
                <p className="mt-1 text-3xl font-bold tabular-nums text-[var(--foreground)]">
                  <Money
                    amount={confirmAmount}
                    currency={preferredCurrency}
                    locale={locale}
                  />
                </p>
              </div>

              {type === "INCOME" &&
              !claimMode &&
              !coverMode &&
              !transferMode &&
              !withdrawMode ? (
                <div className="grid grid-cols-2 gap-2">
                  {intoCurrent > 0 ? (
                    <div className="rounded-2xl bg-emerald-100 px-3 py-2.5 ring-1 ring-emerald-300/80 dark:bg-emerald-950/40 dark:ring-emerald-700/60">
                      <p className="text-[11px] font-medium text-emerald-900/70 dark:text-emerald-200/70">
                        {t("addConfirmInto")}
                      </p>
                      <p className="mt-0.5 text-sm font-bold text-emerald-950 dark:text-emerald-100">
                        💵 {t("currentWallet")}
                      </p>
                      <p className="mt-1 text-sm font-semibold tabular-nums">
                        <Money
                          amount={intoCurrent}
                          currency={preferredCurrency}
                          locale={locale}
                        />
                      </p>
                    </div>
                  ) : null}
                  {intoSavings > 0 ? (
                    <div className="rounded-2xl bg-amber-100 px-3 py-2.5 ring-1 ring-amber-300/80 dark:bg-amber-950/40 dark:ring-amber-700/60">
                      <p className="text-[11px] font-medium text-amber-900/70 dark:text-amber-200/70">
                        {t("addConfirmInto")}
                      </p>
                      <p className="mt-0.5 text-sm font-bold text-amber-950 dark:text-amber-100">
                        💰 {t("savingsWallet")}
                      </p>
                      <p className="mt-1 text-sm font-semibold tabular-nums">
                        <Money
                          amount={intoSavings}
                          currency={preferredCurrency}
                          locale={locale}
                        />
                      </p>
                    </div>
                  ) : null}
                </div>
              ) : null}

              {transferMode ? (
                <div className="rounded-2xl bg-[var(--panel-soft)] px-3 py-3 ring-1 ring-[var(--input-border)]">
                  <p className="text-[11px] font-medium text-[var(--muted)]">
                    {t("addConfirmMove")}
                  </p>
                  <p className="mt-1 text-sm font-bold leading-snug">
                    {fromWallet && isSavingsWallet(fromWallet)
                      ? "💰 " + t("savingsWallet")
                      : "💵 " + t("currentWallet")}
                    <span className="mx-2 opacity-50">→</span>
                    {toWallet && isSavingsWallet(toWallet)
                      ? "💰 " + t("savingsWallet")
                      : "💵 " + t("currentWallet")}
                  </p>
                </div>
              ) : null}

              {withdrawMode ? (
                <div className="rounded-2xl bg-emerald-100 px-3 py-3 ring-1 ring-emerald-300/80 dark:bg-emerald-950/40 dark:ring-emerald-700/60">
                  <p className="text-[11px] font-medium text-emerald-900/70 dark:text-emerald-200/70">
                    {t("addConfirmSource")}
                  </p>
                  <p className="mt-0.5 text-base font-bold text-emerald-950 dark:text-emerald-100">
                    💵 {t("currentWallet")}
                  </p>
                  <p className="mt-1 text-xs leading-snug text-emerald-900/80 dark:text-emerald-200/80">
                    {t("cashWithdrawHint")}
                  </p>
                </div>
              ) : null}

              {showWalletHighlight && !transferMode && !withdrawMode ? (
                <div className={`rounded-2xl px-3 py-3 ring-1 ${walletToneClass}`}>
                  <p className="text-[11px] font-medium opacity-70">
                    {personalPaid && trackOnly
                      ? t("addConfirmNoCash")
                      : t("addConfirmSource")}
                  </p>
                  <p className="mt-0.5 text-base font-bold">
                    {personalPaid && trackOnly
                      ? `📋 ${t("spendTrackOnly")}`
                      : fromWallet && isSavingsWallet(fromWallet)
                        ? `💰 ${t("savingsWallet")}`
                        : `💵 ${t("currentWallet")}`}
                  </p>
                  <p className="mt-1 text-xs leading-snug opacity-80">
                    {personalPaid && trackOnly
                      ? t("spendTrackOnlyHint")
                      : fromWallet && isSavingsWallet(fromWallet)
                        ? t("spendFromSavingsHint")
                        : t("currentHint")}
                  </p>
                </div>
              ) : null}

              <dl className="space-y-2 text-sm">
                {selectedCategory &&
                !transferMode &&
                !withdrawMode &&
                !giveMode ? (
                  <div className="flex items-center justify-between gap-3">
                    <dt className="text-[var(--muted)]">{t("forWhat")}</dt>
                    <dd className="font-semibold text-end">
                      {categoryLabel(selectedCategory, locale, t)}
                    </dd>
                  </div>
                ) : null}
                {selectedPerson && (giveMode || coverMode) ? (
                  <div className="flex items-center justify-between gap-3">
                    <dt className="text-[var(--muted)]">{t("giveTo")}</dt>
                    <dd className="font-semibold text-end">
                      {personLabel(selectedPerson, locale)}
                    </dd>
                  </div>
                ) : null}
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-[var(--muted)]">{t("day")}</dt>
                  <dd>
                    <ItemDate value={occurredOn} locale={locale} />
                  </dd>
                </div>
                {note.trim() ? (
                  <div className="flex items-start justify-between gap-3">
                    <dt className="shrink-0 text-[var(--muted)]">
                      {t("noteOptional")}
                    </dt>
                    <dd className="text-end font-medium leading-snug">
                      {note.trim()}
                    </dd>
                  </div>
                ) : null}
              </dl>

              {error ? (
                <p className="text-sm text-red-700">{error}</p>
              ) : null}
            </div>

            <div className="flex gap-2 border-t border-[var(--surface-border)] px-4 py-3">
              <button
                type="button"
                disabled={busy}
                onClick={() => confirmSave()}
                className="flex min-h-12 flex-1 items-center justify-center rounded-3xl bg-emerald-800 text-base font-semibold text-white disabled:opacity-60"
              >
                {busy ? t("saving") : `✅ ${t("addConfirmAction")}`}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => setConfirmOpen(false)}
                className="min-h-12 rounded-3xl px-4 text-sm font-semibold text-[var(--muted)] disabled:opacity-60"
              >
                {t("subsCancel")}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <BottomNav />
    </PageShell>
  );
}

export default function AddPage() {
  return (
    <Suspense fallback={null}>
      <AddForm />
    </Suspense>
  );
}
