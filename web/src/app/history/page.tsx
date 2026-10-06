"use client";

import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api, parseAmount } from "@/lib/api";
import { BottomNav } from "@/components/BottomNav";
import { PageShell } from "@/components/PageShell";
import { Money } from "@/components/Money";
import { useI18n } from "@/components/I18nProvider";
import { useBooks } from "@/components/BooksProvider";
import {
  labelFor,
  categoryLabel,
  personLabel,
  fill,
  type MessageKey,
} from "@/lib/i18n";
import { CategoryPicker } from "@/components/CategoryPicker";
import { useCalendarClock } from "@/hooks/useCalendarClock";
import { isoLocal } from "@/lib/calendar";
import { householdPath } from "@/lib/space";
import { DateField } from "@/components/DateField";
import { HIDDEN_EXPENSE_CATEGORIES, HIDDEN_INCOME_CATEGORIES } from "@/lib/category-visibility";
import {
  isLikelyOffline,
  isOfflineNetworkError,
  loadAddSnapshot,
} from "@/lib/offline-queue";

type Tx = {
  id: string;
  type: "INCOME" | "EXPENSE" | "REIMBURSEMENT" | "TRACK";
  amount: number;
  note: string;
  category: { id?: string; name: string; nameAr?: string | null };
  categoryId?: string;
  user: { name: string; nameAr?: string | null };
};
type Claim = {
  id: string;
  amount: number;
  remaining: number;
  note: string;
  status: string;
  memberId: string;
  member: { name: string; nameAr?: string | null };
  category: { name: string; nameAr?: string | null };
  categoryId: string;
};
type Gift = {
  id: string;
  amount: number;
  note: string;
  memberId: string;
  member: { name: string; nameAr?: string | null };
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
type Category = { id: string; name: string; kind: string; parentId?: string | null; color?: string | null };

function shiftDay(day: string, dir: number) {
  const d = new Date(`${day}T12:00:00`);
  d.setDate(d.getDate() + dir);
  return isoLocal(d);
}

function isIsoDay(value: string | null): value is string {
  return !!value && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

/** Only allow returning to category logs (no open redirects). */
function safeCategoryLogBack(raw: string | null): string | null {
  if (!raw) return null;
  try {
    const path = decodeURIComponent(raw);
    if (path.startsWith("/analytics/category-log")) return path;
  } catch {
    /* ignore */
  }
  return null;
}

function HistoryInner() {
  const { t, locale } = useI18n();
  const cal = useCalendarClock();
  const router = useRouter();
  const search = useSearchParams();
  const { active, userId, house } = useBooks();
  const onParam = search.get("on");
  const backTo = safeCategoryLogBack(search.get("back"));
  const [day, setDay] = useState(() =>
    isIsoDay(onParam) ? onParam : cal.today,
  );
  const [log, setLog] = useState<DayLog | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [openId, setOpenId] = useState("");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [confirmId, setConfirmId] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [offlineMode, setOfflineMode] = useState(false);
  const currency = active?.currency ?? "EGP";
  const canEditHouse = active?.kind === "PERSONAL" || active?.role === "ADMIN";
  const hideAggregates = active?.kind === "HOUSE" && house?.role !== "ADMIN";

  function loadDay(hid: string, on: string) {
    return api<DayLog>(householdPath(hid, `/analytics/day?on=${on}`)).then(
      (dayLog) => {
        setLog(dayLog);
        setOfflineMode(false);
      },
    );
  }

  function loadCategories(hid: string) {
    return api<Category[]>(householdPath(hid, "/categories")).then(
      setCategories,
    );
  }

  useEffect(() => {
    if (isIsoDay(onParam)) {
      setDay(onParam);
      return;
    }
    setDay(cal.today);
  }, [cal.today, onParam]);

  // Categories rarely change — fetch once per household, not on every day flip.
  useEffect(() => {
    if (!active) return;
    loadCategories(active.householdId).catch(async (e) => {
      if (isOfflineNetworkError(e) || isLikelyOffline()) {
        const snap = await loadAddSnapshot(active.householdId);
        if (snap?.categories?.length) {
          setCategories(snap.categories as Category[]);
          return;
        }
      }
      setError(e instanceof Error ? e.message : String(e));
    });
  }, [active?.householdId]);

  useEffect(() => {
    if (!active) return;
    setError("");
    if (isLikelyOffline()) {
      setOfflineMode(true);
      setLog(null);
      setError(t("offlineNeedsNetwork"));
      return;
    }
    loadDay(active.householdId, day).catch((e) => {
      if (isOfflineNetworkError(e) || isLikelyOffline()) {
        setOfflineMode(true);
        setLog(null);
        setError(t("offlineNeedsNetwork"));
        return;
      }
      setError(e instanceof Error ? e.message : String(e));
    });
  }, [active?.householdId, day, t]);

  function goDay(next: string) {
    setDay(next);
    if (backTo || isIsoDay(onParam)) {
      const params = new URLSearchParams();
      params.set("on", next);
      if (backTo) params.set("back", backTo);
      router.replace(`/history?${params.toString()}`, { scroll: false });
    }
  }

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
      await loadDay(active.householdId, day);
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
      await loadDay(active.householdId, day);
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
      await loadDay(active.householdId, day);
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
      await loadDay(active.householdId, day);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("couldNotSave"));
    } finally {
      setBusy(false);
    }
  }

  const expenseCats = categories.filter(
    (c) => c.kind === "EXPENSE" && !HIDDEN_EXPENSE_CATEGORIES.has(c.name),
  );
  const moveCount =
    (log?.txs.length ?? 0) + (log?.claims.length ?? 0) + (log?.gifts.length ?? 0);
  const empty = !log || moveCount === 0;
  const income = log?.income ?? 0;
  const expense = log?.expense ?? 0;
  const isToday = day === cal.today;

  return (
    <PageShell>
      {backTo ? (
        <Link
          href={backTo}
          className="inline-flex items-center gap-1 text-sm font-semibold text-[var(--muted)]"
        >
          ← {t("backToCategoryLogs")}
        </Link>
      ) : null}
      <h1 className={`text-lg font-semibold ${backTo ? "mt-2" : ""}`}>
        {t("eachDay")}
      </h1>

      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          aria-label={t("pickDayHint")}
          className="icon-btn shrink-0 px-3 text-xl"
          onClick={() => goDay(shiftDay(day, -1))}
        >
          ‹
        </button>
        <div className="min-w-0 flex-1">
          <DateField align="center" value={day} onChange={goDay} />
        </div>
        <button
          type="button"
          aria-label={t("pickDayHint")}
          className="icon-btn shrink-0 px-3 text-xl"
          onClick={() => goDay(shiftDay(day, 1))}
        >
          ›
        </button>
      </div>
      {!isToday ? (
        <div className="mt-2 flex justify-center">
          <button
            type="button"
            onClick={() => goDay(cal.today)}
            className="chip text-sm"
          >
            {t("jumpToday")}
          </button>
        </div>
      ) : null}

      {hideAggregates ? (
        <p className="surface mt-4 rounded-2xl px-4 py-3 text-sm text-[var(--muted)]">
          {t("aggregatesAdminOnly")}
        </p>
      ) : (
        <section className="surface mt-4 rounded-[1.5rem] p-3.5">
          <div className="grid grid-cols-2 gap-3">
            <div className="min-w-0">
              <p className="text-xs font-medium text-[var(--muted)]">{t("in")}</p>
              <p className="mt-0.5 truncate text-xl font-bold tabular-nums text-emerald-800">
                <Money amount={income} currency={currency} locale={locale} />
              </p>
            </div>
            <div className="min-w-0">
              <p className="text-xs font-medium text-[var(--muted)]">{t("out")}</p>
              <p className="mt-0.5 truncate text-xl font-bold tabular-nums text-red-800">
                <Money amount={expense} currency={currency} locale={locale} />
              </p>
            </div>
          </div>
          <p className="mt-2 text-[11px] font-medium text-[var(--muted)]">
            {fill(t("dayMoves"), { n: String(moveCount) })}
          </p>
        </section>
      )}

      {offlineMode ? (
        <p className="mt-3 rounded-xl bg-[color-mix(in_srgb,var(--foreground)_6%,transparent)] px-3 py-2 text-sm text-[var(--muted)]">
          {t("offlineNeedsNetwork")}
        </p>
      ) : error ? (
        <p className="mt-3 text-base text-red-700">{error}</p>
      ) : null}


      {empty ? (
        <div className="mt-10 text-center">
          <p className="text-base text-[var(--muted)]">{t("nothingThisDay")}</p>
        </div>
      ) : (
        <ul className="mt-5 space-y-2">
          {log?.txs.map((tx) => {
            const editing = openId === tx.id;
            const editable =
              canEditHouse && tx.type !== "REIMBURSEMENT";
            return (
              <li
                key={tx.id}
                className={`list-row overflow-hidden !p-0 ${
                  editing ? "ring-2 ring-[var(--input-focus)]" : ""
                }`}
              >
                <button
                  type="button"
                  className="w-full px-3.5 py-3 text-start"
                  onClick={() =>
                    editable
                      ? startEdit(
                          tx.id,
                          tx.amount,
                          tx.note,
                          tx.categoryId ?? tx.category.id,
                        )
                      : undefined
                  }
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-base font-bold" dir="auto">
                        {categoryLabel(tx.category, locale, t)}
                      </p>
                      {tx.type === "TRACK" ? (
                        <span className="mt-1 inline-flex rounded-full bg-[var(--panel-soft)] px-2 py-0.5 text-[10px] font-semibold text-[var(--muted)]">
                          {t("trackOnlyBadge")}
                        </span>
                      ) : null}
                      {(() => {
                        const showUser =
                          active?.kind === "HOUSE" && tx.user.name !== "House";
                        const parts = [
                          showUser ? personLabel(tx.user, locale) : null,
                          tx.note || null,
                        ].filter(Boolean);
                        if (parts.length === 0) return null;
                        return (
                          <p
                            className="mt-1 truncate text-sm text-[var(--muted)]"
                            dir="auto"
                          >
                            {parts.join(" · ")}
                          </p>
                        );
                      })()}
                    </div>
                    <span
                      className={`shrink-0 text-base font-bold tabular-nums ${
                        tx.type === "INCOME"
                          ? "text-emerald-800"
                          : tx.type === "TRACK"
                            ? "text-[var(--foreground)]"
                            : "text-red-800"
                      }`}
                    >
                      <Money
                        amount={tx.amount}
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
                </button>
                {editing ? (
                  <div className="border-t border-[var(--surface-border)] px-3.5 pb-3.5">
                    <EditFields
                      amount={amount}
                      note={note}
                      categoryId={categoryId}
                      categories={
                        tx.type === "INCOME"
                          ? categories.filter(
                              (c) =>
                                c.kind === "INCOME" &&
                                !HIDDEN_INCOME_CATEGORIES.has(c.name),
                            )
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
                  </div>
                ) : null}
              </li>
            );
          })}
          {log?.claims.map((c) => {
            const editing = openId === c.id;
            const mine = c.memberId === userId || canEditHouse;
            return (
              <li
                key={c.id}
                className={`overflow-hidden rounded-2xl border border-amber-200/80 bg-amber-50/90 shadow-sm ${
                  editing ? "ring-2 ring-amber-400" : ""
                }`}
              >
                <button
                  type="button"
                  className="w-full px-3.5 py-3 text-start"
                  onClick={() =>
                    mine && c.remaining > 0.001
                      ? startEdit(c.id, c.amount, c.note, c.categoryId)
                      : undefined
                  }
                >
                  <span className="inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-900">
                    {t("pocketThatDay")}
                  </span>
                  <div className="mt-1.5 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-base font-bold" dir="auto">
                        {personLabel(c.member, locale)} · {categoryLabel(c.category, locale, t)}
                      </p>
                      {c.note ? (
                        <p
                          className="mt-1 truncate text-sm text-amber-900/70"
                          dir="auto"
                        >
                          {c.note}
                        </p>
                      ) : null}
                    </div>
                    <span className="shrink-0 text-base font-bold tabular-nums text-amber-950">
                      <Money
                        amount={c.amount}
                        currency={currency}
                        locale={locale}
                      />
                    </span>
                  </div>
                </button>
                {editing ? (
                  <div className="border-t border-amber-200/80 px-3.5 pb-3.5">
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
                  </div>
                ) : null}
              </li>
            );
          })}
          {log?.gifts.map((g) => {
            const editing = openId === g.id;
            const mine = g.memberId === userId || canEditHouse;
            return (
              <li
                key={g.id}
                className={`overflow-hidden rounded-2xl border border-teal-200/80 bg-teal-50/90 shadow-sm ${
                  editing ? "ring-2 ring-teal-400" : ""
                }`}
              >
                <button
                  type="button"
                  className="w-full px-3.5 py-3 text-start"
                  onClick={() =>
                    mine ? startEdit(g.id, g.amount, g.note) : undefined
                  }
                >
                  <span className="inline-flex rounded-full bg-teal-100 px-2 py-0.5 text-[10px] font-bold text-teal-900">
                    {t("charityThatDay")}
                  </span>
                  <div className="mt-1.5 flex items-start justify-between gap-3">
                    <p className="min-w-0 truncate text-base font-bold" dir="auto">
                      {personLabel(g.member, locale)} ·{" "}
                      {labelFor(g.type.name, t)}
                    </p>
                    <span className="shrink-0 text-base font-bold tabular-nums text-teal-950">
                      <Money
                        amount={g.amount}
                        currency={currency}
                        locale={locale}
                      />
                    </span>
                  </div>
                </button>
                {editing ? (
                  <div className="border-t border-teal-200/80 px-3.5 pb-3.5">
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
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
      <BottomNav />
    </PageShell>
  );
}

export default function HistoryPage() {
  return (
    <Suspense fallback={null}>
      <HistoryInner />
    </Suspense>
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
    <div className="mt-3 space-y-3 pt-3">
      <input
        inputMode="decimal"
        dir="ltr"
        className="amount-input field text-2xl"
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
        className="field text-base"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder={t("noteOptional")}
      />
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={onSave}
          className="flex min-h-12 items-center justify-center rounded-2xl bg-stone-900 text-base font-bold text-white disabled:opacity-60"
        >
          {busy ? t("saving") : t("save")}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={onDelete}
          className="flex min-h-12 items-center justify-center rounded-2xl bg-red-800 text-base font-bold text-white disabled:opacity-60"
        >
          {confirm ? t("confirmDelete") : t("deleteItem")}
        </button>
      </div>
    </div>
  );
}
