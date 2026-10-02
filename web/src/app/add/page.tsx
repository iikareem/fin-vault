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
import { categoryLabel } from "@/lib/i18n";

type Account = { id: string; name: string; type?: string };
type Category = {
  id: string;
  name: string;
  nameAr?: string | null;
  kind: "EXPENSE" | "INCOME" | "PEER";
  parentId?: string | null;
  color?: string | null;
};
type Person = { id: string; name: string };
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
  const { active } = useBooks();
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
    }
    if (search.get("mode") === "give" && !isHouseMember) setType("GIVE");
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
        if (rememberedAccount) setAccountId(rememberedAccount.id);
        else if (current) setAccountId(current.id);
        if (savings) setToAccountId(savings.id);
        else if (a[1]) setToAccountId(a[1].id);
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

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!space) return;
    setBusy(true);
    setError("");
    try {
      if (transferMode) {
        const value = parseAmount(amount);
        if (!accountId || !toAccountId || !(value > 0)) {
          setError(t("amountHint"));
          setBusy(false);
          return;
        }
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
        if (!(value > 0)) {
          setError(t("amountHint"));
          setBusy(false);
          return;
        }
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

  function walletBtn(active: boolean, tone: "stone" | "emerald" = "emerald") {
    return `rounded-2xl px-3 py-2.5 text-sm font-bold transition ${
      active
        ? tone === "stone"
          ? "bg-stone-900 text-white shadow"
          : "bg-emerald-800 text-white shadow"
        : "bg-[var(--panel-soft)] text-[var(--foreground)] ring-1 ring-[var(--input-border)]"
    }`;
  }

  const modeChip = (active: boolean) =>
    `chip shrink-0 whitespace-nowrap ${active ? "chip-active" : ""}`;

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
                    className={walletBtn(accountId === a.id, "stone")}
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
                  {p.name}
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
          <div>
            <p className="mb-1.5 text-xs font-medium text-[var(--muted)]">
              {t("addPaidFrom")}
            </p>
            <div className="seg grid-cols-3">
              <button
                type="button"
                onClick={() => setPaidFrom("current")}
                className={`rounded-2xl px-1 py-2.5 text-center text-xs font-bold transition sm:text-sm ${
                  paidFromCurrent
                    ? "bg-[var(--surface-bg)] text-[var(--foreground)] shadow-sm"
                    : "text-[var(--muted)]"
                }`}
              >
                💵 {t("currentWallet")}
              </button>
              <button
                type="button"
                onClick={() => setPaidFrom("savings")}
                className={`rounded-2xl px-1 py-2.5 text-center text-xs font-bold transition sm:text-sm ${
                  paidFromSavings
                    ? "bg-[var(--surface-bg)] text-[var(--foreground)] shadow-sm"
                    : "text-[var(--muted)]"
                }`}
              >
                💰 {t("savingsWallet")}
              </button>
              <button
                type="button"
                onClick={() => setPaidFrom("track")}
                className={`rounded-2xl px-1 py-2.5 text-center text-xs font-bold transition sm:text-sm ${
                  trackOnly
                    ? "bg-[var(--surface-bg)] text-[var(--foreground)] shadow-sm"
                    : "text-[var(--muted)]"
                }`}
              >
                📋 {t("spendTrackOnly")}
              </button>
            </div>
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
                  className={`rounded-2xl px-2 py-2.5 text-center text-sm font-bold transition ${
                    accountId === a.id
                      ? "bg-[var(--surface-bg)] text-[var(--foreground)] shadow-sm"
                      : "text-[var(--muted)]"
                  }`}
                >
                  {isSavingsWallet(a)
                    ? "💰 " + t("savingsWallet")
                    : "💵 " + t("currentWallet")}
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
