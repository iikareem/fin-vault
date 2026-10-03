"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { api, parseAmount, todayISO } from "@/lib/api";
import { BottomNav } from "@/components/BottomNav";
import { PageShell } from "@/components/PageShell";
import { Money } from "@/components/Money";
import { useI18n } from "@/components/I18nProvider";
import { useBooks } from "@/components/BooksProvider";
import { householdPath } from "@/lib/space";
import { Hint } from "@/components/Hint";
import { DateField } from "@/components/DateField";
import { CategoryPicker } from "@/components/CategoryPicker";
import { categoryLabel, fill } from "@/lib/i18n";
import { ItemDate } from "@/components/ItemDate";

type Cat = {
  id: string;
  name: string;
  nameAr?: string;
  kind: string;
  color?: string;
  emoji?: string;
  parentId?: string | null;
  hidden?: boolean;
};

type TravelDetail = {
  id: string;
  name: string;
  currency: string;
  softLimit: number | null;
  startsOn: string;
  endsOn: string;
  status: "upcoming" | "active" | "past";
  spent: number;
  remaining: number | null;
  pct: number | null;
  overLimit: boolean;
  fromWallet: number;
  fromCash: number;
  byCategory: {
    categoryId: string;
    name: string;
    nameAr: string;
    color: string;
    emoji: string;
    total: number;
  }[];
  items: {
    id: string;
    amount: number;
    paidFrom: "CURRENT" | "CASH";
    occurredOn: string;
    note: string;
    category: {
      id: string;
      name: string;
      nameAr: string;
      color: string;
      emoji: string;
    };
  }[];
};

function LimitBar({ pct, over }: { pct: number | null; over: boolean }) {
  if (pct == null) return null;
  const width = Math.min(100, Math.max(0, pct));
  return (
    <div className="h-2.5 w-full overflow-hidden rounded-full bg-[var(--panel-soft)]">
      <div
        className={`h-full rounded-full transition-[width] duration-500 ${
          over ? "bg-amber-600" : "bg-sky-600"
        }`}
        style={{ width: `${width}%` }}
      />
    </div>
  );
}

function clampDate(iso: string, from: string, to: string) {
  if (iso < from) return from;
  if (iso > to) return to;
  return iso;
}

export default function TravelDetailPage() {
  const { t, locale } = useI18n();
  const { personal, setKind } = useBooks();
  const params = useParams();
  const router = useRouter();
  const travelId = String(params.id ?? "");
  const hid = personal?.householdId ?? "";

  const [trip, setTrip] = useState<TravelDetail | null>(null);
  const [cats, setCats] = useState<Cat[]>([]);
  const [amount, setAmount] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [paidFrom, setPaidFrom] = useState<"CURRENT" | "CASH">("CURRENT");
  const [occurredOn, setOccurredOn] = useState(todayISO());
  const [note, setNote] = useState("");
  const [showSpend, setShowSpend] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [ending, setEnding] = useState(false);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const expenseCats = useMemo(
    () =>
      cats.filter(
        (c) => c.kind === "EXPENSE" && !c.hidden && c.name !== "Cash withdrawal",
      ),
    [cats],
  );

  function load(householdId: string, id: string) {
    return Promise.all([
      api<TravelDetail>(householdPath(householdId, `/travels/${id}`)),
      api<Cat[]>(householdPath(householdId, "/categories")),
    ]).then(([detail, list]) => {
      setTrip(detail);
      setCats(list);
      const today = clampDate(todayISO(), detail.startsOn, detail.endsOn);
      setOccurredOn(today);
      if (detail.status === "active") setShowSpend(true);
      const travelParent = list.find(
        (c) =>
          c.kind === "EXPENSE" &&
          !c.parentId &&
          (c.name === "Travel & trips" || c.name === "Travel"),
      );
      const travelChild = list.find(
        (c) =>
          c.kind === "EXPENSE" &&
          travelParent &&
          c.parentId === travelParent.id &&
          !c.hidden,
      );
      setCategoryId((prev) => prev || travelChild?.id || travelParent?.id || "");
    });
  }

  useEffect(() => {
    if (!personal || !travelId) return;
    setKind("PERSONAL");
    load(personal.householdId, travelId).catch((e) => setError(e.message));
  }, [personal?.householdId, travelId]);

  async function onSpend(e: FormEvent) {
    e.preventDefault();
    if (!hid || !trip) return;
    const value = parseAmount(amount);
    if (!Number.isFinite(value) || value <= 0) {
      setError(t("travelsAmountHint"));
      return;
    }
    if (!categoryId) {
      setError(t("travelsCategoryHint"));
      return;
    }
    setBusy(true);
    setError("");
    try {
      await api(householdPath(hid, `/travels/${trip.id}/spends`), {
        method: "POST",
        body: JSON.stringify({
          amount: value,
          categoryId,
          paidFrom,
          occurredOn,
          ...(note.trim() ? { note: note.trim() } : {}),
        }),
      });
      setAmount("");
      setNote("");
      await load(hid, trip.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("travelsSaveFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function onEnd() {
    if (!hid || !trip || ending) return;
    if (!confirmEnd) {
      setConfirmEnd(true);
      setConfirmDelete(false);
      return;
    }
    setEnding(true);
    setError("");
    try {
      await api(householdPath(hid, `/travels/${trip.id}/end`), {
        method: "POST",
        body: JSON.stringify({}),
      });
      // Go back to the travels hub — don't patch local trip state with the
      // summary payload (missing items/byCategory) or reload categories.
      window.location.assign("/travels");
    } catch (err) {
      setError(err instanceof Error ? err.message : t("travelsSaveFailed"));
      setEnding(false);
      setConfirmEnd(false);
    }
  }

  async function onDelete() {
    if (!hid || !trip) return;
    if (trip.spent > 0.001) {
      setError(t("travelsDeleteBlocked"));
      return;
    }
    if (!confirmDelete) {
      setConfirmDelete(true);
      setConfirmEnd(false);
      return;
    }
    setDeleting(true);
    setError("");
    try {
      await api(householdPath(hid, `/travels/${trip.id}`), {
        method: "DELETE",
      });
      router.replace("/travels");
    } catch (err) {
      setError(err instanceof Error ? err.message : t("travelsSaveFailed"));
      setDeleting(false);
      setConfirmDelete(false);
    }
  }

  if (!trip && !error) {
    return (
      <PageShell>
        <p className="text-sm text-[var(--muted)]">…</p>
        <BottomNav />
      </PageShell>
    );
  }

  if (!trip) {
    return (
      <PageShell>
        <p className="text-sm text-red-700">{error}</p>
        <Link href="/travels" className="mt-3 inline-block text-sky-800">
          ← {t("navTravels")}
        </Link>
        <BottomNav />
      </PageShell>
    );
  }

  const statusLabel =
    trip.status === "active"
      ? t("travelsActive")
      : trip.status === "upcoming"
        ? t("travelsUpcoming")
        : t("travelsPast");

  return (
    <PageShell>
      <header className="mb-4">
        <Link
          href="/travels"
          className="text-sm font-semibold text-sky-800"
        >
          ← {t("navTravels")}
        </Link>
        <div className="mt-2 flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-sky-800">
              {statusLabel}
            </p>
            <h1 className="text-2xl font-bold">{trip.name}</h1>
            <p className="mt-0.5 text-sm text-[var(--muted)]">
              {trip.startsOn} → {trip.endsOn} · {trip.currency}
            </p>
          </div>
          {trip.status === "active" ? (
            <button
              type="button"
              onClick={() => setShowSpend((v) => !v)}
              className="shrink-0 rounded-2xl bg-sky-800 px-3 py-2 text-sm font-semibold text-white"
            >
              {showSpend ? t("travelsCancel") : `＋ ${t("travelsAddSpend")}`}
            </button>
          ) : null}
        </div>
      </header>

      <section className="surface mb-4 rounded-[1.75rem] p-4">
        <p className="text-xs font-medium text-[var(--muted)]">
          {t("travelsSpent")}
        </p>
        <p className="mt-1 text-3xl font-bold tabular-nums">
          <Money
            amount={trip.spent}
            currency={trip.currency}
            locale={locale}
          />
          {trip.softLimit != null ? (
            <span className="text-lg font-semibold text-[var(--muted)]">
              {" "}
              /{" "}
              <Money
                amount={trip.softLimit}
                currency={trip.currency}
                locale={locale}
              />
            </span>
          ) : null}
        </p>
        {trip.softLimit != null ? (
          <div className="mt-3 space-y-1.5">
            <LimitBar pct={trip.pct} over={trip.overLimit} />
            <p
              className={`text-xs font-semibold ${
                trip.overLimit ? "text-amber-800" : "text-[var(--muted)]"
              }`}
            >
              {trip.overLimit
                ? t("travelsOverLimit")
                : fill(t("travelsProgressHint"), {
                    pct: String(Math.round(trip.pct ?? 0)),
                  })}
            </p>
          </div>
        ) : (
          <Hint>{t("travelsNoLimitHint")}</Hint>
        )}
        <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
          <div className="rounded-2xl bg-[var(--panel-soft)] px-3 py-2">
            <p className="text-xs text-[var(--muted)]">{t("travelsFromCurrent")}</p>
            <p className="font-bold tabular-nums">
              <Money
                amount={trip.fromWallet ?? 0}
                currency={trip.currency}
                locale={locale}
              />
            </p>
          </div>
          <div className="rounded-2xl bg-[var(--panel-soft)] px-3 py-2">
            <p className="text-xs text-[var(--muted)]">{t("travelsFromCash")}</p>
            <p className="font-bold tabular-nums">
              <Money
                amount={trip.fromCash ?? 0}
                currency={trip.currency}
                locale={locale}
              />
            </p>
          </div>
        </div>
      </section>

      {showSpend && trip.status !== "past" ? (
        <form
          onSubmit={onSpend}
          className="surface mb-5 space-y-3 rounded-[1.75rem] p-4"
        >
          <h2 className="text-lg font-bold">{t("travelsAddSpend")}</h2>
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
          <div>
            <p className="mb-1.5 text-xs font-medium text-[var(--muted)]">
              {t("travelsPaidFrom")}
            </p>
            <div className="seg grid-cols-2">
              <button
                type="button"
                onClick={() => setPaidFrom("CURRENT")}
                className={`rounded-2xl px-2 py-2.5 text-center text-sm font-bold transition ${
                  paidFrom === "CURRENT"
                    ? "bg-[var(--surface-bg)] text-[var(--foreground)] shadow-sm"
                    : "text-[var(--muted)]"
                }`}
              >
                💵 {t("travelsFromCurrent")}
              </button>
              <button
                type="button"
                onClick={() => setPaidFrom("CASH")}
                className={`rounded-2xl px-2 py-2.5 text-center text-sm font-bold transition ${
                  paidFrom === "CASH"
                    ? "bg-[var(--surface-bg)] text-[var(--foreground)] shadow-sm"
                    : "text-[var(--muted)]"
                }`}
              >
                📋 {t("travelsFromCash")}
              </button>
            </div>
            <Hint>
              {paidFrom === "CURRENT"
                ? t("travelsFromCurrentHint")
                : t("travelsFromCashHint")}
            </Hint>
          </div>
          <CategoryPicker
            categories={expenseCats}
            value={categoryId}
            onChange={setCategoryId}
          />
          <div className="surface rounded-[1.5rem] p-3.5 !shadow-none ring-1 ring-[var(--input-border)]">
            <DateField
              value={occurredOn}
              onChange={(v) =>
                setOccurredOn(clampDate(v, trip.startsOn, trip.endsOn))
              }
            />
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
            className="w-full rounded-3xl bg-sky-800 px-4 py-3.5 text-base font-semibold text-white disabled:opacity-60"
          >
            {busy ? t("saving") : `✅ ${t("save")}`}
          </button>
        </form>
      ) : null}

      {error && !showSpend ? (
        <p className="mb-3 text-sm text-red-700">{error}</p>
      ) : null}

      {(trip.byCategory?.length ?? 0) > 0 ? (
        <section className="mb-5">
          <h2 className="mb-2 text-sm font-semibold text-[var(--muted)]">
            {t("travelsByCategory")}
          </h2>
          <ul className="space-y-2">
            {(trip.byCategory ?? []).map((c) => (
              <li
                key={c.categoryId}
                className="surface flex items-center justify-between rounded-[1.25rem] px-3.5 py-2.5"
              >
                <span className="text-sm font-semibold">
                  {categoryLabel(c, locale, t)}
                </span>
                <span className="text-sm font-bold tabular-nums">
                  <Money
                    amount={c.total}
                    currency={trip.currency}
                    locale={locale}
                  />
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="mb-5">
        <h2 className="mb-2 text-sm font-semibold text-[var(--muted)]">
          {t("travelsLog")}
        </h2>
        {(trip.items?.length ?? 0) === 0 ? (
          <div className="surface rounded-[1.5rem] p-4 text-sm text-[var(--muted)]">
            {t("travelsLogEmpty")}
          </div>
        ) : (
          <ul className="space-y-2">
            {(trip.items ?? []).map((item) => (
              <li
                key={item.id}
                className="surface flex items-start justify-between gap-3 rounded-[1.25rem] px-3.5 py-2.5"
              >
                <div className="min-w-0">
                  <p className="font-semibold">
                    {categoryLabel(item.category, locale, t)}
                  </p>
                  <p className="text-xs text-[var(--muted)]">
                    <ItemDate value={item.occurredOn} locale={locale} /> ·{" "}
                    {item.paidFrom === "CURRENT"
                      ? t("travelsFromCurrent")
                      : t("travelsFromCash")}
                    {item.note ? ` · ${item.note}` : ""}
                  </p>
                </div>
                <span className="shrink-0 font-bold tabular-nums">
                  <Money
                    amount={item.amount}
                    currency={trip.currency}
                    locale={locale}
                  />
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {trip.status === "active" || trip.status === "upcoming" ? (
        <div className="mb-3 space-y-2">
          {confirmEnd ? (
            <div className="surface space-y-3 rounded-[1.5rem] p-4 ring-1 ring-amber-300/70">
              <p className="text-sm font-semibold text-[var(--foreground)]">
                {t("travelsEndConfirm")}
              </p>
              <p className="text-xs text-[var(--muted)]">
                {t("travelsEndConfirmHint")}
              </p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  disabled={ending}
                  onClick={() => setConfirmEnd(false)}
                  className="rounded-2xl px-3 py-2.5 text-sm font-semibold ring-1 ring-[var(--input-border)]"
                >
                  {t("travelsCancel")}
                </button>
                <button
                  type="button"
                  disabled={ending}
                  onClick={onEnd}
                  className="rounded-2xl bg-amber-700 px-3 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
                >
                  {ending ? t("saving") : t("travelsEndConfirmAction")}
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              disabled={ending}
              onClick={onEnd}
              className="w-full rounded-2xl px-4 py-2.5 text-sm font-semibold text-amber-900 ring-1 ring-amber-300 disabled:opacity-60"
            >
              {t("travelsEnd")}
            </button>
          )}
        </div>
      ) : null}

      {trip.spent < 0.001 ? (
        <div className="mb-4 space-y-2">
          {confirmDelete ? (
            <div className="surface space-y-3 rounded-[1.5rem] p-4 ring-1 ring-red-300/70">
              <p className="text-sm font-semibold text-[var(--foreground)]">
                {t("travelsDeleteConfirm")}
              </p>
              <p className="text-xs text-[var(--muted)]">
                {t("travelsDeleteConfirmHint")}
              </p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  disabled={deleting}
                  onClick={() => setConfirmDelete(false)}
                  className="rounded-2xl px-3 py-2.5 text-sm font-semibold ring-1 ring-[var(--input-border)]"
                >
                  {t("travelsCancel")}
                </button>
                <button
                  type="button"
                  disabled={deleting}
                  onClick={onDelete}
                  className="rounded-2xl bg-red-700 px-3 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
                >
                  {deleting ? t("saving") : t("travelsDeleteConfirmAction")}
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              disabled={deleting}
              onClick={onDelete}
              className="w-full rounded-2xl px-4 py-2.5 text-sm font-semibold text-red-800 ring-1 ring-red-200 disabled:opacity-60"
            >
              {t("travelsDelete")}
            </button>
          )}
        </div>
      ) : null}

      <BottomNav />
    </PageShell>
  );
}
