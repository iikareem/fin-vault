"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { api, parseAmount, todayISO } from "@/lib/api";
import { BottomNav } from "@/components/BottomNav";
import { PageShell } from "@/components/PageShell";
import { Money } from "@/components/Money";
import { useI18n } from "@/components/I18nProvider";
import { useBooks } from "@/components/BooksProvider";
import { householdPath } from "@/lib/space";
import { Hint } from "@/components/Hint";
import { ItemDate } from "@/components/ItemDate";
import { CategoryPicker } from "@/components/CategoryPicker";
import {
  isCashWallet,
  isCurrentWallet,
  sortCashWallets,
} from "@/lib/wallets";
import { fill, categoryLabel, type MessageKey } from "@/lib/i18n";
import { HIDDEN_EXPENSE_CATEGORIES } from "@/lib/category-visibility";

type Account = { id: string; name: string; type?: string };
type Category = {
  id: string;
  name: string;
  nameAr?: string | null;
  kind: "EXPENSE" | "INCOME" | "PEER";
  parentId?: string | null;
  color?: string | null;
  emoji?: string | null;
};

type SubStatus = "paid" | "due" | "upcoming" | "overdue";
type SubKind = "SUBSCRIPTION" | "INSTALLMENT" | "CHARITY" | "OTHER";

const KIND_OPTIONS: SubKind[] = [
  "SUBSCRIPTION",
  "INSTALLMENT",
  "CHARITY",
  "OTHER",
];

type Subscription = {
  id: string;
  name: string;
  amount: number;
  billingDay: number;
  kind: SubKind;
  totalInstallments: number | null;
  installmentsPaid: number;
  remainingInstallments: number | null;
  categoryId: string;
  accountId: string;
  note: string;
  color: string;
  active: boolean;
  dueOn: string;
  status: SubStatus;
  category: {
    id: string;
    name: string;
    nameAr?: string | null;
    color: string;
    emoji?: string | null;
  };
  account: { id: string; name: string };
  payment: {
    id: string;
    periodKey: string;
    amount: number;
    paidOn: string;
    transactionId: string;
  } | null;
};

type SubsSummary = {
  periodKey: string;
  periodFrom: string;
  periodTo: string;
  monthlyTotal: number;
  paidCount: number;
  unpaidCount: number;
  paidAmount: number;
  dueAmount: number;
  subscriptions: Subscription[];
};

const ACCENT_COLORS = [
  "#4f46e5",
  "#0369a1",
  "#0f766e",
  "#b45309",
  "#be123c",
  "#7c3aed",
];

function ProgressRing({
  paid,
  total,
  color,
  label,
}: {
  paid: number;
  total: number;
  color: string;
  label: string;
}) {
  const pct = total > 0 ? Math.min(100, Math.round((paid / total) * 100)) : 0;
  const r = 36;
  const c = 2 * Math.PI * r;
  const offset = c - (pct / 100) * c;
  return (
    <div className="relative h-24 w-24 shrink-0">
      <svg viewBox="0 0 88 88" className="h-full w-full -rotate-90">
        <circle
          cx="44"
          cy="44"
          r={r}
          fill="none"
          stroke="var(--panel-soft)"
          strokeWidth="8"
        />
        <circle
          cx="44"
          cy="44"
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
          className="transition-[stroke-dashoffset] duration-700 ease-out"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-lg font-bold tabular-nums leading-none">
          {paid}/{total}
        </span>
        <span className="mt-0.5 text-[10px] font-medium uppercase tracking-wide text-[var(--muted)]">
          {label}
        </span>
      </div>
    </div>
  );
}

function statusTone(status: SubStatus) {
  switch (status) {
    case "paid":
      return "bg-emerald-500/15 text-emerald-800 dark:text-emerald-300";
    case "overdue":
      return "bg-red-500/15 text-red-800 dark:text-red-300";
    case "due":
      return "bg-amber-500/15 text-amber-900 dark:text-amber-300";
    default:
      return "bg-[var(--panel-soft)] text-[var(--muted)]";
  }
}

function kindLabel(kind: SubKind, t: (key: MessageKey) => string) {
  if (kind === "INSTALLMENT") return t("subsKindInstallment");
  if (kind === "CHARITY") return t("subsKindCharity");
  if (kind === "OTHER") return t("subsKindOther");
  return t("subsKindSubscription");
}

/** Prefer the matching seeded category for each commitment kind. */
function categoryIdForKind(kind: SubKind, cats: Category[]): string | undefined {
  const preferred: Record<SubKind, string[]> = {
    SUBSCRIPTION: ["Subscriptions"],
    CHARITY: ["Charity & sadaqah", "Charity"],
    INSTALLMENT: ["Installments"],
    OTHER: ["Other"],
  };
  for (const name of preferred[kind]) {
    const hit = cats.find(
      (c) =>
        c.kind === "EXPENSE" &&
        !HIDDEN_EXPENSE_CATEGORIES.has(c.name) &&
        (c.name === name || c.name.toLowerCase() === name.toLowerCase()),
    );
    if (hit) return hit.id;
  }
  return undefined;
}

export default function SubscriptionsPage() {
  const { t, locale } = useI18n();
  const { personal, setKind } = useBooks();
  const currency = personal?.currency ?? "EGP";
  const hid = personal?.householdId ?? "";

  const [data, setData] = useState<SubsSummary | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [billingDay, setBillingDay] = useState(1);
  const [kind, setKindForm] = useState<SubKind>("SUBSCRIPTION");
  const [totalInstallments, setTotalInstallments] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [accountId, setAccountId] = useState("");
  const [note, setNote] = useState("");
  const [color, setColor] = useState(ACCENT_COLORS[0]);
  const [showAdd, setShowAdd] = useState(false);

  const [confirmPayId, setConfirmPayId] = useState("");
  const [payAccountId, setPayAccountId] = useState("");
  const [payingId, setPayingId] = useState("");
  const [unpayingId, setUnpayingId] = useState("");
  const [confirmUnpayId, setConfirmUnpayId] = useState("");
  const [editId, setEditId] = useState("");
  const [editName, setEditName] = useState("");
  const [editAmount, setEditAmount] = useState("");
  const [editDay, setEditDay] = useState(1);
  const [editKind, setEditKind] = useState<SubKind>("SUBSCRIPTION");
  const [editTotalInstallments, setEditTotalInstallments] = useState("");
  const [editCategoryId, setEditCategoryId] = useState("");
  const [editAccountId, setEditAccountId] = useState("");
  const [editNote, setEditNote] = useState("");
  const [editColor, setEditColor] = useState(ACCENT_COLORS[0]);
  const [deletingId, setDeletingId] = useState("");
  const [togglingId, setTogglingId] = useState("");

  const expenseCats = useMemo(
    () =>
      categories.filter(
        (c) => c.kind === "EXPENSE" && !HIDDEN_EXPENSE_CATEGORIES.has(c.name),
      ),
    [categories],
  );

  function applyKindCategory(
    nextKind: SubKind,
    setCat: (id: string) => void,
    cats: Category[] = categories,
  ) {
    const id = categoryIdForKind(nextKind, cats);
    if (id) setCat(id);
  }

  function selectAddKind(next: SubKind) {
    setKindForm(next);
    applyKindCategory(next, setCategoryId);
    if (next !== "INSTALLMENT") setTotalInstallments("");
  }

  function selectEditKind(next: SubKind) {
    setEditKind(next);
    applyKindCategory(next, setEditCategoryId);
    if (next !== "INSTALLMENT") setEditTotalInstallments("");
  }

  function load(householdId: string) {
    return Promise.all([
      api<SubsSummary>(householdPath(householdId, "/subscriptions")),
      api<Account[]>(householdPath(householdId, "/accounts")),
      api<Category[]>(householdPath(householdId, "/categories")),
    ]).then(([summary, list, cats]) => {
      setData(summary);
      const cash = sortCashWallets(list.filter(isCashWallet));
      setAccounts(cash);
      setCategories(cats);
      const current = cash.find(isCurrentWallet) ?? cash[0];
      if (current) {
        setAccountId((prev) => prev || current.id);
      }
      setCategoryId((prev) => {
        if (prev) return prev;
        return (
          categoryIdForKind("SUBSCRIPTION", cats) ||
          cats.find(
            (c) =>
              c.kind === "EXPENSE" && !HIDDEN_EXPENSE_CATEGORIES.has(c.name),
          )?.id ||
          ""
        );
      });
    });
  }

  useEffect(() => {
    if (!personal) return;
    setKind("PERSONAL");
    load(personal.householdId).catch((e) => setError(e.message));
  }, [personal?.householdId]);

  const unpaid = useMemo(
    () =>
      (data?.subscriptions ?? [])
        .filter((s) => s.active && s.status !== "paid")
        .sort((a, b) => {
          const rank = (s: SubStatus) =>
            s === "overdue" ? 0 : s === "due" ? 1 : 2;
          return rank(a.status) - rank(b.status) || a.dueOn.localeCompare(b.dueOn);
        }),
    [data],
  );
  const paid = useMemo(
    () =>
      (data?.subscriptions ?? []).filter(
        (s) => s.active && s.status === "paid",
      ),
    [data],
  );
  const closedInstallments = useMemo(
    () =>
      (data?.subscriptions ?? []).filter(
        (s) => !s.active && s.kind === "INSTALLMENT",
      ),
    [data],
  );

  function statusLabel(status: SubStatus) {
    if (status === "paid") return t("subsStatusPaid");
    if (status === "overdue") return t("subsStatusOverdue");
    if (status === "due") return t("subsStatusDue");
    return t("subsStatusUpcoming");
  }

  async function onAdd(e: FormEvent) {
    e.preventDefault();
    if (!personal) return;
    const amt = parseAmount(amount);
    if (!name.trim()) {
      setError(t("subsNameHint"));
      return;
    }
    if (!(amt > 0)) {
      setError(t("subsAmountHint"));
      return;
    }
    if (!categoryId || !accountId) {
      setError(t("subsPickWalletCat"));
      return;
    }
    const monthsRaw = totalInstallments.trim();
    const installments =
      kind === "INSTALLMENT" && monthsRaw
        ? Math.trunc(Number(monthsRaw))
        : undefined;
    if (
      kind === "INSTALLMENT" &&
      monthsRaw &&
      !(installments && installments >= 1)
    ) {
      setError(t("subsInstallmentsHint"));
      return;
    }
    setBusy(true);
    setError("");
    try {
      const next = await api<SubsSummary>(
        householdPath(personal.householdId, "/subscriptions"),
        {
          method: "POST",
          body: JSON.stringify({
            name: name.trim(),
            amount: amt,
            billingDay,
            kind,
            ...(kind === "INSTALLMENT" && installments
              ? { totalInstallments: installments }
              : {}),
            categoryId,
            accountId,
            note: note.trim() || undefined,
            color,
          }),
        },
      );
      setData(next);
      setName("");
      setAmount("");
      setNote("");
      setKindForm("SUBSCRIPTION");
      setTotalInstallments("");
      applyKindCategory("SUBSCRIPTION", setCategoryId);
      setShowAdd(false);
      setColor(
        ACCENT_COLORS[(next.subscriptions.length || 0) % ACCENT_COLORS.length],
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : t("couldNotSave"));
    } finally {
      setBusy(false);
    }
  }

  function openPay(sub: Subscription) {
    setConfirmPayId(sub.id);
    setConfirmUnpayId("");
    setPayAccountId(sub.accountId || accountId);
    setError("");
  }

  async function confirmPay(id: string) {
    if (!personal) return;
    setPayingId(id);
    setError("");
    try {
      const next = await api<SubsSummary>(
        householdPath(personal.householdId, `/subscriptions/${id}/pay`),
        {
          method: "POST",
          body: JSON.stringify({
            accountId: payAccountId || undefined,
            occurredOn: todayISO(),
          }),
        },
      );
      setData(next);
      setConfirmPayId("");
    } catch (err) {
      setError(err instanceof Error ? err.message : t("couldNotSave"));
    } finally {
      setPayingId("");
    }
  }

  async function confirmUnpay(id: string) {
    if (!personal) return;
    setUnpayingId(id);
    setError("");
    try {
      const next = await api<SubsSummary>(
        householdPath(personal.householdId, `/subscriptions/${id}/unpay`),
        { method: "POST", body: JSON.stringify({}) },
      );
      setData(next);
      setConfirmUnpayId("");
    } catch (err) {
      setError(err instanceof Error ? err.message : t("couldNotSave"));
    } finally {
      setUnpayingId("");
    }
  }

  function openEdit(sub: Subscription) {
    setEditId(sub.id);
    setEditName(sub.name);
    setEditAmount(String(sub.amount));
    setEditDay(sub.billingDay);
    setEditKind(sub.kind ?? "SUBSCRIPTION");
    setEditTotalInstallments(
      sub.totalInstallments != null ? String(sub.totalInstallments) : "",
    );
    setEditCategoryId(sub.categoryId);
    setEditAccountId(sub.accountId);
    setEditNote(sub.note);
    setEditColor(sub.color);
    setConfirmPayId("");
    setError("");
  }

  async function saveEdit(e: FormEvent) {
    e.preventDefault();
    if (!personal || !editId) return;
    const amt = parseAmount(editAmount);
    if (!editName.trim() || !(amt > 0)) {
      setError(t("subsAmountHint"));
      return;
    }
    const monthsRaw = editTotalInstallments.trim();
    const installments =
      editKind === "INSTALLMENT" && monthsRaw
        ? Math.trunc(Number(monthsRaw))
        : null;
    if (
      editKind === "INSTALLMENT" &&
      monthsRaw &&
      !(installments && installments >= 1)
    ) {
      setError(t("subsInstallmentsHint"));
      return;
    }
    setBusy(true);
    setError("");
    try {
      const next = await api<SubsSummary>(
        householdPath(personal.householdId, `/subscriptions/${editId}`),
        {
          method: "PATCH",
          body: JSON.stringify({
            name: editName.trim(),
            amount: amt,
            billingDay: editDay,
            kind: editKind,
            totalInstallments: editKind === "INSTALLMENT" ? installments : null,
            categoryId: editCategoryId,
            accountId: editAccountId,
            note: editNote.trim(),
            color: editColor,
          }),
        },
      );
      setData(next);
      setEditId("");
    } catch (err) {
      setError(err instanceof Error ? err.message : t("couldNotSave"));
    } finally {
      setBusy(false);
    }
  }

  async function setInstallmentActive(id: string, active: boolean) {
    if (!personal) return;
    setTogglingId(id);
    setError("");
    try {
      const next = await api<SubsSummary>(
        householdPath(personal.householdId, `/subscriptions/${id}`),
        {
          method: "PATCH",
          body: JSON.stringify({ active }),
        },
      );
      setData(next);
      setConfirmPayId("");
      setConfirmUnpayId("");
    } catch (err) {
      setError(err instanceof Error ? err.message : t("couldNotSave"));
    } finally {
      setTogglingId("");
    }
  }

  async function onDelete(id: string) {
    if (!personal) return;
    setDeletingId(id);
    setError("");
    try {
      const next = await api<SubsSummary>(
        householdPath(personal.householdId, `/subscriptions/${id}`),
        { method: "DELETE" },
      );
      setData(next);
      if (editId === id) setEditId("");
    } catch (err) {
      setError(err instanceof Error ? err.message : t("couldNotSave"));
    } finally {
      setDeletingId("");
    }
  }

  if (!personal) {
    return (
      <PageShell>
        <p className="page-title">{t("navSubs")}</p>
        <Hint>{t("pleaseLogin")}</Hint>
        <BottomNav />
      </PageShell>
    );
  }

  const total =
    data?.subscriptions.filter((s) => s.active).length ?? 0;
  const paidN = data?.paidCount ?? 0;
  const accent = "var(--accent-b, #0369a1)";

  function installmentProgress(sub: Subscription) {
    if (sub.kind !== "INSTALLMENT") return null;
    if (sub.totalInstallments != null) {
      if (sub.remainingInstallments === 1) {
        return t("subsInstallmentDone");
      }
      return fill(t("subsInstallmentsLeft"), {
        n: String(sub.remainingInstallments ?? 0),
        total: String(sub.totalInstallments),
      });
    }
    if (sub.installmentsPaid > 0) {
      return `${sub.installmentsPaid} · ${t("subsInstallmentOpen")}`;
    }
    return t("subsInstallmentOpen");
  }

  return (
    <PageShell>
      <p className="page-title">📌 {t("navSubs")}</p>
      <Hint>{t("subsPageHint")}</Hint>

      {error ? (
        <p className="mt-3 rounded-2xl bg-red-500/10 px-4 py-3 text-sm text-red-800">
          {error}
        </p>
      ) : null}

      {data ? (
        <section
          className="surface mt-4 overflow-hidden rounded-[1.75rem] p-4"
          style={{
            background: `linear-gradient(145deg, color-mix(in srgb, ${accent} 12%, var(--panel)), var(--panel))`,
          }}
        >
          <div className="flex items-center gap-4">
            <ProgressRing
              paid={paidN}
              total={total}
              color={accent}
              label={t("subsStatusPaid")}
            />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
                {t("subsThisPeriod")}
              </p>
              <p className="mt-0.5 text-sm text-[var(--muted)]">
                <ItemDate value={data.periodFrom} locale={locale} />
                {" – "}
                <ItemDate value={data.periodTo} locale={locale} />
              </p>
              <p className="mt-2 text-lg font-semibold tabular-nums">
                {fill(t("subsPaidOf"), {
                  paid: String(paidN),
                  total: String(total),
                })}
              </p>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-3 gap-2 text-center">
            <div className="rounded-2xl bg-[var(--panel)]/70 px-2 py-2.5">
              <p className="text-[10px] font-medium uppercase tracking-wide text-[var(--muted)]">
                {t("subsMonthly")}
              </p>
              <p className="mt-0.5 text-sm font-semibold tabular-nums">
                <Money amount={data.monthlyTotal} currency={currency} locale={locale} />
              </p>
            </div>
            <div className="rounded-2xl bg-[var(--panel)]/70 px-2 py-2.5">
              <p className="text-[10px] font-medium uppercase tracking-wide text-[var(--muted)]">
                {t("subsPaidAmount")}
              </p>
              <p className="mt-0.5 text-sm font-semibold tabular-nums text-emerald-800">
                <Money amount={data.paidAmount} currency={currency} locale={locale} />
              </p>
            </div>
            <div className="rounded-2xl bg-[var(--panel)]/70 px-2 py-2.5">
              <p className="text-[10px] font-medium uppercase tracking-wide text-[var(--muted)]">
                {t("subsStillDue")}
              </p>
              <p className="mt-0.5 text-sm font-semibold tabular-nums text-amber-900">
                <Money amount={data.dueAmount} currency={currency} locale={locale} />
              </p>
            </div>
          </div>
        </section>
      ) : (
        <p className="mt-4 text-sm text-[var(--muted)]">{t("saving")}</p>
      )}

      <button
        type="button"
        onClick={() => setShowAdd((v) => !v)}
        className="mt-4 flex min-h-12 w-full items-center justify-center rounded-3xl bg-stone-900 text-base font-semibold text-white shadow-md"
      >
        {showAdd ? t("subsCancel") : `＋ ${t("subsAdd")}`}
      </button>

      {showAdd ? (
        <form onSubmit={onAdd} className="surface mt-3 space-y-3 rounded-[1.75rem] p-4">
          <div>
            <p className="mb-1.5 text-sm font-medium">{t("subsKind")}</p>
            <div className="seg grid grid-cols-2 gap-1 sm:grid-cols-4">
              {KIND_OPTIONS.map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => selectAddKind(k)}
                  className={`rounded-2xl px-1 py-2 text-center text-xs font-bold transition sm:text-sm ${
                    kind === k
                      ? "bg-[var(--surface-bg)] text-[var(--foreground)] shadow-sm"
                      : "text-[var(--muted)]"
                  }`}
                >
                  {kindLabel(k, t)}
                </button>
              ))}
            </div>
          </div>
          <label className="block text-sm font-medium">
            {t("subsName")}
            <input
              className="mt-1 w-full rounded-2xl border border-[var(--border)] bg-[var(--panel)] px-3 py-2.5"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("subsNamePlaceholder")}
              maxLength={80}
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm font-medium">
              {t("subsAmount")}
              <input
                className="amount-input mt-1 w-full rounded-2xl border border-[var(--border)] bg-[var(--panel)] px-3 py-2.5"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </label>
            <label className="block text-sm font-medium">
              {t("subsBillingDay")}
              <select
                className="mt-1 w-full rounded-2xl border border-[var(--border)] bg-[var(--panel)] px-3 py-2.5"
                value={billingDay}
                onChange={(e) => setBillingDay(Number(e.target.value))}
              >
                {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => (
                  <option key={d} value={d}>
                    {fill(t("subsDayN"), { n: String(d) })}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {kind === "INSTALLMENT" ? (
            <label className="block text-sm font-medium">
              {t("subsTotalInstallments")}
              <input
                className="mt-1 w-full rounded-2xl border border-[var(--border)] bg-[var(--panel)] px-3 py-2.5"
                inputMode="numeric"
                value={totalInstallments}
                onChange={(e) => setTotalInstallments(e.target.value)}
                min={1}
                max={360}
              />
              <Hint>{t("subsInstallmentsHint")}</Hint>
            </label>
          ) : null}
          {expenseCats.length > 0 ? (
            <div>
              <p className="mb-1 text-sm font-medium">{t("subsCategory")}</p>
              <CategoryPicker
                categories={expenseCats}
                value={categoryId}
                onChange={setCategoryId}
              />
            </div>
          ) : null}
          <label className="block text-sm font-medium">
            {t("subsWallet")}
            <select
              className="mt-1 w-full rounded-2xl border border-[var(--border)] bg-[var(--panel)] px-3 py-2.5"
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
            >
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm font-medium">
            {t("subsNote")}
            <input
              className="mt-1 w-full rounded-2xl border border-[var(--border)] bg-[var(--panel)] px-3 py-2.5"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={200}
            />
          </label>
          <div>
            <p className="mb-1.5 text-sm font-medium">{t("subsColor")}</p>
            <div className="flex flex-wrap gap-2">
              {ACCENT_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className={`h-8 w-8 rounded-full ${
                    color === c ? "ring-2 ring-offset-2 ring-stone-900" : ""
                  }`}
                  style={{ backgroundColor: c }}
                  aria-label={c}
                />
              ))}
            </div>
          </div>
          <button
            type="submit"
            disabled={busy}
            className="flex min-h-12 w-full items-center justify-center rounded-3xl bg-[var(--accent-b,#0369a1)] text-base font-semibold text-white disabled:opacity-60"
          >
            {busy ? t("saving") : t("subsSave")}
          </button>
        </form>
      ) : null}

      {unpaid.length > 0 ? (
        <section className="mt-6">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--muted)]">
            {t("subsNeedsAttention")}
          </h2>
          <ul className="mt-2 space-y-2">
            {unpaid.map((sub) => (
              <li
                key={sub.id}
                className="surface overflow-hidden rounded-[1.5rem]"
              >
                <div className="flex items-stretch gap-0">
                  <div
                    className="w-1.5 shrink-0"
                    style={{ backgroundColor: sub.color }}
                  />
                  <div className="min-w-0 flex-1 p-3.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-base font-semibold">
                          {sub.category.emoji ? `${sub.category.emoji} ` : ""}
                          {sub.name}
                        </p>
                        <p className="mt-0.5 text-sm text-[var(--muted)]">
                          {kindLabel(sub.kind ?? "SUBSCRIPTION", t)} ·{" "}
                          {categoryLabel(sub.category, locale, t)} ·{" "}
                          {fill(t("subsBillsOn"), {
                            n: String(sub.billingDay),
                          })}
                        </p>
                        {sub.kind === "INSTALLMENT" ? (
                          <p className="mt-1 text-xs font-medium text-[var(--muted)]">
                            {installmentProgress(sub)}
                          </p>
                        ) : null}
                      </div>
                      <p className="shrink-0 text-base font-semibold tabular-nums">
                        <Money
                          amount={sub.amount}
                          currency={currency}
                          locale={locale}
                        />
                      </p>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusTone(sub.status)}`}
                      >
                        {statusLabel(sub.status)}
                      </span>
                      <span className="text-xs text-[var(--muted)]">
                        {t("subsDueOn")}{" "}
                        <ItemDate value={sub.dueOn} locale={locale} />
                      </span>
                    </div>

                    {confirmPayId === sub.id ? (
                      <div className="mt-3 space-y-2 rounded-2xl bg-[var(--panel-soft)] p-3">
                        <p className="text-sm leading-relaxed">
                          {fill(t("subsPayConfirm"), {
                            name: sub.name,
                            amount: String(sub.amount),
                          })}
                        </p>
                        <Hint>{t("subsPayWarn")}</Hint>
                        {accounts.length > 1 ? (
                          <label className="block text-sm font-medium">
                            {t("subsWallet")}
                            <select
                              className="mt-1 w-full rounded-2xl border border-[var(--border)] bg-[var(--panel)] px-3 py-2"
                              value={payAccountId}
                              onChange={(e) => setPayAccountId(e.target.value)}
                            >
                              {accounts.map((a) => (
                                <option key={a.id} value={a.id}>
                                  {a.name}
                                </option>
                              ))}
                            </select>
                          </label>
                        ) : null}
                        <div className="flex gap-2">
                          <button
                            type="button"
                            disabled={payingId === sub.id}
                            onClick={() => confirmPay(sub.id)}
                            className="flex min-h-11 flex-1 items-center justify-center rounded-2xl bg-stone-900 text-sm font-semibold text-white disabled:opacity-60"
                          >
                            {payingId === sub.id
                              ? t("saving")
                              : t("subsConfirmPay")}
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmPayId("")}
                            className="min-h-11 rounded-2xl px-4 text-sm font-semibold text-[var(--muted)]"
                          >
                            {t("subsCancel")}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => openPay(sub)}
                          className="min-h-10 rounded-2xl bg-stone-900 px-4 text-sm font-semibold text-white"
                        >
                          {t("subsMarkPaid")}
                        </button>
                        {sub.kind === "INSTALLMENT" ? (
                          <button
                            type="button"
                            disabled={togglingId === sub.id}
                            onClick={() => setInstallmentActive(sub.id, false)}
                            className="min-h-10 rounded-2xl bg-[var(--panel-soft)] px-3 text-sm font-semibold disabled:opacity-60"
                          >
                            {togglingId === sub.id
                              ? t("saving")
                              : t("subsCloseInstallment")}
                          </button>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => openEdit(sub)}
                          className="min-h-10 rounded-2xl bg-[var(--panel-soft)] px-3 text-sm font-semibold"
                        >
                          {t("subsEdit")}
                        </button>
                      </div>
                    )}

                    {editId === sub.id ? (
                      <form
                        onSubmit={saveEdit}
                        className="mt-3 space-y-2 border-t border-[var(--border)] pt-3"
                      >
                        <div className="seg grid grid-cols-2 gap-1 sm:grid-cols-4">
                          {KIND_OPTIONS.map((k) => (
                            <button
                              key={k}
                              type="button"
                              onClick={() => selectEditKind(k)}
                              className={`rounded-2xl px-1 py-2 text-center text-xs font-bold ${
                                editKind === k
                                  ? "bg-[var(--surface-bg)] text-[var(--foreground)] shadow-sm"
                                  : "text-[var(--muted)]"
                              }`}
                            >
                              {kindLabel(k, t)}
                            </button>
                          ))}
                        </div>
                        <input
                          className="w-full rounded-2xl border border-[var(--border)] bg-[var(--panel)] px-3 py-2"
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                        />
                        <div className="grid grid-cols-2 gap-2">
                          <input
                            className="amount-input w-full rounded-2xl border border-[var(--border)] bg-[var(--panel)] px-3 py-2"
                            inputMode="decimal"
                            value={editAmount}
                            onChange={(e) => setEditAmount(e.target.value)}
                          />
                          <select
                            className="w-full rounded-2xl border border-[var(--border)] bg-[var(--panel)] px-3 py-2"
                            value={editDay}
                            onChange={(e) => setEditDay(Number(e.target.value))}
                          >
                            {Array.from({ length: 28 }, (_, i) => i + 1).map(
                              (d) => (
                                <option key={d} value={d}>
                                  {fill(t("subsDayN"), { n: String(d) })}
                                </option>
                              ),
                            )}
                          </select>
                        </div>
                        {editKind === "INSTALLMENT" ? (
                          <label className="block text-sm font-medium">
                            {t("subsTotalInstallments")}
                            <input
                              className="mt-1 w-full rounded-2xl border border-[var(--border)] bg-[var(--panel)] px-3 py-2"
                              inputMode="numeric"
                              value={editTotalInstallments}
                              onChange={(e) =>
                                setEditTotalInstallments(e.target.value)
                              }
                              placeholder={t("subsTotalInstallments")}
                            />
                            <Hint>{t("subsInstallmentsHint")}</Hint>
                          </label>
                        ) : null}
                        {expenseCats.length > 0 ? (
                          <CategoryPicker
                            categories={expenseCats}
                            value={editCategoryId}
                            onChange={setEditCategoryId}
                          />
                        ) : null}
                        <select
                          className="w-full rounded-2xl border border-[var(--border)] bg-[var(--panel)] px-3 py-2"
                          value={editAccountId}
                          onChange={(e) => setEditAccountId(e.target.value)}
                        >
                          {accounts.map((a) => (
                            <option key={a.id} value={a.id}>
                              {a.name}
                            </option>
                          ))}
                        </select>
                        <input
                          className="w-full rounded-2xl border border-[var(--border)] bg-[var(--panel)] px-3 py-2"
                          value={editNote}
                          onChange={(e) => setEditNote(e.target.value)}
                          placeholder={t("subsNote")}
                        />
                        <div className="flex flex-wrap gap-2">
                          {ACCENT_COLORS.map((c) => (
                            <button
                              key={c}
                              type="button"
                              onClick={() => setEditColor(c)}
                              className={`h-7 w-7 rounded-full ${
                                editColor === c
                                  ? "ring-2 ring-offset-2 ring-stone-900"
                                  : ""
                              }`}
                              style={{ backgroundColor: c }}
                            />
                          ))}
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="submit"
                            disabled={busy}
                            className="min-h-10 rounded-2xl bg-stone-900 px-4 text-sm font-semibold text-white disabled:opacity-60"
                          >
                            {t("subsSave")}
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditId("")}
                            className="min-h-10 rounded-2xl px-3 text-sm font-semibold text-[var(--muted)]"
                          >
                            {t("subsCancel")}
                          </button>
                          <button
                            type="button"
                            disabled={deletingId === sub.id}
                            onClick={() => onDelete(sub.id)}
                            className="min-h-10 rounded-2xl px-3 text-sm font-semibold text-red-700"
                          >
                            {deletingId === sub.id
                              ? t("saving")
                              : t("subsDelete")}
                          </button>
                        </div>
                      </form>
                    ) : null}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {paid.length > 0 ? (
        <section className="mt-6">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--muted)]">
            {t("subsPaidSection")}
          </h2>
          <ul className="mt-2 space-y-2">
            {paid.map((sub) => (
              <li
                key={sub.id}
                className="surface flex items-stretch overflow-hidden rounded-[1.5rem] opacity-90"
              >
                <div
                  className="w-1.5 shrink-0 bg-emerald-500"
                  aria-hidden
                />
                <div className="min-w-0 flex-1 p-3.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-base font-semibold">
                        ✓ {sub.name}
                      </p>
                      <p className="mt-0.5 text-sm text-[var(--muted)]">
                        {kindLabel(sub.kind ?? "SUBSCRIPTION", t)} ·{" "}
                        {categoryLabel(sub.category, locale, t)}
                        {sub.payment ? (
                          <>
                            {" · "}
                            <ItemDate
                              value={sub.payment.paidOn}
                              locale={locale}
                            />
                          </>
                        ) : null}
                      </p>
                      {sub.kind === "INSTALLMENT" ? (
                        <p className="mt-1 text-xs font-medium text-[var(--muted)]">
                          {installmentProgress(sub)}
                        </p>
                      ) : null}
                    </div>
                    <p className="shrink-0 text-base font-semibold tabular-nums text-emerald-800">
                      <Money
                        amount={sub.amount}
                        currency={currency}
                        locale={locale}
                      />
                    </p>
                  </div>
                  {confirmUnpayId === sub.id ? (
                    <div className="mt-3 space-y-2 rounded-2xl bg-[var(--panel-soft)] p-3">
                      <p className="text-sm">{t("subsUnpayConfirm")}</p>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          disabled={unpayingId === sub.id}
                          onClick={() => confirmUnpay(sub.id)}
                          className="min-h-10 rounded-2xl bg-stone-900 px-4 text-sm font-semibold text-white disabled:opacity-60"
                        >
                          {unpayingId === sub.id
                            ? t("saving")
                            : t("subsConfirmUnpay")}
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmUnpayId("")}
                          className="min-h-10 rounded-2xl px-3 text-sm font-semibold text-[var(--muted)]"
                        >
                          {t("subsCancel")}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-2 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setConfirmUnpayId(sub.id);
                          setConfirmPayId("");
                        }}
                        className="min-h-9 rounded-2xl px-3 text-xs font-semibold text-[var(--muted)]"
                      >
                        {t("subsUndoPay")}
                      </button>
                      {sub.kind === "INSTALLMENT" ? (
                        <button
                          type="button"
                          disabled={togglingId === sub.id}
                          onClick={() => setInstallmentActive(sub.id, false)}
                          className="min-h-9 rounded-2xl px-3 text-xs font-semibold text-[var(--muted)] disabled:opacity-60"
                        >
                          {togglingId === sub.id
                            ? t("saving")
                            : t("subsCloseInstallment")}
                        </button>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => openEdit(sub)}
                        className="min-h-9 rounded-2xl px-3 text-xs font-semibold text-[var(--muted)]"
                      >
                        {t("subsEdit")}
                      </button>
                    </div>
                  )}
                  {editId === sub.id ? (
                    <form
                      onSubmit={saveEdit}
                      className="mt-3 space-y-2 border-t border-[var(--border)] pt-3"
                    >
                      <div className="seg grid grid-cols-2 gap-1 sm:grid-cols-4">
                        {KIND_OPTIONS.map((k) => (
                          <button
                            key={k}
                            type="button"
                            onClick={() => selectEditKind(k)}
                            className={`rounded-2xl px-1 py-2 text-center text-xs font-bold ${
                              editKind === k
                                ? "bg-[var(--surface-bg)] text-[var(--foreground)] shadow-sm"
                                : "text-[var(--muted)]"
                            }`}
                          >
                            {kindLabel(k, t)}
                          </button>
                        ))}
                      </div>
                      <input
                        className="w-full rounded-2xl border border-[var(--border)] bg-[var(--panel)] px-3 py-2"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                      />
                      <div className="grid grid-cols-2 gap-2">
                        <input
                          className="amount-input w-full rounded-2xl border border-[var(--border)] bg-[var(--panel)] px-3 py-2"
                          inputMode="decimal"
                          value={editAmount}
                          onChange={(e) => setEditAmount(e.target.value)}
                        />
                        <select
                          className="w-full rounded-2xl border border-[var(--border)] bg-[var(--panel)] px-3 py-2"
                          value={editDay}
                          onChange={(e) => setEditDay(Number(e.target.value))}
                        >
                          {Array.from({ length: 28 }, (_, i) => i + 1).map(
                            (d) => (
                              <option key={d} value={d}>
                                {fill(t("subsDayN"), { n: String(d) })}
                              </option>
                            ),
                          )}
                        </select>
                      </div>
                      {editKind === "INSTALLMENT" ? (
                        <label className="block text-sm font-medium">
                          {t("subsTotalInstallments")}
                          <input
                            className="mt-1 w-full rounded-2xl border border-[var(--border)] bg-[var(--panel)] px-3 py-2"
                            inputMode="numeric"
                            value={editTotalInstallments}
                            onChange={(e) =>
                              setEditTotalInstallments(e.target.value)
                            }
                            placeholder={t("subsTotalInstallments")}
                          />
                          <Hint>{t("subsInstallmentsHint")}</Hint>
                        </label>
                      ) : null}
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="submit"
                          disabled={busy}
                          className="min-h-10 rounded-2xl bg-stone-900 px-4 text-sm font-semibold text-white"
                        >
                          {t("subsSave")}
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditId("")}
                          className="min-h-10 rounded-2xl px-3 text-sm font-semibold text-[var(--muted)]"
                        >
                          {t("subsCancel")}
                        </button>
                        <button
                          type="button"
                          disabled={deletingId === sub.id}
                          onClick={() => onDelete(sub.id)}
                          className="min-h-10 rounded-2xl px-3 text-sm font-semibold text-red-700"
                        >
                          {t("subsDelete")}
                        </button>
                      </div>
                    </form>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {closedInstallments.length > 0 ? (
        <section className="mt-6">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--muted)]">
            {t("subsClosedSection")}
          </h2>
          <ul className="mt-2 space-y-2">
            {closedInstallments.map((sub) => (
              <li
                key={sub.id}
                className="surface flex items-stretch overflow-hidden rounded-[1.5rem] opacity-75"
              >
                <div
                  className="w-1.5 shrink-0"
                  style={{ backgroundColor: sub.color }}
                  aria-hidden
                />
                <div className="min-w-0 flex-1 p-3.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-base font-semibold">
                        {sub.name}
                      </p>
                      <p className="mt-0.5 text-sm text-[var(--muted)]">
                        {kindLabel(sub.kind, t)} ·{" "}
                        {categoryLabel(sub.category, locale, t)}
                      </p>
                      {installmentProgress(sub) ? (
                        <p className="mt-1 text-xs font-medium text-[var(--muted)]">
                          {installmentProgress(sub)}
                        </p>
                      ) : null}
                    </div>
                    <p className="shrink-0 text-base font-semibold tabular-nums">
                      <Money
                        amount={sub.amount}
                        currency={currency}
                        locale={locale}
                      />
                    </p>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={togglingId === sub.id}
                      onClick={() => setInstallmentActive(sub.id, true)}
                      className="min-h-9 rounded-2xl bg-stone-900 px-3 text-xs font-semibold text-white disabled:opacity-60"
                    >
                      {togglingId === sub.id
                        ? t("saving")
                        : t("subsReopenInstallment")}
                    </button>
                    <button
                      type="button"
                      onClick={() => openEdit(sub)}
                      className="min-h-9 rounded-2xl px-3 text-xs font-semibold text-[var(--muted)]"
                    >
                      {t("subsEdit")}
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {data &&
      data.subscriptions.filter((s) => s.active).length === 0 &&
      closedInstallments.length === 0 &&
      !showAdd ? (
        <p className="mt-8 text-center text-sm text-[var(--muted)]">
          {t("subsEmpty")}
        </p>
      ) : null}

      <BottomNav />
    </PageShell>
  );
}
