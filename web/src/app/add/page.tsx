"use client";

import { FormEvent, Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api, parseAmount, todayISO } from "@/lib/api";
import { BottomNav } from "@/components/BottomNav";
import { PageShell } from "@/components/PageShell";
import { useI18n } from "@/components/I18nProvider";
import { useBooks } from "@/components/BooksProvider";
import { householdPath, type Space } from "@/lib/space";
import { Hint } from "@/components/Hint";
import { CategoryPicker } from "@/components/CategoryPicker";
import {
  isCashWallet,
  isCurrentWallet,
  isSavingsWallet,
  sortCashWallets,
} from "@/lib/wallets";

type Account = { id: string; name: string; type?: string };
type Category = {
  id: string;
  name: string;
  kind: "EXPENSE" | "INCOME" | "PEER";
  parentId?: string | null;
};
type Person = { id: string; name: string };
type WalletKind = "EXPENSE" | "INCOME" | "GIVE";

const HIDDEN_EXPENSE = new Set([
  "Member payback",
  "Given to member",
  "Allowance",
  "Wallet transfer",
]);
const HIDDEN_INCOME = new Set(["Wallet transfer"]);

function AddForm() {
  const router = useRouter();
  const search = useSearchParams();
  const { t } = useI18n();
  const { active } = useBooks();
  const [space, setSpace] = useState<Space | null>(null);
  const [mode, setMode] = useState<"wallet" | "claim" | "cover" | "transfer">(
    "wallet",
  );
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
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const houseAdmin = space?.kind === "HOUSE" && space.role === "ADMIN";
  const personalBooks = space?.kind === "PERSONAL";
  const giveMode = mode === "wallet" && type === "GIVE";
  const coverMode = mode === "cover";
  const claimMode = mode === "claim";
  const transferMode = mode === "transfer";

  useEffect(() => {
    if (!active) return;
    setSpace(active);
    const isHouseMember = active.kind === "HOUSE" && active.role === "MEMBER";
    const wantClaim = search.get("mode") === "claim";
    const wantCover = search.get("mode") === "cover";
    const wantTransfer = search.get("mode") === "transfer";
    if (isHouseMember || wantClaim) {
      setMode("claim");
      setType("EXPENSE");
    } else if (wantCover && active.role === "ADMIN") {
      setMode("cover");
      setType("EXPENSE");
    } else if (wantTransfer && active.kind === "PERSONAL") {
      setMode("transfer");
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
        const current = a.find(isCurrentWallet) ?? a[0];
        const savings = a.find(isSavingsWallet);
        if (current) setAccountId(current.id);
        if (savings) setToAccountId(savings.id);
        else if (a[1]) setToAccountId(a[1].id);
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
        (c) => c.kind === "EXPENSE" && !HIDDEN_EXPENSE.has(c.name),
      ),
    [categories],
  );
  const walletCats = useMemo(
    () =>
      categories.filter(
        (c) =>
          c.kind === type &&
          !(type === "EXPENSE" && HIDDEN_EXPENSE.has(c.name)) &&
          !(type === "INCOME" && HIDDEN_INCOME.has(c.name)),
      ),
    [categories, type],
  );

  useEffect(() => {
    if (transferMode) return;
    const list =
      mode === "claim" || mode === "cover" ? expenseCats : walletCats;
    const preferred =
      type === "INCOME" && mode === "wallet" ? "Salary" : "Consumables";
    const pick = list.find((c) => c.name === preferred) ?? list[0];
    if (pick) setCategoryId(pick.id);
  }, [mode, type, expenseCats, walletCats, transferMode]);

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
      } else {
        await api(householdPath(space.householdId, "/transactions"), {
          method: "POST",
          body: JSON.stringify({
            type,
            amount: parseAmount(amount),
            accountId,
            categoryId,
            occurredOn,
            note,
          }),
        });
      }
      router.replace("/");
    } catch {
      setError(t("couldNotSave"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <PageShell>
      <h1 className="text-2xl font-bold leading-tight sm:text-3xl">➕ {t("navAdd")}</h1>
      <Hint>{t("addPageHint")}</Hint>
      {houseAdmin ? (
        <div className="mt-4 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => {
              setMode("wallet");
              setType("EXPENSE");
            }}
            className={`min-h-16 rounded-3xl px-2 text-lg font-semibold ${
              !claimMode && !coverMode && type === "EXPENSE"
                ? "bg-red-800 text-white shadow"
                : "bg-white text-stone-700"
            }`}
          >
            🧾 {t("paid")}
          </button>
          <button
            type="button"
            onClick={() => {
              setMode("wallet");
              setType("INCOME");
            }}
            className={`min-h-16 rounded-3xl px-2 text-lg font-semibold ${
              !claimMode && !coverMode && type === "INCOME"
                ? "bg-emerald-800 text-white shadow"
                : "bg-white text-stone-700"
            }`}
          >
            📈 {t("moneyIn")}
          </button>
          <button
            type="button"
            onClick={() => {
              setMode("wallet");
              setType("GIVE");
            }}
            className={`min-h-16 rounded-3xl px-2 text-lg font-semibold ${
              !claimMode && !coverMode && type === "GIVE"
                ? "bg-teal-800 text-white shadow"
                : "bg-white text-stone-700"
            }`}
          >
            💵 {t("giveFromHouse")}
          </button>
          <button
            type="button"
            onClick={() => setMode("cover")}
            className={`min-h-16 rounded-3xl px-2 text-lg font-semibold ${
              coverMode ? "bg-indigo-800 text-white shadow" : "bg-white text-stone-700"
            }`}
          >
            🏠 {t("housePaidForTitle")}
          </button>
          <button
            type="button"
            onClick={() => setMode("claim")}
            className={`min-h-16 rounded-3xl px-2 text-lg font-semibold ${
              claimMode ? "bg-amber-800 text-white shadow" : "bg-white text-stone-700"
            }`}
          >
            👛 {t("paidFromMyMoneyTitle")}
          </button>
        </div>
      ) : claimMode ? null : (
        <div className="mt-4 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => {
              setMode("wallet");
              setType("EXPENSE");
            }}
            className={`min-h-16 rounded-3xl text-lg font-semibold ${
              !transferMode && type === "EXPENSE"
                ? "bg-red-800 text-white shadow"
                : "bg-white text-stone-700"
            }`}
          >
            🧾 {t("paid")}
          </button>
          <button
            type="button"
            onClick={() => {
              setMode("wallet");
              setType("INCOME");
            }}
            className={`min-h-16 rounded-3xl text-lg font-semibold ${
              !transferMode && type === "INCOME"
                ? "bg-emerald-800 text-white shadow"
                : "bg-white text-stone-700"
            }`}
          >
            📈 {t("moneyIn")}
          </button>
          {personalBooks ? (
            <button
              type="button"
              onClick={() => setMode("transfer")}
              className={`col-span-2 min-h-14 rounded-3xl text-lg font-semibold ${
                transferMode
                  ? "bg-stone-800 text-white shadow"
                  : "bg-white text-stone-700"
              }`}
            >
              🔁 {t("transferWallets")}
            </button>
          ) : null}
        </div>
      )}
      <Hint>
        {transferMode
          ? t("transferWalletsHint")
          : coverMode
          ? t("housePaidForHint")
          : claimMode
            ? t("paidFromMyMoneyHint")
            : type === "GIVE"
              ? t("giveFromHouseHint")
              : type === "INCOME"
                ? t("moneyInHint")
                : t("paidHint")}
      </Hint>
      <form onSubmit={onSubmit} className="mt-6 space-y-4">
        {transferMode ? (
          <>
            <div>
              <p className="mb-1 font-medium">{t("transferFrom")}</p>
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
                    className={`rounded-2xl px-3 py-3 font-semibold ${
                      accountId === a.id
                        ? "bg-stone-900 text-white"
                        : "bg-white text-stone-700"
                    }`}
                  >
                    {isSavingsWallet(a)
                      ? "💰 " + t("savingsWallet")
                      : "💵 " + t("currentWallet")}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <p className="mb-1 font-medium">{t("transferTo")}</p>
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
                    className={`rounded-2xl px-3 py-3 font-semibold ${
                      toAccountId === a.id
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
            </div>
            <label className="block">
              <span className="mb-1 block font-medium">{t("amount")}</span>
              <input
                inputMode="decimal"
                dir="ltr"
                className="amount-input w-full rounded-2xl border border-stone-300 bg-white px-4 py-4 text-2xl"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder={t("payBackAmount")}
                required
              />
            </label>
          </>
        ) : null}
        {!transferMode && (giveMode || coverMode) ? (
          <label className="block">
            <span className="mb-1 block font-medium">{t("giveTo")}</span>
            <select
              className="w-full rounded-2xl border border-stone-300 bg-white px-4 py-4 text-xl"
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
            <Hint>{t("giveToHint")}</Hint>
          </label>
        ) : null}
        {!transferMode && (claimMode || coverMode || type !== "INCOME") ? (
          <label className="block">
            <span className="mb-1 block font-medium">{t("amount")}</span>
            <input
              inputMode="decimal"
              dir="ltr"
              className="amount-input w-full rounded-2xl border border-stone-300 bg-white px-4 py-4 text-2xl"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0"
              required
            />
            <Hint>{t("amountHint")}</Hint>
          </label>
        ) : null}
        {!transferMode && !claimMode && !coverMode && type === "INCOME" ? (
          <div className="space-y-3">
            <Hint>{t("splitIncomeHint")}</Hint>
            <label className="block">
              <span className="mb-1 block font-medium">
                💵 {t("incomeToCurrent")}
              </span>
              <input
                inputMode="decimal"
                dir="ltr"
                className="amount-input w-full rounded-2xl border border-stone-300 bg-white px-4 py-4 text-2xl"
                value={currentAmt}
                onChange={(e) => setCurrentAmt(e.target.value)}
                placeholder="0"
              />
              <Hint>{t("currentHint")}</Hint>
            </label>
            <label className="block">
              <span className="mb-1 block font-medium">
                💰 {t("incomeToSavings")}
              </span>
              <input
                inputMode="decimal"
                dir="ltr"
                className="amount-input w-full rounded-2xl border border-stone-300 bg-white px-4 py-4 text-2xl"
                value={savingsAmt}
                onChange={(e) => setSavingsAmt(e.target.value)}
                placeholder="0"
              />
              <Hint>{t("savingsHint")}</Hint>
            </label>
          </div>
        ) : null}
        {!transferMode && !giveMode ? (
          <CategoryPicker
            categories={claimMode || coverMode ? expenseCats : walletCats}
            value={categoryId}
            onChange={setCategoryId}
          />
        ) : null}
        {!transferMode &&
        !(claimMode || (!coverMode && type === "INCOME")) ? (
          <div>
            <p className="mb-1 font-medium">{t("pickWalletSpend")}</p>
            <div className="grid grid-cols-2 gap-2">
              {accounts.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => setAccountId(a.id)}
                  className={`rounded-2xl px-3 py-3 text-lg font-bold ${
                    accountId === a.id
                      ? "bg-emerald-800 text-white shadow"
                      : "bg-white text-stone-700"
                  }`}
                >
                  {isSavingsWallet(a)
                    ? "💰 " + t("savingsWallet")
                    : "💵 " + t("currentWallet")}
                </button>
              ))}
            </div>
            <Hint>{t("pickWalletHint")}</Hint>
          </div>
        ) : null}
        <label className="block">
          <span className="mb-1 block font-medium">{t("day")}</span>
          <input
            type="date"
            className="w-full rounded-2xl border border-stone-300 bg-white px-4 py-3 text-lg"
            value={occurredOn}
            onChange={(e) => setOccurredOn(e.target.value)}
            required
          />
          <Hint>{t("dayHint")}</Hint>
        </label>
        <label className="block">
          <span className="mb-1 block font-medium">{t("noteOptional")}</span>
          <input
            className="w-full rounded-2xl border border-stone-300 bg-white px-4 py-3 text-lg"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={t("notePlaceholder")}
          />
          <Hint>{t("noteHint")}</Hint>
        </label>
        {error ? <p className="text-red-700">{error}</p> : null}
        <button
          disabled={busy}
          className="w-full rounded-3xl bg-emerald-800 px-4 py-4 text-lg font-semibold text-white disabled:opacity-60"
        >
          {busy ? t("saving") : `✅ ${t("save")}`}
        </button>
        <Hint>{t("addSaveHint")}</Hint>
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
