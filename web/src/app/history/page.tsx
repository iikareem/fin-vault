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
import { formatItemDate, formatItemTime, isoLocal } from "@/lib/calendar";
import { householdPath } from "@/lib/space";
import { DateField } from "@/components/DateField";
import {
  HIDDEN_EXPENSE_CATEGORIES,
  HIDDEN_INCOME_CATEGORIES,
} from "@/lib/category-visibility";
import {
  isLikelyOffline,
  isOfflineNetworkError,
  loadAddSnapshot,
} from "@/lib/offline-queue";
import { isCurrentWallet, isSavingsWallet } from "@/lib/wallets";

type Tx = {
  id: string;
  type: "INCOME" | "EXPENSE" | "REIMBURSEMENT" | "TRACK";
  amount: number;
  note: string;
  createdAt?: string;
  category: {
    id?: string;
    name: string;
    nameAr?: string | null;
    color?: string | null;
  };
  categoryId?: string;
  user: { name: string; nameAr?: string | null };
  account?: { id?: string; name: string; type?: string } | null;
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
  createdAt?: string;
};
type Gift = {
  id: string;
  amount: number;
  note: string;
  memberId: string;
  member: { name: string; nameAr?: string | null };
  type: { name: string };
  createdAt?: string;
};
type DayLog = {
  date: string;
  income: number;
  expense: number;
  txs: Tx[];
  claims: Claim[];
  gifts: Gift[];
};
type Category = {
  id: string;
  name: string;
  nameAr?: string | null;
  kind: string;
  parentId?: string | null;
  color?: string | null;
};

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

function walletLabel(
  account: { name: string } | null | undefined,
  t: (key: MessageKey) => string,
) {
  if (!account) return null;
  if (isSavingsWallet(account)) return t("savingsWallet");
  if (isCurrentWallet(account)) return t("currentWallet");
  return labelFor(account.name, t);
}

function toneDotClass(kind: "in" | "out" | "track" | "claim" | "gift") {
  if (kind === "in") return "bg-emerald-500";
  if (kind === "out") return "bg-rose-500";
  if (kind === "claim") return "bg-amber-500";
  if (kind === "gift") return "bg-teal-500";
  return "bg-stone-400";
}

function amountClass(kind: "in" | "out" | "track" | "claim" | "gift") {
  if (kind === "in") return "text-emerald-700 dark:text-emerald-300";
  if (kind === "out") return "text-rose-700 dark:text-rose-300";
  if (kind === "claim") return "text-amber-900 dark:text-amber-200";
  if (kind === "gift") return "text-teal-900 dark:text-teal-200";
  return "text-[var(--foreground)]";
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
  const [catPickerOpen, setCatPickerOpen] = useState(false);
  const [datePickerOpen, setDatePickerOpen] = useState(false);
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

  // Sync from URL only. Do not snap back to "today" on clock ticks / focus —
  // that made arrow navigation feel broken on other days.
  useEffect(() => {
    if (isIsoDay(onParam)) setDay(onParam);
  }, [onParam]);

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
    setOpenId("");
    setConfirmId("");
    setCatPickerOpen(false);
    setDatePickerOpen(false);
    const params = new URLSearchParams();
    params.set("on", next);
    if (backTo) params.set("back", backTo);
    router.replace(`/history?${params.toString()}`, { scroll: false });
  }

  function startEdit(
    id: string,
    amt: number,
    n: string,
    cat?: string,
  ) {
    if (openId === id) {
      setOpenId("");
      setConfirmId("");
      setCatPickerOpen(false);
      return;
    }
    setOpenId(id);
    setConfirmId("");
    setCatPickerOpen(false);
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
      setCatPickerOpen(false);
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
      setCatPickerOpen(false);
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
      setCatPickerOpen(false);
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
      setCatPickerOpen(false);
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
  const dayLabel = (() => {
    const [y, m, d] = day.split("-").map(Number);
    if (!y || !m || !d) return formatItemDate(day, locale) || day;
    const date = new Date(y, m - 1, d);
    return date.toLocaleDateString(locale === "ar" ? "ar" : "en", {
      weekday: "short",
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  })();

  const ctaStyle = {
    background: "var(--cta-bg)",
    color: "var(--cta-fg)",
  };

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

      <div className={backTo ? "mt-2" : ""}>
        <h1 className="text-[1.65rem] font-bold leading-tight tracking-tight text-[var(--foreground)]">
          {t("eachDay")}
        </h1>
        <p className="mt-1 text-sm text-[var(--muted)]">{t("daysHint")}</p>
      </div>

      <section className="surface mt-4 rounded-[1.5rem] px-2 py-3">
        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-label={t("pickDayHint")}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-xl text-[var(--foreground)] transition hover:bg-[var(--panel-soft)]"
            onClick={() => goDay(shiftDay(day, -1))}
          >
            ‹
          </button>
          <button
            type="button"
            className="min-w-0 flex-1 py-1 text-center"
            onClick={() => setDatePickerOpen((v) => !v)}
          >
            <p className="truncate text-base font-bold tabular-nums text-[var(--foreground)]">
              {dayLabel}
            </p>
          </button>
          <button
            type="button"
            aria-label={t("pickDayHint")}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-xl text-[var(--foreground)] transition hover:bg-[var(--panel-soft)]"
            onClick={() => goDay(shiftDay(day, 1))}
          >
            ›
          </button>
        </div>
        <div className="mt-0.5 flex justify-center">
          <button
            type="button"
            onClick={() => {
              if (!isToday) goDay(cal.today);
            }}
            className={`text-sm font-semibold transition ${
              isToday
                ? "pointer-events-none text-[var(--muted)] opacity-50"
                : "text-[var(--accent-b-text)]"
            }`}
            aria-current={isToday ? "date" : undefined}
          >
            {t("today")}
          </button>
        </div>
        {datePickerOpen ? (
          <DateField
            className="mt-3 px-2"
            value={day}
            onChange={(v) => {
              goDay(v);
              setDatePickerOpen(false);
            }}
          />
        ) : null}
      </section>

      {hideAggregates ? (
        <p className="surface mt-4 rounded-2xl px-4 py-3 text-sm text-[var(--muted)]">
          {t("aggregatesAdminOnly")}
        </p>
      ) : (
        <div className="mt-4">
          <div className="grid grid-cols-2 gap-2.5">
            <div className="surface rounded-[1.35rem] px-3.5 py-3.5">
              <p className="text-xs font-medium text-[var(--muted)]">{t("in")}</p>
              <p className="mt-1 truncate text-xl font-bold tabular-nums text-emerald-700 dark:text-emerald-300">
                <Money amount={income} currency={currency} locale={locale} />
              </p>
            </div>
            <div className="surface rounded-[1.35rem] px-3.5 py-3.5">
              <p className="text-xs font-medium text-[var(--muted)]">{t("out")}</p>
              <p className="mt-1 truncate text-xl font-bold tabular-nums text-rose-700 dark:text-rose-300">
                <Money amount={expense} currency={currency} locale={locale} />
              </p>
            </div>
          </div>
          <p className="mt-2 text-center text-[11px] font-medium text-[var(--muted)]">
            {fill(isToday ? t("dayMovesToday") : t("dayMoves"), {
              n: String(moveCount),
            })}
          </p>
        </div>
      )}

      {offlineMode ? (
        <p className="mt-3 rounded-xl bg-[color-mix(in_srgb,var(--foreground)_6%,transparent)] px-3 py-2 text-sm text-[var(--muted)]">
          {t("offlineNeedsNetwork")}
        </p>
      ) : error ? (
        <p className="mt-3 text-base text-red-700">{error}</p>
      ) : null}

      <div className="mt-5 flex items-baseline justify-between gap-3">
        <h2 className="text-base font-bold text-[var(--foreground)]">
          {t("movesTitle")}
        </h2>
        {!empty && canEditHouse ? (
          <p className="text-xs font-medium text-[var(--muted)]">
            {t("tapRowToEdit")}
          </p>
        ) : null}
      </div>

      {empty ? (
        <div className="mt-8 text-center">
          <p className="text-base text-[var(--muted)]">{t("nothingThisDay")}</p>
        </div>
      ) : (
        <ul className="mt-3 space-y-2">
          {log?.txs.map((tx) => {
            const editing = openId === tx.id;
            const editable = canEditHouse && tx.type !== "REIMBURSEMENT";
            const kind =
              tx.type === "INCOME"
                ? "in"
                : tx.type === "TRACK"
                  ? "track"
                  : "out";
            const wallet = walletLabel(tx.account, t);
            const subParts = [
              tx.note || null,
              tx.type === "TRACK" ? t("trackOnlyBadge") : wallet,
            ].filter(Boolean);
            const timeLabel = formatItemTime(tx.createdAt, locale);
            return (
              <li
                key={tx.id}
                className={`surface overflow-hidden rounded-[1.35rem] transition ${
                  editing ? "ring-2 ring-[var(--accent-b)]" : ""
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
                  <div className="flex items-start gap-3">
                    <span
                      className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${toneDotClass(kind)}`}
                      aria-hidden
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p
                            className="truncate text-base font-bold text-[var(--foreground)]"
                            dir="auto"
                          >
                            {categoryLabel(tx.category, locale, t)}
                          </p>
                          {(() => {
                            const showUser =
                              active?.kind === "HOUSE" &&
                              tx.user.name !== "House";
                            const parts = [
                              showUser ? personLabel(tx.user, locale) : null,
                              ...subParts,
                            ].filter(Boolean);
                            if (parts.length === 0 && !timeLabel) return null;
                            return (
                              <p
                                className="mt-0.5 truncate text-sm text-[var(--muted)]"
                                dir="auto"
                              >
                                {[...parts, timeLabel].filter(Boolean).join(" · ")}
                              </p>
                            );
                          })()}
                        </div>
                        <span
                          className={`shrink-0 text-base font-bold tabular-nums ${amountClass(kind)}`}
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
                    </div>
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
                      locale={locale}
                      setAmount={setAmount}
                      setNote={setNote}
                      setCategoryId={setCategoryId}
                      catPickerOpen={catPickerOpen}
                      setCatPickerOpen={setCatPickerOpen}
                      busy={busy}
                      confirm={confirmId === tx.id}
                      ctaStyle={ctaStyle}
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
            const timeLabel = formatItemTime(c.createdAt, locale);
            return (
              <li
                key={c.id}
                className={`surface overflow-hidden rounded-[1.35rem] transition ${
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
                  <div className="flex items-start gap-3">
                    <span
                      className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${toneDotClass("claim")}`}
                      aria-hidden
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p
                            className="truncate text-base font-bold"
                            dir="auto"
                          >
                            {categoryLabel(c.category, locale, t)}
                          </p>
                          <p
                            className="mt-0.5 truncate text-sm text-[var(--muted)]"
                            dir="auto"
                          >
                            {[
                              t("pocketThatDay"),
                              personLabel(c.member, locale),
                              c.note || null,
                              timeLabel,
                            ]
                              .filter(Boolean)
                              .join(" · ")}
                          </p>
                        </div>
                        <span
                          className={`shrink-0 text-base font-bold tabular-nums ${amountClass("claim")}`}
                        >
                          <Money
                            amount={c.amount}
                            currency={currency}
                            locale={locale}
                          />
                        </span>
                      </div>
                    </div>
                  </div>
                </button>
                {editing ? (
                  <div className="border-t border-[var(--surface-border)] px-3.5 pb-3.5">
                    <EditFields
                      amount={amount}
                      note={note}
                      categoryId={categoryId}
                      categories={expenseCats}
                      t={t}
                      locale={locale}
                      setAmount={setAmount}
                      setNote={setNote}
                      setCategoryId={setCategoryId}
                      catPickerOpen={catPickerOpen}
                      setCatPickerOpen={setCatPickerOpen}
                      busy={busy}
                      confirm={confirmId === c.id}
                      ctaStyle={ctaStyle}
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
            const timeLabel = formatItemTime(g.createdAt, locale);
            return (
              <li
                key={g.id}
                className={`surface overflow-hidden rounded-[1.35rem] transition ${
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
                  <div className="flex items-start gap-3">
                    <span
                      className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${toneDotClass("gift")}`}
                      aria-hidden
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p
                            className="truncate text-base font-bold"
                            dir="auto"
                          >
                            {labelFor(g.type.name, t)}
                          </p>
                          <p
                            className="mt-0.5 truncate text-sm text-[var(--muted)]"
                            dir="auto"
                          >
                            {[
                              t("charityThatDay"),
                              personLabel(g.member, locale),
                              timeLabel,
                            ]
                              .filter(Boolean)
                              .join(" · ")}
                          </p>
                        </div>
                        <span
                          className={`shrink-0 text-base font-bold tabular-nums ${amountClass("gift")}`}
                        >
                          <Money
                            amount={g.amount}
                            currency={currency}
                            locale={locale}
                          />
                        </span>
                      </div>
                    </div>
                  </div>
                </button>
                {editing ? (
                  <div className="border-t border-[var(--surface-border)] px-3.5 pb-3.5">
                    <EditFields
                      amount={amount}
                      note={note}
                      categoryId=""
                      categories={[]}
                      t={t}
                      locale={locale}
                      setAmount={setAmount}
                      setNote={setNote}
                      setCategoryId={setCategoryId}
                      catPickerOpen={false}
                      setCatPickerOpen={setCatPickerOpen}
                      busy={busy}
                      confirm={confirmId === g.id}
                      ctaStyle={ctaStyle}
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
  locale,
  setAmount,
  setNote,
  setCategoryId,
  catPickerOpen,
  setCatPickerOpen,
  busy,
  confirm,
  ctaStyle,
  onSave,
  onDelete,
}: {
  amount: string;
  note: string;
  categoryId: string;
  categories: Category[];
  t: (key: MessageKey) => string;
  locale: "ar" | "en";
  setAmount: (v: string) => void;
  setNote: (v: string) => void;
  setCategoryId: (v: string) => void;
  catPickerOpen: boolean;
  setCatPickerOpen: (v: boolean) => void;
  busy: boolean;
  confirm: boolean;
  ctaStyle: { background: string; color: string };
  onSave: () => void;
  onDelete: () => void;
}) {
  const selected = categories.find((c) => c.id === categoryId);
  const parent = selected?.parentId
    ? categories.find((c) => c.id === selected.parentId)
    : null;
  const breadcrumb = selected
    ? parent
      ? fill(t("categoryBreadcrumb"), {
          group: categoryLabel(parent, locale, t),
          sub: categoryLabel(selected, locale, t),
        })
      : categoryLabel(selected, locale, t)
    : "";

  return (
    <div className="mt-3 space-y-3 pt-3">
      <label className="block">
        <span className="mb-1.5 block text-xs font-medium text-[var(--muted)]">
          {t("amount")}
        </span>
        <input
          inputMode="decimal"
          dir="ltr"
          className="amount-input field !rounded-2xl text-2xl font-bold"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          aria-label={t("amount")}
        />
      </label>

      {categories.length > 0 ? (
        <div>
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-[var(--muted)]">
              {t("forWhat")}
            </span>
            <button
              type="button"
              onClick={() => setCatPickerOpen(!catPickerOpen)}
              className="text-sm font-semibold text-[var(--accent-b-text)]"
            >
              {t("catChange")}
            </button>
          </div>
          {!catPickerOpen ? (
            <button
              type="button"
              onClick={() => setCatPickerOpen(true)}
              className="field flex min-h-12 w-full items-center !rounded-2xl text-start text-sm font-semibold"
            >
              <span className="min-w-0 truncate" dir="auto">
                {breadcrumb || t("forWhat")}
              </span>
            </button>
          ) : (
            <CategoryPicker
              categories={categories}
              value={categoryId}
              onChange={(id) => {
                setCategoryId(id);
                setCatPickerOpen(false);
              }}
            />
          )}
        </div>
      ) : null}

      <label className="block">
        <span className="mb-1.5 block text-xs font-medium text-[var(--muted)]">
          {t("noteOptional")}
        </span>
        <input
          className="field !rounded-2xl text-base"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={t("noteOptional")}
        />
      </label>

      <div className="flex items-center gap-2 pt-1">
        <button
          type="button"
          disabled={busy}
          onClick={onDelete}
          className="flex min-h-12 flex-1 items-center justify-center rounded-[1.25rem] bg-[var(--panel-soft)] text-base font-semibold text-rose-700 ring-1 ring-[var(--input-border)] disabled:opacity-60 dark:text-rose-300"
        >
          {confirm ? t("confirmDelete") : t("deleteItem")}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={onSave}
          className="flex min-h-12 flex-[1.35] items-center justify-center rounded-[1.25rem] text-base font-bold disabled:opacity-60"
          style={ctaStyle}
        >
          {busy ? t("saving") : t("save")}
        </button>
      </div>
    </div>
  );
}
