"use client";

import { FormEvent, Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api, todayISO } from "@/lib/api";
import { BottomNav } from "@/components/BottomNav";
import { useI18n } from "@/components/I18nProvider";
import { useBooks } from "@/components/BooksProvider";
import { labelFor } from "@/lib/i18n";
import { householdPath, type Space } from "@/lib/space";
import { Hint } from "@/components/Hint";
import {
  isCashWallet,
  isCurrentWallet,
  isSavingsWallet,
  sortCashWallets,
} from "@/lib/wallets";

type Account = { id: string; name: string; type?: string };
type Category = { id: string; name: string; kind: "EXPENSE" | "INCOME" | "PEER" };
type Person = { id: string; name: string };
type WalletKind = "EXPENSE" | "INCOME" | "GIVE";

const HIDDEN_EXPENSE = new Set(["Member payback", "Given to member", "Allowance"]);

function AddForm() {
  const router = useRouter();
  const search = useSearchParams();
  const { t } = useI18n();
  const { active } = useBooks();
  const [space, setSpace] = useState<Space | null>(null);
  const [mode, setMode] = useState<"wallet" | "claim">("wallet");
  const [type, setType] = useState<WalletKind>("EXPENSE");
  const [amount, setAmount] = useState("");
  const [currentAmt, setCurrentAmt] = useState("");
  const [savingsAmt, setSavingsAmt] = useState("");
  const [accountId, setAccountId] = useState("");
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
  const giveMode = mode === "wallet" && type === "GIVE";

  useEffect(() => {
    if (!active) return;
    setSpace(active);
    const isHouseMember = active.kind === "HOUSE" && active.role === "MEMBER";
    setMode(isHouseMember ? "claim" : "wallet");
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
        if (current) setAccountId(current.id);
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
          !(type === "EXPENSE" && HIDDEN_EXPENSE.has(c.name)),
      ),
    [categories, type],
  );

  useEffect(() => {
    const list = mode === "claim" ? expenseCats : walletCats;
    const preferred = type === "INCOME" && mode !== "claim" ? "Salary" : "Groceries";
    const pick = list.find((c) => c.name === preferred) ?? list[0];
    if (pick) setCategoryId(pick.id);
  }, [mode, type, expenseCats, walletCats]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!space) return;
    setBusy(true);
    setError("");
    try {
      if (mode === "claim") {
        await api(householdPath(space.householdId, "/claims"), {
          method: "POST",
          body: JSON.stringify({
            categoryId,
            amount: Number(amount),
            occurredOn,
            note,
          }),
        });
      } else if (type === "GIVE") {
        await api(householdPath(space.householdId, "/payouts"), {
          method: "POST",
          body: JSON.stringify({
            toUserId,
            accountId,
            amount: Number(amount),
            occurredOn,
            note,
            kind: "Allowance",
          }),
        });
      } else if (type === "INCOME") {
        const current = accounts.find(isCurrentWallet);
        const savings = accounts.find(isSavingsWallet);
        const intoCurrent = Number(currentAmt);
        const intoSavings = Number(savingsAmt);
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
            amount: Number(amount),
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

  const claimMode = mode === "claim";

  return (
    <main className="mx-auto max-w-lg px-4 pb-32 pt-6">
      <h1 className="text-3xl font-bold">➕ {t("navAdd")}</h1>
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
              !claimMode && type === "EXPENSE"
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
              !claimMode && type === "INCOME"
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
              !claimMode && type === "GIVE"
                ? "bg-teal-800 text-white shadow"
                : "bg-white text-stone-700"
            }`}
          >
            💵 {t("giveFromHouse")}
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
            onClick={() => setType("EXPENSE")}
            className={`min-h-16 rounded-3xl text-lg font-semibold ${
              type === "EXPENSE" ? "bg-red-800 text-white shadow" : "bg-white text-stone-700"
            }`}
          >
            🧾 {t("paid")}
          </button>
          <button
            type="button"
            onClick={() => setType("INCOME")}
            className={`min-h-16 rounded-3xl text-lg font-semibold ${
              type === "INCOME" ? "bg-emerald-800 text-white shadow" : "bg-white text-stone-700"
            }`}
          >
            📈 {t("moneyIn")}
          </button>
        </div>
      )}
      <Hint>
        {claimMode
          ? t("paidFromMyMoneyHint")
          : type === "GIVE"
            ? t("giveFromHouseHint")
            : type === "INCOME"
              ? t("moneyInHint")
              : t("paidHint")}
      </Hint>
      <form onSubmit={onSubmit} className="mt-6 space-y-4">
        {giveMode ? (
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
        {claimMode || type !== "INCOME" ? (
          <label className="block">
            <span className="mb-1 block font-medium">{t("amount")}</span>
            <input
              inputMode="decimal"
              className="w-full rounded-2xl border border-stone-300 bg-white px-4 py-4 text-2xl"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0"
              required
            />
            <Hint>{t("amountHint")}</Hint>
          </label>
        ) : (
          <div className="space-y-3">
            <Hint>{t("splitIncomeHint")}</Hint>
            <label className="block">
              <span className="mb-1 block font-medium">
                💵 {t("incomeToCurrent")}
              </span>
              <input
                inputMode="decimal"
                className="w-full rounded-2xl border border-stone-300 bg-white px-4 py-4 text-2xl"
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
                className="w-full rounded-2xl border border-stone-300 bg-white px-4 py-4 text-2xl"
                value={savingsAmt}
                onChange={(e) => setSavingsAmt(e.target.value)}
                placeholder="0"
              />
              <Hint>{t("savingsHint")}</Hint>
            </label>
          </div>
        )}
        {giveMode ? null : (
          <label className="block">
            <span className="mb-1 block font-medium">{t("forWhat")}</span>
            <select
              className="w-full rounded-2xl border border-stone-300 bg-white px-4 py-3 text-lg"
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
            >
              {(claimMode ? expenseCats : walletCats).map((c) => (
                <option key={c.id} value={c.id}>
                  {labelFor(c.name, t)}
                </option>
              ))}
            </select>
            <Hint>{t("forWhatHint")}</Hint>
          </label>
        )}
        {claimMode || type === "INCOME" ? null : (
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
                    ? `💰 ${t("savingsWallet")}`
                    : `💵 ${t("currentWallet")}`}
                </button>
              ))}
            </div>
            <Hint>{t("pickWalletHint")}</Hint>
          </div>
        )}
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
    </main>
  );
}

export default function AddPage() {
  return (
    <Suspense fallback={null}>
      <AddForm />
    </Suspense>
  );
}
