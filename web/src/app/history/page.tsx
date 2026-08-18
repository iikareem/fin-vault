"use client";

import { useEffect, useState } from "react";
import { api, parseAmount } from "@/lib/api";
import { BottomNav } from "@/components/BottomNav";
import { PageShell } from "@/components/PageShell";
import { Money } from "@/components/Money";
import { useI18n } from "@/components/I18nProvider";
import { useBooks } from "@/components/BooksProvider";
import { labelFor, type MessageKey } from "@/lib/i18n";
import { CategoryPicker } from "@/components/CategoryPicker";
import { useCalendarClock } from "@/hooks/useCalendarClock";
import { formatItemDate, isoLocal } from "@/lib/calendar";
import { householdPath } from "@/lib/space";
import { Hint } from "@/components/Hint";

type Tx = {
  id: string;
  type: "INCOME" | "EXPENSE" | "REIMBURSEMENT";
  amount: number;
  note: string;
  category: { id?: string; name: string };
  categoryId?: string;
  user: { name: string };
};
type Claim = {
  id: string;
  amount: number;
  remaining: number;
  note: string;
  status: string;
  memberId: string;
  member: { name: string };
  category: { name: string };
  categoryId: string;
};
type Gift = {
  id: string;
  amount: number;
  note: string;
  memberId: string;
  member: { name: string };
  type: { name: string };
};
type DayLog = {
  date: string;
  income: number;
  expense: number;
  txs: Tx[];
  claims: Claim[];
  gifts: Gift[];
};
type Category = { id: string; name: string; kind: string; parentId?: string | null };

function shiftDay(day: string, dir: number) {
  const d = new Date(`${day}T12:00:00`);
  d.setDate(d.getDate() + dir);
  return isoLocal(d);
}

export default function HistoryPage() {
  const { t, locale } = useI18n();
  const cal = useCalendarClock();
  const { active, userId, house } = useBooks();
  const [day, setDay] = useState(cal.today);
  const [log, setLog] = useState<DayLog | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [openId, setOpenId] = useState("");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [confirmId, setConfirmId] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const currency = active?.currency ?? "EGP";
  const canEditHouse = active?.kind === "PERSONAL" || active?.role === "ADMIN";
  const hideAggregates = active?.kind === "HOUSE" && house?.role !== "ADMIN";

  function load(hid: string, on: string) {
    return Promise.all([
      api<DayLog>(householdPath(hid, `/analytics/day?on=${on}`)),
      api<Category[]>(householdPath(hid, "/categories")),
    ]).then(([d, c]) => {
      setLog(d);
      setCategories(c);
    });
  }

  useEffect(() => {
    setDay(cal.today);
  }, [cal.today]);

  useEffect(() => {
    if (!active) return;
    load(active.householdId, day).catch((e) => setError(e.message));
  }, [active?.householdId, day]);

  function startEdit(
    id: string,
    amt: number,
    n: string,
    cat?: string,
  ) {
    setOpenId(id);
    setConfirmId("");
    setAmount(String(amt));
    setNote(n);
    setCategoryId(cat ?? "");
  }

  async function saveTx(id: string) {
    if (!active) return;
    setBusy(true);
    setError("");
    try {
      await api(householdPath(active.householdId, `/transactions/${id}`), {
        method: "PATCH",
        body: JSON.stringify({
          amount: parseAmount(amount),
          note,
          ...(categoryId ? { categoryId } : {}),
        }),
      });
      setOpenId("");
      await load(active.householdId, day);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("couldNotSave"));
    } finally {
      setBusy(false);
    }
  }

  async function saveClaim(id: string) {
    if (!active) return;
    setBusy(true);
    setError("");
    try {
      await api(householdPath(active.householdId, `/claims/${id}`), {
        method: "PATCH",
        body: JSON.stringify({
          amount: parseAmount(amount),
          note,
          ...(categoryId ? { categoryId } : {}),
        }),
      });
      setOpenId("");
      await load(active.householdId, day);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("couldNotSave"));
    } finally {
      setBusy(false);
    }
  }

  async function saveGift(id: string) {
    if (!active) return;
    setBusy(true);
    setError("");
    try {
      await api(householdPath(active.householdId, `/charity/gifts/${id}`), {
        method: "PATCH",
        body: JSON.stringify({ amount: parseAmount(amount), note }),
      });
      setOpenId("");
      await load(active.householdId, day);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("couldNotSave"));
    } finally {
      setBusy(false);
    }
  }

  async function remove(path: string) {
    if (!active) return;
    setBusy(true);
    setError("");
    try {
      await api(householdPath(active.householdId, path), { method: "DELETE" });
      setOpenId("");
      setConfirmId("");
      await load(active.householdId, day);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("couldNotSave"));
    } finally {
      setBusy(false);
    }
  }

  const expenseCats = categories.filter((c) => c.kind === "EXPENSE");
  const empty =
    !log ||
    (log.txs.length === 0 && log.claims.length === 0 && log.gifts.length === 0);

  return (
    <PageShell>
      <h1 className="text-2xl font-bold leading-tight sm:text-3xl">
        {t("eachDay")}
      </h1>
      <Hint>{t("daysHint")}</Hint>
      <div className="mt-4 flex items-center gap-2">
        <button
          type="button"
          aria-label={t("pickDayHint")}
          className="min-h-16 rounded-3xl bg-white px-5 text-3xl font-bold shadow-sm"
          onClick={() => setDay((d) => shiftDay(d, -1))}
        >
          ‹
        </button>
        <label className="relative flex min-h-16 min-w-0 flex-1 cursor-pointer flex-col items-center justify-center rounded-3xl border border-stone-300 bg-white px-3 py-2 shadow-sm">
          <time
            dateTime={day}
            className="text-center text-xl font-bold leading-tight text-stone-900 sm:text-2xl"
          >
            {formatItemDate(day, locale)}
          </time>
          <span className="mt-0.5 text-xs font-medium text-stone-500">
            {day}
          </span>
          <input
            type="date"
            className="absolute inset-0 cursor-pointer opacity-0"
            value={day}
            onChange={(e) => setDay(e.target.value)}
            aria-label={t("pickDayHint")}
          />
        </label>
        <button
          type="button"
          aria-label={t("pickDayHint")}
          className="min-h-16 rounded-3xl bg-white px-5 text-3xl font-bold shadow-sm"
          onClick={() => setDay((d) => shiftDay(d, 1))}
        >
          ›
        </button>
      </div>
      <Hint>{t("pickDayHint")}</Hint>
      {hideAggregates ? (
        <p className="mt-4 rounded-3xl bg-white px-4 py-3 text-sm text-stone-500 shadow-sm">
          {t("aggregatesAdminOnly")}
        </p>
      ) : (
        <div className="mt-4 grid grid-cols-2 gap-3">
          <div className="rounded-3xl bg-white p-4 shadow-sm">
            <p className="text-lg text-stone-500">{t("in")}</p>
            <p className="text-2xl font-bold text-emerald-800">
              <Money
                amount={log?.income ?? 0}
                currency={currency}
                locale={locale}
              />
            </p>
            <Hint>{t("dayInHint")}</Hint>
          </div>
          <div className="rounded-3xl bg-white p-4 shadow-sm">
            <p className="text-lg text-stone-500">{t("out")}</p>
            <p className="text-2xl font-bold text-red-800">
              <Money
                amount={log?.expense ?? 0}
                currency={currency}
                locale={locale}
              />
            </p>
            <Hint>{t("dayOutHint")}</Hint>
          </div>
        </div>
      )}
      {error ? <p className="mt-3 text-lg text-red-700">{error}</p> : null}

      {empty ? (
        <p className="mt-8 text-xl text-stone-500">{t("nothingThisDay")}</p>
      ) : (
        <>
        <Hint>{t("daysListHint")}</Hint>
        <ul className="mt-6 space-y-3">
          {log?.txs.map((tx) => {
            const editing = openId === tx.id;
            return (
              <li key={tx.id} className="rounded-3xl bg-white p-4 shadow-sm">
                <button
                  type="button"
                  className="w-full text-start"
                  onClick={() =>
                    canEditHouse && tx.type !== "REIMBURSEMENT"
                      ? startEdit(
                          tx.id,
                          tx.amount,
                          tx.note,
                          tx.categoryId ?? tx.category.id,
                        )
                      : undefined
                  }
                >
                  <div className="money-row text-xl">
                    <span className="font-bold" dir="auto">
                      {labelFor(tx.category.name, t)}
                    </span>
                    <span
                      className={
                        tx.type === "INCOME"
                          ? "font-bold text-emerald-800"
                          : "font-bold text-red-800"
                      }
                    >
                      <Money
                        amount={tx.amount}
                        currency={currency}
                        locale={locale}
                        extraSign={tx.type === "INCOME" ? "+" : "−"}
                      />
                    </span>
                  </div>
                  {tx.user.name === "House" && !tx.note ? null : (
                    <p className="mt-1 text-stone-500">
                      {tx.user.name === "House"
                        ? tx.note
                        : [labelFor(tx.user.name, t), tx.note || null]
                            .filter(Boolean)
                            .join(" · ")}
                    </p>
                  )}
                </button>
                {editing ? (
                  <EditFields
                    amount={amount}
                    note={note}
                    categoryId={categoryId}
                    categories={
                      tx.type === "INCOME"
                        ? categories.filter((c) => c.kind === "INCOME")
                        : expenseCats
                    }
                    t={t}
                    setAmount={setAmount}
                    setNote={setNote}
                    setCategoryId={setCategoryId}
                    busy={busy}
                    confirm={confirmId === tx.id}
                    onSave={() => saveTx(tx.id)}
                    onDelete={() =>
                      confirmId === tx.id
                        ? remove(`/transactions/${tx.id}`)
                        : setConfirmId(tx.id)
                    }
                  />
                ) : null}
              </li>
            );
          })}
          {log?.claims.map((c) => {
            const editing = openId === c.id;
            const mine = c.memberId === userId || canEditHouse;
            return (
              <li key={c.id} className="rounded-3xl bg-amber-50 p-4 shadow-sm">
                <button
                  type="button"
                  className="w-full text-start"
                  onClick={() =>
                    mine && c.remaining > 0.001
                      ? startEdit(c.id, c.amount, c.note, c.categoryId)
                      : undefined
                  }
                >
                  <p className="text-lg font-bold">{t("pocketThatDay")}</p>
                  <div className="money-row text-xl">
                    <span dir="auto">
                      {c.member.name} · {labelFor(c.category.name, t)}
                    </span>
                    <span className="font-bold">
                      <Money
                        amount={c.amount}
                        currency={currency}
                        locale={locale}
                      />
                    </span>
                  </div>
                  {c.note ? <p className="text-stone-600">{c.note}</p> : null}
                </button>
                {editing ? (
                  <EditFields
                    amount={amount}
                    note={note}
                    categoryId={categoryId}
                    categories={expenseCats}
                    t={t}
                    setAmount={setAmount}
                    setNote={setNote}
                    setCategoryId={setCategoryId}
                    busy={busy}
                    confirm={confirmId === c.id}
                    onSave={() => saveClaim(c.id)}
                    onDelete={() =>
                      confirmId === c.id
                        ? remove(`/claims/${c.id}`)
                        : setConfirmId(c.id)
                    }
                  />
                ) : null}
              </li>
            );
          })}
          {log?.gifts.map((g) => {
            const editing = openId === g.id;
            const mine = g.memberId === userId || canEditHouse;
            return (
              <li key={g.id} className="rounded-3xl bg-teal-50 p-4 shadow-sm">
                <button
                  type="button"
                  className="w-full text-start"
                  onClick={() =>
                    mine ? startEdit(g.id, g.amount, g.note) : undefined
                  }
                >
                  <p className="text-lg font-bold">{t("charityThatDay")}</p>
                  <div className="money-row text-xl">
                    <span dir="auto">
                      {labelFor(g.member.name, t)} · {labelFor(g.type.name, t)}
                    </span>
                    <span className="font-bold">
                      <Money
                        amount={g.amount}
                        currency={currency}
                        locale={locale}
                      />
                    </span>
                  </div>
                </button>
                {editing ? (
                  <EditFields
                    amount={amount}
                    note={note}
                    categoryId=""
                    categories={[]}
                    t={t}
                    setAmount={setAmount}
                    setNote={setNote}
                    setCategoryId={setCategoryId}
                    busy={busy}
                    confirm={confirmId === g.id}
                    onSave={() => saveGift(g.id)}
                    onDelete={() =>
                      confirmId === g.id
                        ? remove(`/charity/gifts/${g.id}`)
                        : setConfirmId(g.id)
                    }
                  />
                ) : null}
              </li>
            );
          })}
        </ul>
        </>
      )}
      <BottomNav />
    </PageShell>
  );
}

function EditFields({
  amount,
  note,
  categoryId,
  categories,
  t,
  setAmount,
  setNote,
  setCategoryId,
  busy,
  confirm,
  onSave,
  onDelete,
}: {
  amount: string;
  note: string;
  categoryId: string;
  categories: Category[];
  t: (key: MessageKey) => string;
  setAmount: (v: string) => void;
  setNote: (v: string) => void;
  setCategoryId: (v: string) => void;
  busy: boolean;
  confirm: boolean;
  onSave: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="mt-4 space-y-3 border-t border-stone-200 pt-4">
      <input
        inputMode="decimal"
        dir="ltr"
        className="amount-input w-full rounded-2xl border border-stone-300 px-4 py-4 text-3xl"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        aria-label={t("amount")}
      />
      {categories.length > 0 ? (
        <CategoryPicker
          categories={categories}
          value={categoryId}
          onChange={setCategoryId}
        />
      ) : null}
      <input
        className="w-full rounded-2xl border border-stone-300 px-4 py-4 text-xl"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder={t("noteOptional")}
      />
      <button
        type="button"
        disabled={busy}
        onClick={onSave}
        className="flex min-h-14 w-full items-center justify-center rounded-2xl bg-stone-900 text-xl font-bold text-white"
      >
        {busy ? t("saving") : t("save")}
      </button>
      <button
        type="button"
        disabled={busy}
        onClick={onDelete}
        className="flex min-h-14 w-full items-center justify-center rounded-2xl bg-red-800 text-xl font-bold text-white"
      >
        {confirm ? t("confirmDelete") : t("deleteItem")}
      </button>
    </div>
  );
}
