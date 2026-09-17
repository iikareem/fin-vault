"use client";

import { FormEvent, useEffect, useState } from "react";
import { api, parseAmount, todayISO } from "@/lib/api";
import { BottomNav } from "@/components/BottomNav";
import { PageShell } from "@/components/PageShell";
import { Money } from "@/components/Money";
import { useI18n } from "@/components/I18nProvider";
import { useBooks } from "@/components/BooksProvider";
import { householdPath } from "@/lib/space";
import { Hint } from "@/components/Hint";
import { ItemDate } from "@/components/ItemDate";
import {
  isCashWallet,
  isCurrentWallet,
  sortCashWallets,
} from "@/lib/wallets";
import { labelFor } from "@/lib/i18n";

type Account = { id: string; name: string };
type Loan = {
  id: string;
  personName: string;
  originalAmount: number;
  remaining: number;
  collected: number;
  status: string;
  note: string;
  occurredOn: string;
  account?: { id: string; name: string };
};

type LoansData = {
  open: Loan[];
  settled: Loan[];
  owedToYou: number;
};

export default function OutsideLoansPage() {
  const { t, locale } = useI18n();
  const { personal, setKind } = useBooks();
  const currency = personal?.currency ?? "EGP";
  const hid = personal?.householdId ?? "";
  const [data, setData] = useState<LoansData | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [personName, setPersonName] = useState("");
  const [amount, setAmount] = useState("");
  const [accountId, setAccountId] = useState("");
  const [occurredOn, setOccurredOn] = useState(todayISO());
  const [note, setNote] = useState("");
  const [collectAmount, setCollectAmount] = useState<Record<string, string>>(
    {},
  );
  const [collectWallet, setCollectWallet] = useState<Record<string, string>>(
    {},
  );
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  function load(householdId: string) {
    return Promise.all([
      api<LoansData>(householdPath(householdId, "/outside-loans")),
      api<Account[]>(householdPath(householdId, "/accounts")),
    ]).then(([loans, list]) => {
      setData(loans);
      const cash = sortCashWallets(list.filter(isCashWallet));
      setAccounts(cash);
      const current = cash.find(isCurrentWallet) ?? cash[0];
      if (current) {
        setAccountId((prev) => prev || current.id);
        setCollectWallet((prev) => {
          const next = { ...prev };
          for (const loan of loans.open) {
            if (!next[loan.id]) next[loan.id] = current.id;
          }
          return next;
        });
      }
    });
  }

  useEffect(() => {
    if (!personal) return;
    setKind("PERSONAL");
    load(personal.householdId).catch((e) => setError(e.message));
  }, [personal?.householdId]);

  async function lend(e: FormEvent) {
    e.preventDefault();
    if (!hid) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await api(householdPath(hid, "/outside-loans"), {
        method: "POST",
        body: JSON.stringify({
          personName,
          amount: parseAmount(amount),
          accountId,
          occurredOn,
          note: note.trim() || undefined,
        }),
      });
      setPersonName("");
      setAmount("");
      setNote("");
      setMessage(t("outsideSaved"));
      await load(hid);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  async function collect(loan: Loan) {
    if (!hid) return;
    const raw = collectAmount[loan.id] ?? "";
    const value = parseAmount(raw || String(loan.remaining));
    const wallet = collectWallet[loan.id] || accountId;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await api(householdPath(hid, `/outside-loans/${loan.id}/collect`), {
        method: "POST",
        body: JSON.stringify({
          amount: value,
          accountId: wallet,
          occurredOn: todayISO(),
        }),
      });
      setCollectAmount((prev) => ({ ...prev, [loan.id]: "" }));
      setMessage(t("outsideCollected"));
      await load(hid);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <PageShell>
      <h1 className="page-title">
        🤝 {t("outsideLoansTitle")}
      </h1>
      <Hint>{t("outsideLoansHint")}</Hint>

      {data ? (
        <p className="mt-4 text-lg font-semibold">
          {t("outsideOwedToYou")}:{" "}
          <Money amount={data.owedToYou} currency={currency} locale={locale} />
        </p>
      ) : null}

      <form onSubmit={lend} className="surface mt-5 space-y-3 rounded-[1.75rem] p-4">
        <h2 className="text-xl font-bold">{t("outsideLendTitle")}</h2>
        <label className="block">
          <span className="mb-1 block font-medium">{t("outsidePersonName")}</span>
          <input
            className="field text-lg"
            value={personName}
            onChange={(e) => setPersonName(e.target.value)}
            required
          />
          <Hint>{t("outsidePersonNameHint")}</Hint>
        </label>
        <label className="block">
          <span className="mb-1 block font-medium">{t("outsideAmount")}</span>
          <input
            inputMode="decimal"
            className="field text-lg"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            required
          />
        </label>
        <label className="block">
          <span className="mb-1 block font-medium">{t("outsidePickWallet")}</span>
          <select
            className="field text-lg"
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}
            required
          >
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {labelFor(a.name, t)}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block font-medium">{t("day")}</span>
          <input
            type="date"
            className="field text-lg"
            value={occurredOn}
            onChange={(e) => setOccurredOn(e.target.value)}
            required
          />
        </label>
        <label className="block">
          <span className="mb-1 block font-medium">{t("noteOptional")}</span>
          <input
            className="field text-lg"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </label>
        <button
          type="submit"
          disabled={busy}
          className="flex min-h-14 w-full items-center justify-center rounded-3xl bg-stone-900 text-lg font-semibold text-white disabled:opacity-60"
        >
          {t("outsideLendSave")}
        </button>
      </form>

      {error ? <p className="mt-3 text-red-700">{error}</p> : null}
      {message ? <p className="flash mt-3">{message}</p> : null}

      <section className="mt-6 space-y-3">
        <h2 className="text-xl font-bold">{t("outsideOpen")}</h2>
        {!data?.open.length ? (
          <p className="text-stone-500">{t("outsideNoOpen")}</p>
        ) : (
          data.open.map((loan) => (
            <article key={loan.id} className="surface rounded-[1.75rem] p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xl font-bold">{loan.personName}</p>
                  <p className="text-sm text-stone-500">
                    {t("outsideLentOn")}{" "}
                    <ItemDate value={loan.occurredOn} locale={locale} />
                  </p>
                  {loan.note ? (
                    <p className="mt-1 text-stone-600">{loan.note}</p>
                  ) : null}
                </div>
                <div className="text-left">
                  <p className="font-semibold">
                    <Money
                      amount={loan.remaining}
                      currency={currency}
                      locale={locale}
                    />
                  </p>
                  <p className="text-sm text-stone-500">
                    {t("outsideRemaining")}
                  </p>
                </div>
              </div>
              <div className="mt-3 space-y-2">
                <label className="block">
                  <span className="mb-1 block text-sm font-medium">
                    {t("outsideCollect")}
                  </span>
                  <input
                    inputMode="decimal"
                    className="field"
                    placeholder={String(loan.remaining)}
                    value={collectAmount[loan.id] ?? ""}
                    onChange={(e) =>
                      setCollectAmount((prev) => ({
                        ...prev,
                        [loan.id]: e.target.value,
                      }))
                    }
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-sm font-medium">
                    {t("outsidePickWalletBack")}
                  </span>
                  <select
                    className="field"
                    value={collectWallet[loan.id] || accountId}
                    onChange={(e) =>
                      setCollectWallet((prev) => ({
                        ...prev,
                        [loan.id]: e.target.value,
                      }))
                    }
                  >
                    {accounts.map((a) => (
                      <option key={a.id} value={a.id}>
                        {labelFor(a.name, t)}
                      </option>
                    ))}
                  </select>
                </label>
                <Hint>{t("outsideCollectHint")}</Hint>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => collect(loan)}
                  className="flex min-h-12 w-full items-center justify-center rounded-2xl bg-emerald-800 font-semibold text-white disabled:opacity-60"
                >
                  {t("outsideCollectSave")}
                </button>
              </div>
            </article>
          ))
        )}
      </section>

      {data?.settled.length ? (
        <section className="mt-6 space-y-3">
          <h2 className="text-xl font-bold">{t("outsideSettled")}</h2>
          {data.settled.map((loan) => (
            <article
              key={loan.id}
              className="rounded-[1.75rem] border border-stone-200 bg-white/70 px-4 py-3"
            >
              <div className="flex justify-between gap-3">
                <span className="font-semibold">{loan.personName}</span>
                <Money
                  amount={loan.originalAmount}
                  currency={currency}
                  locale={locale}
                />
              </div>
            </article>
          ))}
        </section>
      ) : null}

      <BottomNav />
    </PageShell>
  );
}
