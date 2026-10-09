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
import { DateField } from "@/components/DateField";
import { BottomSheet } from "@/components/BottomSheet";

function loanDay(value?: string) {
  if (!value) return todayISO();
  return value.slice(0, 10);
}
import {
  isCashWallet,
  isCurrentWallet,
  sortCashWallets,
} from "@/lib/wallets";

type Account = { id: string; name: string };
type WalletTarget = "CURRENT" | "SAVINGS" | "NONE";
type Direction = "LEND" | "BORROW";

type Loan = {
  id: string;
  personName: string;
  direction: Direction;
  originalAmount: number;
  remaining: number;
  collected: number;
  status: string;
  note: string;
  occurredOn: string;
  account?: { id: string; name: string } | null;
};

type LoansData = {
  open: Loan[];
  settled: Loan[];
  owedToYou: number;
  youOwe: number;
};

function ProgressBar({ pct }: { pct: number }) {
  const width = Math.min(100, Math.max(0, pct));
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--panel-soft)]">
      <div
        className="h-full rounded-full bg-emerald-700 transition-[width] duration-500"
        style={{ width: `${width}%` }}
      />
    </div>
  );
}

function chipClass(active: boolean) {
  return `seg-item px-3 py-2 text-sm ${
    active ? "seg-active" : "ring-1 ring-[var(--input-border)]"
  }`;
}

export default function OutsideLoansPage() {
  const { t, locale } = useI18n();
  const { personal, setKind } = useBooks();
  const currency = personal?.currency ?? "EGP";
  const hid = personal?.householdId ?? "";
  const [data, setData] = useState<LoansData | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [direction, setDirection] = useState<Direction>("BORROW");
  const [walletTarget, setWalletTarget] = useState<WalletTarget>("CURRENT");
  const [personName, setPersonName] = useState("");
  const [amount, setAmount] = useState("");
  const [occurredOn, setOccurredOn] = useState(todayISO());
  const [note, setNote] = useState("");
  const [collectAmount, setCollectAmount] = useState<Record<string, string>>(
    {},
  );
  const [collectTarget, setCollectTarget] = useState<
    Record<string, WalletTarget>
  >({});
  const [editingLoan, setEditingLoan] = useState<Loan | null>(null);
  const [editPersonName, setEditPersonName] = useState("");
  const [editAmount, setEditAmount] = useState("");
  const [editOccurredOn, setEditOccurredOn] = useState(todayISO());
  const [editNote, setEditNote] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState(false);
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
      setCollectTarget((prev) => {
        const next = { ...prev };
        for (const loan of loans.open) {
          if (!next[loan.id]) next[loan.id] = "CURRENT";
        }
        return next;
      });
    });
  }

  useEffect(() => {
    if (!personal) return;
    setKind("PERSONAL");
    load(personal.householdId).catch((e) => setError(e.message));
  }, [personal?.householdId]);

  async function saveLoan(e: FormEvent) {
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
          direction,
          amount: parseAmount(amount),
          walletTarget,
          occurredOn,
          note: note.trim() || undefined,
        }),
      });
      setPersonName("");
      setAmount("");
      setNote("");
      setShowForm(false);
      setMessage(
        direction === "BORROW" ? t("outsideBorrowedSaved") : t("outsideSaved"),
      );
      await load(hid);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("couldNotSave"));
    } finally {
      setBusy(false);
    }
  }

  function canEditLoan(loan: Loan) {
    return loan.collected < 0.001;
  }

  function openLoanEdit(loan: Loan) {
    setEditingLoan(loan);
    setEditPersonName(loan.personName);
    setEditAmount(String(loan.originalAmount));
    setEditOccurredOn(loanDay(loan.occurredOn));
    setEditNote(loan.note);
    setDeleteConfirm(false);
    setError("");
    setMessage("");
  }

  function closeLoanEdit() {
    if (busy) return;
    setEditingLoan(null);
    setDeleteConfirm(false);
  }

  async function saveLoanEdit() {
    if (!hid || !editingLoan) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await api(householdPath(hid, `/outside-loans/${editingLoan.id}`), {
        method: "PATCH",
        body: JSON.stringify({
          personName: editPersonName.trim(),
          amount: parseAmount(editAmount),
          occurredOn: editOccurredOn,
          note: editNote.trim() || undefined,
        }),
      });
      setEditingLoan(null);
      setMessage(t("loanEditSaved"));
      await load(hid);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("couldNotSave"));
    } finally {
      setBusy(false);
    }
  }

  async function deleteLoanEdit() {
    if (!hid || !editingLoan) return;
    setBusy(true);
    setError("");
    try {
      await api(householdPath(hid, `/outside-loans/${editingLoan.id}`), {
        method: "DELETE",
      });
      setEditingLoan(null);
      setDeleteConfirm(false);
      await load(hid);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("couldNotSave"));
    } finally {
      setBusy(false);
    }
  }

  async function settle(loan: Loan, fullRemaining = false) {
    if (!hid) return;
    const raw = collectAmount[loan.id] ?? "";
    const value = fullRemaining
      ? loan.remaining
      : parseAmount(raw || String(loan.remaining));
    const target = collectTarget[loan.id] || "CURRENT";
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await api(householdPath(hid, `/outside-loans/${loan.id}/collect`), {
        method: "POST",
        body: JSON.stringify({
          amount: value,
          walletTarget: target,
          occurredOn: todayISO(),
        }),
      });
      setCollectAmount((prev) => ({ ...prev, [loan.id]: "" }));
      setMessage(
        loan.direction === "BORROW"
          ? t("outsideRepaid")
          : t("outsideCollected"),
      );
      await load(hid);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("couldNotSave"));
    } finally {
      setBusy(false);
    }
  }

  const hasCurrent = accounts.some(isCurrentWallet);
  const hasSavings = accounts.some((a) => a.name === "Savings");

  return (
    <PageShell>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="page-title">🤝 {t("outsideLoansTitle")}</h1>
          <Hint>{t("outsideLoansHint")}</Hint>
        </div>
        <button
          type="button"
          onClick={() => {
            setShowForm((v) => !v);
            setError("");
            setMessage("");
          }}
          className={`shrink-0 rounded-2xl px-4 py-3 text-sm font-bold shadow-sm ${
            showForm
              ? "bg-stone-200 text-stone-800"
              : "bg-stone-900 text-white"
          }`}
        >
          {showForm
            ? t("goalsCancel")
            : `＋ ${direction === "BORROW" ? t("outsideBorrowTitle") : t("outsideLendTitle")}`}
        </button>
      </div>

      {data ? (
        <div className="mt-4 grid grid-cols-2 gap-2">
          <section className="surface rounded-[1.75rem] p-4">
            <p className="text-sm text-stone-500">{t("outsideOwedToYou")}</p>
            <p className="mt-1 text-xl font-bold tabular-nums">
              <Money
                amount={data.owedToYou}
                currency={currency}
                locale={locale}
              />
            </p>
          </section>
          <section className="surface rounded-[1.75rem] p-4">
            <p className="text-sm text-stone-500">{t("outsideYouOwe")}</p>
            <p className="mt-1 text-xl font-bold tabular-nums">
              <Money
                amount={data.youOwe ?? 0}
                currency={currency}
                locale={locale}
              />
            </p>
          </section>
        </div>
      ) : null}

      {showForm ? (
        <form
          onSubmit={saveLoan}
          className="surface mt-4 space-y-3 rounded-[1.75rem] p-4"
        >
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={chipClass(direction === "BORROW")}
              onClick={() => {
                setDirection("BORROW");
                setWalletTarget("CURRENT");
              }}
            >
              {t("outsideDirectionBorrow")}
            </button>
            <button
              type="button"
              className={chipClass(direction === "LEND")}
              onClick={() => {
                setDirection("LEND");
                setWalletTarget("CURRENT");
              }}
            >
              {t("outsideDirectionLend")}
            </button>
          </div>

          <h2 className="text-xl font-bold">
            {direction === "BORROW"
              ? t("outsideBorrowTitle")
              : t("outsideLendTitle")}
          </h2>

          <label className="block">
            <span className="mb-1 block font-medium">
              {t("outsidePersonName")}
            </span>
            <input
              className="field text-lg"
              value={personName}
              onChange={(e) => setPersonName(e.target.value)}
              required
              autoFocus
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

          <div>
            <span className="mb-1 block font-medium">
              {direction === "BORROW"
                ? t("outsideAddTo")
                : t("outsideFromWallet")}
            </span>
            <div className="flex flex-wrap gap-2">
              {hasCurrent ? (
                <button
                  type="button"
                  className={chipClass(walletTarget === "CURRENT")}
                  onClick={() => setWalletTarget("CURRENT")}
                >
                  {t("outsideWalletCurrent")}
                </button>
              ) : null}
              {hasSavings ? (
                <button
                  type="button"
                  className={chipClass(walletTarget === "SAVINGS")}
                  onClick={() => setWalletTarget("SAVINGS")}
                >
                  {t("outsideWalletSavings")}
                </button>
              ) : null}
              <button
                type="button"
                className={chipClass(walletTarget === "NONE")}
                onClick={() => setWalletTarget("NONE")}
              >
                {direction === "BORROW"
                  ? t("outsideAlreadyTaken")
                  : t("outsideNoDeduction")}
              </button>
            </div>
          </div>

          <div>
            <span className="mb-1 block font-medium">{t("day")}</span>
            <DateField value={occurredOn} onChange={setOccurredOn} />
          </div>

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
            {direction === "BORROW"
              ? t("outsideBorrowSave")
              : t("outsideLendSave")}
          </button>
        </form>
      ) : null}

      {error ? <p className="mt-3 text-red-700">{error}</p> : null}
      {message ? <p className="flash mt-3">{message}</p> : null}

      <section className="mt-6 space-y-3">
        <h2 className="text-xl font-bold">{t("outsideOpen")}</h2>
        {!data?.open.length ? (
          <p className="text-stone-500">{t("outsideNoOpen")}</p>
        ) : (
          data.open.map((loan) => {
            const borrow = loan.direction === "BORROW";
            const pct =
              loan.originalAmount > 0
                ? Math.round(
                    (loan.collected / loan.originalAmount) * 1000,
                  ) / 10
                : 0;
            const target = collectTarget[loan.id] || "CURRENT";
            const editable = canEditLoan(loan);
            return (
              <article key={loan.id} className="surface rounded-[1.75rem] p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-xl font-bold" dir="auto">
                      {loan.personName}
                    </p>
                    <p className="text-sm font-semibold text-stone-600">
                      {borrow
                        ? t("outsideDirectionBorrow")
                        : t("outsideDirectionLend")}
                    </p>
                    <p className="text-sm text-stone-500">
                      {borrow ? t("outsideBorrowedOn") : t("outsideLentOn")}{" "}
                      <ItemDate value={loan.occurredOn} locale={locale} />
                    </p>
                    {loan.note ? (
                      <p className="mt-1 text-stone-600" dir="auto">
                        {loan.note}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-2">
                    <div className="text-left">
                      <p className="font-semibold tabular-nums">
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
                    {editable ? (
                      <button
                        type="button"
                        onClick={() => openLoanEdit(loan)}
                        className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[var(--panel-soft)] text-lg ring-1 ring-[var(--input-border)] transition active:scale-95"
                        aria-label={t("edit")}
                      >
                        ✏️
                      </button>
                    ) : (
                      <span
                        className="rounded-full bg-stone-100 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-stone-500"
                        title={t("outsideEditLocked")}
                      >
                        🔒
                      </span>
                    )}
                  </div>
                </div>

                <div className="mt-3 space-y-1.5">
                  <div className="flex items-center justify-between text-xs text-stone-500">
                    <span>
                      <Money
                        amount={loan.collected}
                        currency={currency}
                        locale={locale}
                      />{" "}
                      /{" "}
                      <Money
                        amount={loan.originalAmount}
                        currency={currency}
                        locale={locale}
                      />
                    </span>
                    <span className="font-semibold tabular-nums">{pct}%</span>
                  </div>
                  <ProgressBar pct={pct} />
                </div>

                <div className="mt-3 space-y-2">
                  <span className="mb-1 block text-sm font-medium">
                    {borrow ? t("outsideFromWallet") : t("outsideAddTo")}
                  </span>
                  <div className="flex flex-wrap gap-2">
                    {hasCurrent ? (
                      <button
                        type="button"
                        className={chipClass(target === "CURRENT")}
                        onClick={() =>
                          setCollectTarget((prev) => ({
                            ...prev,
                            [loan.id]: "CURRENT",
                          }))
                        }
                      >
                        {t("outsideWalletCurrent")}
                      </button>
                    ) : null}
                    {hasSavings ? (
                      <button
                        type="button"
                        className={chipClass(target === "SAVINGS")}
                        onClick={() =>
                          setCollectTarget((prev) => ({
                            ...prev,
                            [loan.id]: "SAVINGS",
                          }))
                        }
                      >
                        {t("outsideWalletSavings")}
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className={chipClass(target === "NONE")}
                      onClick={() =>
                        setCollectTarget((prev) => ({
                          ...prev,
                          [loan.id]: "NONE",
                        }))
                      }
                    >
                      {t("outsideNoDeduction")}
                    </button>
                  </div>
                  <Hint>
                    {borrow ? t("outsideRepayHint") : t("outsideCollectHint")}
                  </Hint>

                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => settle(loan, true)}
                    className="flex min-h-12 w-full items-center justify-center rounded-2xl bg-emerald-800 font-semibold text-white disabled:opacity-60"
                  >
                    {borrow
                      ? t("outsideRepayRemaining")
                      : t("outsideCollectRemaining")}{" "}
                    ·{" "}
                    <span className="ms-1 tabular-nums">
                      <Money
                        amount={loan.remaining}
                        currency={currency}
                        locale={locale}
                      />
                    </span>
                  </button>

                  <details className="rounded-2xl bg-[var(--panel-soft)] px-3 py-2">
                    <summary className="cursor-pointer text-sm font-semibold text-stone-600">
                      {borrow
                        ? t("outsideRepayPartial")
                        : t("outsideCollectPartial")}
                    </summary>
                    <div className="mt-2 space-y-2">
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
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => settle(loan, false)}
                        className="flex min-h-11 w-full items-center justify-center rounded-2xl bg-stone-800 text-sm font-semibold text-white disabled:opacity-60"
                      >
                        {borrow
                          ? t("outsideRepaySave")
                          : t("outsideCollectSave")}
                      </button>
                    </div>
                  </details>
                </div>
              </article>
            );
          })
        )}
      </section>

      <BottomSheet
        open={editingLoan !== null}
        onClose={closeLoanEdit}
        lockDismiss={busy}
        title={t("outsideEditTitle")}
        hint={
          editingLoan && !canEditLoan(editingLoan)
            ? t("outsideEditLocked")
            : t("outsideEditHint")
        }
        footer={
          editingLoan && canEditLoan(editingLoan) ? (
            <div className="space-y-2">
              <button
                type="button"
                disabled={busy || !editPersonName.trim()}
                onClick={() => void saveLoanEdit()}
                className="flex min-h-12 w-full items-center justify-center rounded-2xl bg-stone-900 text-base font-semibold text-white disabled:opacity-60"
              >
                {busy ? t("saving") : t("save")}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  deleteConfirm ? void deleteLoanEdit() : setDeleteConfirm(true)
                }
                className="flex min-h-11 w-full items-center justify-center rounded-2xl bg-red-50 text-sm font-semibold text-red-800 ring-1 ring-red-200 disabled:opacity-60 dark:bg-red-950/30 dark:ring-red-900"
              >
                {deleteConfirm ? t("confirmDelete") : t("deleteItem")}
              </button>
              {deleteConfirm ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setDeleteConfirm(false)}
                  className="w-full py-2 text-sm font-medium text-stone-500"
                >
                  {t("goalsCancel")}
                </button>
              ) : null}
            </div>
          ) : (
            <button
              type="button"
              onClick={closeLoanEdit}
              className="flex min-h-11 w-full items-center justify-center rounded-2xl bg-stone-200 text-sm font-semibold text-stone-800"
            >
              {t("goalsCancel")}
            </button>
          )
        }
      >
        {editingLoan ? (
          <>
            <div className="rounded-2xl bg-[var(--panel-soft)] px-3 py-3">
              <p className="text-center text-xs font-medium text-[var(--muted)]">
                {editingLoan.direction === "BORROW"
                  ? t("outsideDirectionBorrow")
                  : t("outsideDirectionLend")}
              </p>
              <p className="mt-2 text-center text-2xl font-bold tabular-nums">
                <Money
                  amount={editingLoan.remaining}
                  currency={currency}
                  locale={locale}
                />
              </p>
              <p className="mt-1 text-center text-xs text-stone-500">
                {t("outsideRemaining")}
              </p>
            </div>
            {canEditLoan(editingLoan) ? (
              <>
                <label className="block">
                  <span className="mb-1 block text-sm font-medium">
                    {t("outsidePersonName")}
                  </span>
                  <input
                    className="field text-lg"
                    value={editPersonName}
                    onChange={(e) => setEditPersonName(e.target.value)}
                    required
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-sm font-medium">
                    {t("outsideAmount")}
                  </span>
                  <input
                    inputMode="decimal"
                    className="field amount-input text-2xl"
                    value={editAmount}
                    onChange={(e) => setEditAmount(e.target.value)}
                  />
                </label>
                <div>
                  <span className="mb-1 block text-sm font-medium">
                    {t("day")}
                  </span>
                  <DateField
                    value={editOccurredOn}
                    onChange={setEditOccurredOn}
                  />
                </div>
                <label className="block">
                  <span className="mb-1 block text-sm font-medium">
                    {t("noteOptional")}
                  </span>
                  <input
                    className="field text-base"
                    value={editNote}
                    onChange={(e) => setEditNote(e.target.value)}
                  />
                </label>
              </>
            ) : (
              <p className="text-sm text-amber-800">{t("outsideEditLocked")}</p>
            )}
          </>
        ) : null}
      </BottomSheet>

      {data?.settled.length ? (
        <section className="mt-6 space-y-3">
          <h2 className="text-xl font-bold">{t("outsideSettled")}</h2>
          {data.settled.map((loan) => (
            <article
              key={loan.id}
              className="rounded-[1.75rem] border border-stone-200 bg-white/70 px-4 py-3"
            >
              <div className="flex justify-between gap-3">
                <span className="min-w-0">
                  <span className="block font-semibold" dir="auto">
                    {loan.personName}
                  </span>
                  <span className="text-xs text-stone-500">
                    {loan.direction === "BORROW"
                      ? t("outsideDirectionBorrow")
                      : t("outsideDirectionLend")}
                  </span>
                </span>
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
