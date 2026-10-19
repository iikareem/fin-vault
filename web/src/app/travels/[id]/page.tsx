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
import { ItemTime } from "@/components/ItemTime";
import { CURRENCY_OPTIONS } from "@/lib/currencies";
import { formatItemDate } from "@/lib/calendar";
import { LimitBar } from "@/components/LimitBar";
import {
  cacheOfflinePage,
  rememberOfflineTrip,
} from "@/components/ServiceWorkerRegister";
import {
  enqueueTransaction,
  isLikelyOffline,
  isOfflineNetworkError,
  loadTravelSnapshot,
  OFFLINE_QUEUE_SYNCED,
  saveTravelSnapshot,
} from "@/lib/offline-queue";
import { cachedPageNavigate } from "@/lib/offline-nav";

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
    createdAt?: string;
    note: string;
    pendingSync?: boolean;
    category: {
      id: string;
      name: string;
      nameAr: string;
      color: string;
      emoji: string;
    };
  }[];
};

const DAY_MS = 86_400_000;

function dayDistance(from: string, to: string) {
  const [fromYear, fromMonth, fromDay] = from.split("-").map(Number);
  const [toYear, toMonth, toDay] = to.split("-").map(Number);
  return Math.round(
    (Date.UTC(toYear, toMonth - 1, toDay) -
      Date.UTC(fromYear, fromMonth - 1, fromDay)) /
      DAY_MS,
  );
}

export default function TravelDetailPage() {
  const { t, locale } = useI18n();
  const { personal, setKind, skipAddConfirm } = useBooks();
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
  const [showEdit, setShowEdit] = useState(false);
  const [editingSpendId, setEditingSpendId] = useState("");
  const [confirmDeleteSpendId, setConfirmDeleteSpendId] = useState("");
  const [confirmSpendOpen, setConfirmSpendOpen] = useState(false);
  const [editName, setEditName] = useState("");
  const [editCurrency, setEditCurrency] = useState("EGP");
  const [editStartsOn, setEditStartsOn] = useState(todayISO());
  const [editEndsOn, setEditEndsOn] = useState(todayISO());
  const [editLimit, setEditLimit] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [editBusy, setEditBusy] = useState(false);
  const [ending, setEnding] = useState(false);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [offline, setOffline] = useState(false);
  const [usingOfflineData, setUsingOfflineData] = useState(false);

  const expenseCats = useMemo(
    () =>
      cats.filter(
        (c) => c.kind === "EXPENSE" && !c.hidden && c.name !== "Cash withdrawal",
      ),
    [cats],
  );
  const selectedSpendCategory = useMemo(
    () => expenseCats.find((c) => c.id === categoryId) ?? null,
    [expenseCats, categoryId],
  );
  const confirmSpendAmount = parseAmount(amount);
  const spendWalletToneClass =
    paidFrom === "CASH"
      ? "bg-stone-100 text-stone-800 ring-stone-300/80 dark:bg-stone-800/60 dark:text-stone-100 dark:ring-stone-600/60"
      : "bg-emerald-100 text-emerald-950 ring-emerald-300/80 dark:bg-emerald-950/40 dark:text-emerald-100 dark:ring-emerald-700/60";

  const isOpen = trip?.status === "active" || trip?.status === "upcoming";

  function syncEditForm(detail: TravelDetail) {
    setEditName(detail.name);
    setEditCurrency(detail.currency);
    setEditStartsOn(detail.startsOn);
    setEditEndsOn(detail.endsOn);
    setEditLimit(
      detail.softLimit != null ? String(detail.softLimit) : "",
    );
  }

  function pickDefaultCategory(list: Cat[]) {
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
  }

  async function loadTrip(householdId: string, id: string) {
    try {
      const detail = await api<TravelDetail>(
        householdPath(householdId, `/travels/${id}`),
      );
      setTrip(detail);
      syncEditForm(detail);
      setOccurredOn(todayISO());
      setShowSpend(false);
      setShowEdit(false);
      setEditingSpendId("");
      setConfirmDeleteSpendId("");
      setConfirmSpendOpen(false);
      setUsingOfflineData(false);
      rememberOfflineTrip(id);
      void cacheOfflinePage(`/travels/${id}`);
      void saveTravelSnapshot(householdId, id, detail);
    } catch (error) {
      if (!isOfflineNetworkError(error) && !isLikelyOffline()) throw error;
      const snapshot = await loadTravelSnapshot(householdId, id);
      if (!snapshot) throw error;
      const detail = snapshot.detail as TravelDetail;
      setTrip(detail);
      syncEditForm(detail);
      setCats(snapshot.categories as Cat[]);
      pickDefaultCategory(snapshot.categories as Cat[]);
      setUsingOfflineData(true);
    }
  }

  async function loadCategories(householdId: string) {
    if (cats.length > 0) return Promise.resolve(cats);
    try {
      const list = await api<Cat[]>(
        householdPath(householdId, "/categories"),
      );
      setCats(list);
      pickDefaultCategory(list);
      const snapshot = await loadTravelSnapshot(householdId, travelId);
      if (snapshot) {
        void saveTravelSnapshot(
          householdId,
          travelId,
          snapshot.detail,
          list,
        );
      }
      return list;
    } catch (error) {
      if (!isOfflineNetworkError(error) && !isLikelyOffline()) throw error;
      const snapshot = await loadTravelSnapshot(householdId, travelId);
      if (!snapshot?.categories.length) throw error;
      const list = snapshot.categories as Cat[];
      setCats(list);
      pickDefaultCategory(list);
      setUsingOfflineData(true);
      return list;
    }
  }

  function load(householdId: string, id: string) {
    // Trip first so the screen paints fast; categories are heavy (seed sync).
    return loadTrip(householdId, id).then(() => {
      void loadCategories(householdId).catch(() => {
        /* spend form will retry */
      });
    });
  }

  useEffect(() => {
    if (!personal || !travelId) return;
    setKind("PERSONAL");
    load(personal.householdId, travelId).catch((e) => setError(e.message));
  }, [personal?.householdId, travelId]);

  useEffect(() => {
    const update = () => setOffline(isLikelyOffline());
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  useEffect(() => {
    if (!hid || !travelId) return;
    const refreshAfterSync = () => {
      void load(hid, travelId).catch(() => undefined);
    };
    window.addEventListener(OFFLINE_QUEUE_SYNCED, refreshAfterSync);
    return () => {
      window.removeEventListener(OFFLINE_QUEUE_SYNCED, refreshAfterSync);
    };
  }, [hid, travelId]);

  function addQueuedSpend(
    detail: TravelDetail,
    value: number,
    body: {
      categoryId: string;
      paidFrom: "CURRENT" | "CASH";
      occurredOn: string;
      note?: string;
    },
  ): TravelDetail {
    const category = cats.find((cat) => cat.id === body.categoryId);
    if (!category) return detail;
    const spent = detail.spent + value;
    const byCategory = [...detail.byCategory];
    const categoryIndex = byCategory.findIndex(
      (item) => item.categoryId === category.id,
    );
    const categoryTotal = {
      categoryId: category.id,
      name: category.name,
      nameAr: category.nameAr ?? "",
      color: category.color ?? "#0369a1",
      emoji: category.emoji ?? "•",
      total:
        (categoryIndex >= 0 ? byCategory[categoryIndex]!.total : 0) + value,
    };
    if (categoryIndex >= 0) byCategory[categoryIndex] = categoryTotal;
    else byCategory.push(categoryTotal);
    byCategory.sort((a, b) => b.total - a.total);
    return {
      ...detail,
      spent,
      remaining:
        detail.softLimit != null
          ? Math.max(0, detail.softLimit - spent)
          : null,
      pct:
        detail.softLimit != null && detail.softLimit > 0
          ? Math.round((spent / detail.softLimit) * 1000) / 10
          : null,
      overLimit:
        detail.softLimit != null
          ? spent > detail.softLimit + 0.001
          : false,
      fromWallet:
        detail.fromWallet + (body.paidFrom === "CURRENT" ? value : 0),
      fromCash: detail.fromCash + (body.paidFrom === "CASH" ? value : 0),
      byCategory,
      items: [
        {
          id: `offline-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          amount: value,
          paidFrom: body.paidFrom,
          occurredOn: body.occurredOn,
          createdAt: new Date().toISOString(),
          note: body.note ?? "",
          pendingSync: true,
          category: {
            id: category.id,
            name: category.name,
            nameAr: category.nameAr ?? "",
            color: category.color ?? "#0369a1",
            emoji: category.emoji ?? "•",
          },
        },
        ...detail.items,
      ],
    };
  }

  function validateSpendForm() {
    const value = parseAmount(amount);
    if (!Number.isFinite(value) || value <= 0) {
      setError(t("travelsAmountHint"));
      return false;
    }
    if (!categoryId) {
      setError(t("travelsCategoryHint"));
      return false;
    }
    setError("");
    return true;
  }

  function onSpend(e: FormEvent) {
    e.preventDefault();
    if (!hid || !trip || busy) return;
    if (!validateSpendForm()) return;
    if (skipAddConfirm) {
      void confirmSaveSpend();
      return;
    }
    setConfirmSpendOpen(true);
  }

  function openSpendEdit(item: TravelDetail["items"][number]) {
    if (item.pendingSync || offline) return;
    if (editingSpendId === item.id) {
      setEditingSpendId("");
      setConfirmDeleteSpendId("");
      setConfirmSpendOpen(false);
      return;
    }
    setEditingSpendId(item.id);
    setConfirmDeleteSpendId("");
    setConfirmSpendOpen(false);
    setShowSpend(false);
    setShowEdit(false);
    setConfirmEnd(false);
    setConfirmDelete(false);
    setAmount(String(item.amount));
    setCategoryId(item.category.id);
    setPaidFrom(item.paidFrom);
    setOccurredOn(item.occurredOn);
    setNote(item.note ?? "");
    setError("");
    if (hid) {
      void loadCategories(hid).catch((e) =>
        setError(e instanceof Error ? e.message : t("travelsSaveFailed")),
      );
    }
  }

  function onSaveSpendEdit(e: FormEvent) {
    e.preventDefault();
    if (!hid || !trip || !editingSpendId || busy) return;
    if (!validateSpendForm()) return;
    if (skipAddConfirm) {
      void confirmSaveSpend();
      return;
    }
    setConfirmSpendOpen(true);
  }

  async function confirmSaveSpend() {
    if (!hid || !trip || busy) return;
    const value = parseAmount(amount);
    if (!Number.isFinite(value) || value <= 0 || !categoryId) return;

    setBusy(true);
    setError("");
    try {
      if (editingSpendId) {
        await api(
          householdPath(
            hid,
            `/travels/${trip.id}/spends/${editingSpendId}`,
          ),
          {
            method: "PATCH",
            body: JSON.stringify({
              amount: value,
              categoryId,
              paidFrom,
              occurredOn,
              note: note.trim(),
            }),
          },
        );
        setEditingSpendId("");
        setConfirmDeleteSpendId("");
        setConfirmSpendOpen(false);
        setAmount("");
        setNote("");
        await load(hid, trip.id);
        return;
      }

      const path = householdPath(hid, `/travels/${trip.id}/spends`);
      const body = {
        amount: value,
        categoryId,
        paidFrom,
        occurredOn,
        ...(note.trim() ? { note: note.trim() } : {}),
      };
      let queued = isLikelyOffline();
      if (queued) {
        await enqueueTransaction(path, body);
      } else {
        try {
          await api(path, {
            method: "POST",
            body: JSON.stringify(body),
          });
        } catch (error) {
          if (!isOfflineNetworkError(error)) throw error;
          await enqueueTransaction(path, body);
          queued = true;
        }
      }
      setAmount("");
      setNote("");
      setConfirmSpendOpen(false);
      if (queued) {
        const updated = addQueuedSpend(trip, value, body);
        setTrip(updated);
        setShowSpend(false);
        setUsingOfflineData(true);
        await saveTravelSnapshot(hid, trip.id, updated, cats);
      } else {
        await load(hid, trip.id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t("travelsSaveFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function onDeleteSpend(spendId: string) {
    if (!hid || !trip || busy) return;
    if (confirmDeleteSpendId !== spendId) {
      setConfirmDeleteSpendId(spendId);
      return;
    }
    setBusy(true);
    setError("");
    try {
      await api(
        householdPath(hid, `/travels/${trip.id}/spends/${spendId}`),
        { method: "DELETE" },
      );
      setEditingSpendId("");
      setConfirmDeleteSpendId("");
      setAmount("");
      setNote("");
      await load(hid, trip.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("travelsSaveFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function onSaveEdit(e: FormEvent) {
    e.preventDefault();
    if (!hid || !trip || editBusy) return;
    const trimmed = editName.trim();
    if (!trimmed) {
      setError(t("travelsNameHint"));
      return;
    }
    if (editStartsOn > editEndsOn) {
      setError(t("travelsDateOrder"));
      return;
    }
    const limitRaw = editLimit.trim();
    const limitAmt = limitRaw ? parseAmount(limitRaw) : null;
    if (limitRaw && (!Number.isFinite(limitAmt) || (limitAmt ?? 0) <= 0)) {
      setError(t("travelsLimitHint"));
      return;
    }
    setEditBusy(true);
    setError("");
    try {
      const updated = await api<TravelDetail>(
        householdPath(hid, `/travels/${trip.id}`),
        {
          method: "PATCH",
          body: JSON.stringify({
            name: trimmed,
            currency: editCurrency,
            startsOn: editStartsOn,
            endsOn: editEndsOn,
            softLimit: limitAmt,
          }),
        },
      );
      setTrip(updated);
      syncEditForm(updated);
      setShowEdit(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("travelsSaveFailed"));
    } finally {
      setEditBusy(false);
    }
  }

  async function onEnd() {
    if (!hid || !trip || ending) return;
    if (!confirmEnd) {
      setConfirmEnd(true);
      setConfirmDelete(false);
      setShowEdit(false);
      setEditingSpendId("");
      setConfirmDeleteSpendId("");
      setConfirmSpendOpen(false);
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

  const rangeLabel = (() => {
    const from = formatItemDate(trip.startsOn, locale) || trip.startsOn;
    const to = formatItemDate(trip.endsOn, locale) || trip.endsOn;
    return trip.startsOn === trip.endsOn ? from : `${from} → ${to}`;
  })();
  const today = todayISO();
  const daysForBudget = Math.max(
    1,
    dayDistance(
      trip.status === "upcoming" ? trip.startsOn : today,
      trip.endsOn,
    ) + 1,
  );
  const remainingBudget =
    trip.softLimit != null ? Math.max(0, trip.remaining ?? 0) : null;
  const dailyBudget =
    remainingBudget != null && isOpen && !trip.overLimit
      ? remainingBudget / daysForBudget
      : null;
  const timingLabel = (() => {
    if (trip.status === "past") return t("travelsTripComplete");
    if (trip.status === "upcoming") {
      const days = Math.max(1, dayDistance(today, trip.startsOn));
      return days === 1
        ? t("travelsStartsTomorrow")
        : fill(t("travelsStartsIn"), { n: String(days) });
    }
    const days = Math.max(0, dayDistance(today, trip.endsOn));
    if (days === 0) return t("travelsLastDayToday");
    if (days === 1) return t("travelsOneDayLeft");
    return fill(t("travelsDaysLeft"), { n: String(days) });
  })();

  function openSpend() {
    setShowSpend(true);
    setShowEdit(false);
    setEditingSpendId("");
    setConfirmDeleteSpendId("");
    setConfirmSpendOpen(false);
    setConfirmEnd(false);
    setConfirmDelete(false);
    setAmount("");
    setNote("");
    setPaidFrom("CURRENT");
    setOccurredOn(todayISO());
    setError("");
    if (hid) {
      void loadCategories(hid).catch((e) =>
        setError(e instanceof Error ? e.message : t("travelsSaveFailed")),
      );
    }
  }

  function openEdit() {
    if (!trip) return;
    syncEditForm(trip);
    setShowEdit(true);
    setShowSpend(false);
    setEditingSpendId("");
    setConfirmDeleteSpendId("");
    setConfirmSpendOpen(false);
    setConfirmEnd(false);
    setConfirmDelete(false);
    setError("");
  }

  function closePanels() {
    setShowSpend(false);
    setShowEdit(false);
    setEditingSpendId("");
    setConfirmDeleteSpendId("");
    setConfirmSpendOpen(false);
    setError("");
  }

  return (
    <PageShell>
      <header className="mb-4">
        <div className="flex items-center justify-between gap-3">
          <Link
            href="/travels"
            onClick={(event) => cachedPageNavigate("/travels", event)}
            className="inline-flex min-h-10 items-center gap-1 text-sm font-semibold text-[var(--accent-b-text)]"
          >
            ← {t("travelsTitle")}
          </Link>
          <span className="rounded-full bg-sky-800/10 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-sky-900 dark:text-sky-200">
            {statusLabel}
          </span>
        </div>
        <h1 className="page-title mt-1">{trip.name}</h1>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-[var(--muted)]">
          <span>
            {rangeLabel} · {trip.currency}
          </span>
          {!showEdit && !offline ? (
            <button
              type="button"
              onClick={openEdit}
              className="font-semibold text-[var(--accent-b-text)] underline-offset-2 hover:underline"
            >
              {t("travelsEdit")}
            </button>
          ) : null}
        </div>
      </header>

      {offline || usingOfflineData ? (
        <p className="mb-3 rounded-xl bg-sky-800/10 px-3 py-2 text-sm text-[var(--muted)]">
          {t("travelsOfflineReady")}
        </p>
      ) : null}

      <section className="surface relative mb-3 overflow-hidden rounded-[1.75rem] p-4">
        <div
          className="pointer-events-none absolute -end-12 -top-14 h-36 w-36 rounded-full bg-[var(--accent-b-soft)] opacity-80"
          aria-hidden
        />
        <div className="relative flex items-center justify-between gap-3">
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--muted)]">
            {t("travelsBudgetSnapshot")}
          </p>
          <span className="rounded-full bg-[var(--accent-b-soft)] px-2.5 py-1 text-[11px] font-semibold text-[var(--accent-b-text)]">
            {timingLabel}
          </span>
        </div>

        <div
          className={`relative mt-4 grid gap-2 ${
            trip.softLimit != null ? "grid-cols-2" : "grid-cols-1"
          }`}
        >
          <div className="rounded-2xl bg-[var(--panel-soft)] p-3">
            <p className="text-xs font-medium text-[var(--muted)]">
              {t("travelsSpent")}
            </p>
            <p className="mt-1 text-xl font-bold leading-tight tabular-nums">
              <Money
                amount={trip.spent}
                currency={trip.currency}
                locale={locale}
              />
            </p>
          </div>
          {remainingBudget != null ? (
            <div className="rounded-2xl bg-[var(--accent-b-soft)] p-3">
              <p className="text-xs font-medium text-[var(--accent-b-text)] opacity-80">
                {t("travelsRemaining")}
              </p>
              <p className="mt-1 text-xl font-bold leading-tight tabular-nums text-[var(--accent-b-text)]">
                <Money
                  amount={remainingBudget}
                  currency={trip.currency}
                  locale={locale}
                />
              </p>
            </div>
          ) : null}
        </div>

        {trip.softLimit != null ? (
          <div className="relative mt-4 space-y-2">
            <LimitBar pct={trip.pct} over={trip.overLimit} />
            <div className="flex items-start justify-between gap-3 text-xs font-semibold">
              <p
                className={
                  trip.overLimit
                    ? "text-amber-800 dark:text-amber-300"
                    : "text-[var(--muted)]"
                }
              >
                {trip.overLimit
                  ? t("travelsOverLimit")
                  : fill(t("travelsProgressHint"), {
                      pct: String(Math.round(trip.pct ?? 0)),
                    })}
              </p>
              {dailyBudget != null ? (
                <p className="shrink-0 text-end text-[var(--accent-b-text)]">
                  {t("travelsDailyBudget")}
                  <br />
                  <span className="text-sm tabular-nums">
                    <Money
                      amount={dailyBudget}
                      currency={trip.currency}
                      locale={locale}
                    />
                  </span>
                </p>
              ) : null}
            </div>
          </div>
        ) : (
          <p className="relative mt-3 text-xs leading-relaxed text-[var(--muted)]">
            {t("travelsNoLimitInsight")}
          </p>
        )}

        <div className="relative mt-4 grid grid-cols-2 gap-2 border-t border-[var(--chrome-edge)] pt-3 text-sm">
          <div className="px-1">
            <p className="text-xs text-[var(--muted)]">{t("travelsFromCurrent")}</p>
            <p className="font-bold tabular-nums">
              <Money
                amount={trip.fromWallet ?? 0}
                currency={trip.currency}
                locale={locale}
              />
            </p>
          </div>
          <div className="border-s border-[var(--chrome-edge)] px-3">
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

      {isOpen && !showSpend && !showEdit && !editingSpendId ? (
        <button
          type="button"
          onClick={openSpend}
          className="mb-4 flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-[var(--cta-bg)] px-4 text-base font-semibold text-[var(--cta-fg)] shadow-sm transition hover:opacity-95 active:scale-[0.99]"
        >
          <span aria-hidden>＋</span>
          {t("travelsAddSpend")}
        </button>
      ) : null}

      {showEdit ? (
        <form
          onSubmit={onSaveEdit}
          className="surface mb-4 space-y-3 rounded-[1.75rem] p-4 ring-1 ring-sky-200/70"
        >
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-base font-bold">{t("travelsEditTitle")}</h2>
            <button
              type="button"
              onClick={closePanels}
              className="rounded-xl px-2.5 py-1 text-sm font-semibold text-[var(--muted)]"
            >
              {t("travelsCancel")}
            </button>
          </div>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-[var(--muted)]">
              {t("travelsName")}
            </span>
            <input
              className="field text-base"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              required
              autoFocus
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-[var(--muted)]">
              {t("travelsCurrency")}
            </span>
            <select
              className="field text-base"
              value={editCurrency}
              onChange={(e) => setEditCurrency(e.target.value)}
            >
              {CURRENCY_OPTIONS.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.code} — {locale === "ar" ? c.labelAr : c.labelEn}
                </option>
              ))}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-[var(--muted)]">
                {t("travelsFrom")}
              </span>
              <DateField value={editStartsOn} onChange={setEditStartsOn} />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-[var(--muted)]">
                {t("travelsTo")}
              </span>
              <DateField value={editEndsOn} onChange={setEditEndsOn} />
            </label>
          </div>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-[var(--muted)]">
              {t("travelsLimit")}
            </span>
            <input
              inputMode="decimal"
              dir="ltr"
              className="amount-input field text-2xl font-bold"
              value={editLimit}
              onChange={(e) => setEditLimit(e.target.value)}
              placeholder={t("travelsLimitPlaceholder")}
            />
          </label>
          <button
            disabled={editBusy}
            className="w-full rounded-3xl bg-sky-800 px-4 py-3.5 text-base font-semibold text-white disabled:opacity-60"
          >
            {editBusy ? t("saving") : t("travelsEditSave")}
          </button>
        </form>
      ) : null}

      {showSpend && isOpen ? (
        <form
          onSubmit={onSpend}
          className="surface mb-5 space-y-3 rounded-[1.75rem] p-4 ring-1 ring-sky-200/70"
        >
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-base font-bold">{t("travelsAddSpend")}</h2>
            <button
              type="button"
              onClick={closePanels}
              className="rounded-xl px-2.5 py-1 text-sm font-semibold text-[var(--muted)]"
            >
              {t("travelsCancel")}
            </button>
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
                className={`seg-item ${paidFrom === "CURRENT" ? "seg-active" : ""}`}
                aria-pressed={paidFrom === "CURRENT"}
              >
                <span className="seg-ico" aria-hidden>
                  💵
                </span>
                {t("travelsFromCurrent")}
              </button>
              <button
                type="button"
                onClick={() => setPaidFrom("CASH")}
                className={`seg-item ${paidFrom === "CASH" ? "seg-active" : ""}`}
                aria-pressed={paidFrom === "CASH"}
              >
                <span className="seg-ico" aria-hidden>
                  📋
                </span>
                {t("travelsFromCash")}
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
            <DateField value={occurredOn} onChange={setOccurredOn} />
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

      {error && !showSpend && !editingSpendId ? (
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
                className="surface rounded-[1.25rem] px-3.5 py-3"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-2">
                    <span
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-sm"
                      style={{ backgroundColor: `${c.color || "#0369a1"}18` }}
                      aria-hidden
                    >
                      {c.emoji || "•"}
                    </span>
                    <span className="truncate text-sm font-semibold">
                      {categoryLabel(c, locale, t)}
                    </span>
                  </div>
                  <span className="shrink-0 text-sm font-bold tabular-nums">
                    <Money
                      amount={c.total}
                      currency={trip.currency}
                      locale={locale}
                    />
                  </span>
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--panel-soft)]">
                  <div
                    className="h-full rounded-full"
                    style={{
                      backgroundColor: c.color || "#0369a1",
                      width: `${Math.min(
                        100,
                        trip.spent > 0 ? (c.total / trip.spent) * 100 : 0,
                      )}%`,
                    }}
                  />
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="mb-5">
        <div className="mb-2.5 flex items-end justify-between gap-3">
          <h2 className="text-base font-semibold text-[var(--foreground)]">
            {t("travelsLog")}
          </h2>
          {(trip.items?.length ?? 0) > 0 && !offline ? (
            <p className="text-xs font-medium text-[var(--muted)]">
              {t("travelsTapSpendToEdit")}
            </p>
          ) : null}
        </div>
        {(trip.items?.length ?? 0) === 0 ? (
          <div className="surface rounded-[1.35rem] p-4 text-sm text-[var(--muted)]">
            {t("travelsLogEmpty")}
          </div>
        ) : (
          <ul className="space-y-2">
            {(trip.items ?? []).map((item) => {
              const editing = editingSpendId === item.id;
              const editable = !item.pendingSync && !offline;
              return (
                <li
                  key={item.id}
                  className={`surface overflow-hidden rounded-[1.35rem] transition ${
                    editing ? "ring-2 ring-[var(--accent-b)]" : ""
                  }`}
                >
                  <button
                    type="button"
                    className="flex w-full items-start gap-3 px-4 py-3 text-start"
                    onClick={() => (editable ? openSpendEdit(item) : undefined)}
                    disabled={!editable}
                  >
                    <span
                      className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{
                        background: item.category.color || "#0369a1",
                      }}
                      aria-hidden
                    />
                    <div className="flex min-w-0 flex-1 items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-[15px] font-semibold">
                          {categoryLabel(item.category, locale, t)}
                        </p>
                        <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-[var(--muted)]">
                          <ItemDate value={item.occurredOn} locale={locale} />
                          {item.createdAt ? (
                            <ItemTime value={item.createdAt} locale={locale} />
                          ) : null}
                          <span>
                            ·{" "}
                            {item.paidFrom === "CURRENT"
                              ? t("travelsFromCurrent")
                              : t("travelsFromCash")}
                            {item.note ? ` · ${item.note}` : ""}
                            {item.pendingSync
                              ? ` · ${t("travelsPendingSync")}`
                              : ""}
                          </span>
                        </p>
                      </div>
                      <span className="shrink-0 text-base font-bold tabular-nums text-red-800 dark:text-red-300">
                        −
                        <Money
                          amount={item.amount}
                          currency={trip.currency}
                          locale={locale}
                        />
                      </span>
                    </div>
                  </button>
                  {editing ? (
                    <form
                      onSubmit={onSaveSpendEdit}
                      className="space-y-3 border-t border-[var(--surface-border)] px-4 pb-4 pt-3"
                    >
                      <p className="text-sm font-semibold">
                        {t("travelsEditSpend")}
                      </p>
                      <label className="block">
                        <span className="mb-1 block text-xs font-medium text-[var(--muted)]">
                          {t("amount")}
                        </span>
                        <input
                          inputMode="decimal"
                          dir="ltr"
                          className="amount-input field text-2xl font-bold"
                          value={amount}
                          onChange={(e) => setAmount(e.target.value)}
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
                            className={`seg-item ${paidFrom === "CURRENT" ? "seg-active" : ""}`}
                            aria-pressed={paidFrom === "CURRENT"}
                          >
                            <span className="seg-ico" aria-hidden>
                              💵
                            </span>
                            {t("travelsFromCurrent")}
                          </button>
                          <button
                            type="button"
                            onClick={() => setPaidFrom("CASH")}
                            className={`seg-item ${paidFrom === "CASH" ? "seg-active" : ""}`}
                            aria-pressed={paidFrom === "CASH"}
                          >
                            <span className="seg-ico" aria-hidden>
                              📋
                            </span>
                            {t("travelsFromCash")}
                          </button>
                        </div>
                      </div>
                      <CategoryPicker
                        categories={expenseCats}
                        value={categoryId}
                        onChange={setCategoryId}
                      />
                      <div className="surface rounded-[1.5rem] p-3.5 !shadow-none ring-1 ring-[var(--input-border)]">
                        <DateField
                          value={occurredOn}
                          onChange={setOccurredOn}
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
                      {error ? (
                        <p className="text-sm text-red-700">{error}</p>
                      ) : null}
                      <div className="flex items-center gap-2 pt-1">
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => onDeleteSpend(item.id)}
                          className="flex min-h-12 flex-1 items-center justify-center rounded-[1.25rem] bg-[var(--panel-soft)] text-base font-semibold text-rose-700 ring-1 ring-[var(--input-border)] disabled:opacity-60 dark:text-rose-300"
                        >
                          {confirmDeleteSpendId === item.id
                            ? t("confirmDelete")
                            : t("deleteItem")}
                        </button>
                        <button
                          type="submit"
                          disabled={busy}
                          className="flex min-h-12 flex-[1.35] items-center justify-center rounded-[1.25rem] bg-sky-800 text-base font-bold text-white disabled:opacity-60"
                        >
                          {busy ? t("saving") : t("travelsEditSpendSave")}
                        </button>
                      </div>
                    </form>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {isOpen && !offline ? (
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

      {trip.spent < 0.001 && !offline ? (
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

      {confirmSpendOpen ? (
        <div
          className="fixed inset-0 z-[60] flex items-end justify-center bg-black/45 p-3 sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-labelledby="travel-spend-confirm-title"
          onClick={() => {
            if (!busy) setConfirmSpendOpen(false);
          }}
        >
          <div
            className="surface w-full max-w-md overflow-hidden rounded-[1.75rem] shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="border-b border-[var(--surface-border)] px-4 py-3.5">
              <p
                id="travel-spend-confirm-title"
                className="text-base font-semibold text-[var(--foreground)]"
              >
                {t("addConfirmTitle")}
              </p>
              <p className="mt-0.5 text-xs leading-snug text-[var(--muted)]">
                {t("addConfirmHint")}
              </p>
            </div>

            <div className="space-y-3 px-4 py-4">
              <div className="text-center">
                <p className="text-xs font-medium text-[var(--muted)]">
                  {t("amount")}
                </p>
                <p className="mt-1 text-3xl font-bold tabular-nums text-[var(--foreground)]">
                  <Money
                    amount={confirmSpendAmount}
                    currency={trip.currency}
                    locale={locale}
                  />
                </p>
              </div>

              <div
                className={`rounded-2xl px-3 py-3 ring-1 ${spendWalletToneClass}`}
              >
                <p className="text-[11px] font-medium opacity-70">
                  {paidFrom === "CASH"
                    ? t("addConfirmNoCash")
                    : t("addConfirmSource")}
                </p>
                <p className="mt-0.5 text-base font-bold">
                  {paidFrom === "CASH"
                    ? `📋 ${t("travelsFromCash")}`
                    : `💵 ${t("currentWallet")}`}
                </p>
                <p className="mt-1 text-xs leading-snug opacity-80">
                  {paidFrom === "CASH"
                    ? t("travelsFromCashHint")
                    : t("travelsFromCurrentHint")}
                </p>
              </div>

              <dl className="space-y-2 text-sm">
                {selectedSpendCategory ? (
                  <div className="flex items-center justify-between gap-3">
                    <dt className="text-[var(--muted)]">{t("forWhat")}</dt>
                    <dd className="font-semibold text-end">
                      {categoryLabel(selectedSpendCategory, locale, t)}
                    </dd>
                  </div>
                ) : null}
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-[var(--muted)]">{t("day")}</dt>
                  <dd>
                    <ItemDate value={occurredOn} locale={locale} />
                  </dd>
                </div>
                {note.trim() ? (
                  <div className="flex items-start justify-between gap-3">
                    <dt className="shrink-0 text-[var(--muted)]">
                      {t("noteOptional")}
                    </dt>
                    <dd className="text-end font-medium leading-snug">
                      {note.trim()}
                    </dd>
                  </div>
                ) : null}
              </dl>

              {error ? (
                <p className="text-sm text-red-700">{error}</p>
              ) : null}
            </div>

            <div className="flex gap-2 border-t border-[var(--surface-border)] px-4 py-3">
              <button
                type="button"
                disabled={busy}
                onClick={() => void confirmSaveSpend()}
                className="flex min-h-12 flex-1 items-center justify-center rounded-3xl bg-emerald-800 text-base font-semibold text-white disabled:opacity-60"
              >
                {busy ? t("saving") : `✅ ${t("addConfirmAction")}`}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => setConfirmSpendOpen(false)}
                className="min-h-12 rounded-3xl px-4 text-sm font-semibold text-[var(--muted)] disabled:opacity-60"
              >
                {t("subsCancel")}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <BottomNav />
    </PageShell>
  );
}
