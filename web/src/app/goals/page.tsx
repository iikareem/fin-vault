"use client";

import { FormEvent, useEffect, useState } from "react";
import { api, parseAmount, money } from "@/lib/api";
import { BottomNav } from "@/components/BottomNav";
import { PageShell } from "@/components/PageShell";
import { Money } from "@/components/Money";
import { useI18n } from "@/components/I18nProvider";
import { useBooks } from "@/components/BooksProvider";
import { householdPath } from "@/lib/space";
import { Hint } from "@/components/Hint";
import { fill } from "@/lib/i18n";

type Goal = {
  id: string;
  name: string;
  targetAmount: number;
  savedAmount: number;
  remaining: number;
  pct: number;
  note: string;
  color: string;
};

type GoalsSummary = {
  savingsBalance: number;
  currentBalance: number;
  allocated: number;
  free: number;
  totalTarget: number;
  goals: Goal[];
};

type ActionMode = "allocate" | "release" | null;

const ACCENT_COLORS = [
  "#0f766e",
  "#0369a1",
  "#7c3aed",
  "#b45309",
  "#be123c",
  "#15803d",
];

function ProgressBar({ pct, color }: { pct: number; color: string }) {
  const width = Math.min(100, Math.max(0, pct));
  return (
    <div className="h-2.5 w-full overflow-hidden rounded-full bg-[var(--panel-soft)]">
      <div
        className="h-full rounded-full transition-[width] duration-500 ease-out"
        style={{
          width: `${width}%`,
          background: `linear-gradient(90deg, ${color}cc, ${color})`,
        }}
      />
    </div>
  );
}

export default function GoalsPage() {
  const { t, locale } = useI18n();
  const { personal, setKind, active } = useBooks();
  const currency = personal?.currency ?? "EGP";

  const [data, setData] = useState<GoalsSummary | null>(null);
  const [name, setName] = useState("");
  const [target, setTarget] = useState("");
  const [note, setNote] = useState("");
  const [color, setColor] = useState(ACCENT_COLORS[0]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [deletingId, setDeletingId] = useState("");
  const [buyingId, setBuyingId] = useState("");
  const [confirmBuyId, setConfirmBuyId] = useState("");
  const [actionId, setActionId] = useState("");
  const [actionMode, setActionMode] = useState<ActionMode>(null);
  const [actionAmount, setActionAmount] = useState("");
  const [fromSource, setFromSource] = useState<"CURRENT" | "SAVINGS">(
    "CURRENT",
  );
  const [actionBusy, setActionBusy] = useState(false);

  function load(hid: string) {
    return api<GoalsSummary>(householdPath(hid, "/savings-goals")).then(
      setData,
    );
  }

  useEffect(() => {
    if (!personal) return;
    setKind("PERSONAL");
    load(personal.householdId).catch((e) => setError(e.message));
  }, [personal?.householdId]);

  function openAction(id: string, mode: Exclude<ActionMode, null>) {
    setActionId(id);
    setActionMode(mode);
    setActionAmount("");
    setFromSource(
      data && data.free > 0.001 && mode === "allocate" ? "SAVINGS" : "CURRENT",
    );
    setError("");
  }

  function closeAction() {
    setActionId("");
    setActionMode(null);
    setActionAmount("");
  }

  async function onAdd(e: FormEvent) {
    e.preventDefault();
    if (!personal) return;
    const targetAmt = parseAmount(target);
    if (!name.trim()) {
      setError(t("goalsNameHint"));
      return;
    }
    if (!(targetAmt > 0)) {
      setError(t("goalsTargetHint"));
      return;
    }
    setBusy(true);
    setError("");
    try {
      const next = await api<GoalsSummary>(
        householdPath(personal.householdId, "/savings-goals"),
        {
          method: "POST",
          body: JSON.stringify({
            name: name.trim(),
            targetAmount: targetAmt,
            note: note.trim() || undefined,
            color,
          }),
        },
      );
      setData(next);
      setName("");
      setTarget("");
      setNote("");
      setColor(ACCENT_COLORS[(next.goals.length || 0) % ACCENT_COLORS.length]);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("couldNotSave"));
    } finally {
      setBusy(false);
    }
  }

  async function onDelete(id: string) {
    if (!personal) return;
    setDeletingId(id);
    setError("");
    try {
      const next = await api<GoalsSummary>(
        householdPath(personal.householdId, `/savings-goals/${id}`),
        { method: "DELETE" },
      );
      setData(next);
      if (actionId === id) closeAction();
      if (confirmBuyId === id) setConfirmBuyId("");
    } catch (err) {
      setError(err instanceof Error ? err.message : t("couldNotSave"));
    } finally {
      setDeletingId("");
    }
  }

  async function onBuy(id: string) {
    if (!personal) return;
    setBuyingId(id);
    setError("");
    try {
      const next = await api<GoalsSummary>(
        householdPath(personal.householdId, `/savings-goals/${id}/buy`),
        { method: "POST", body: JSON.stringify({}) },
      );
      setData(next);
      setConfirmBuyId("");
      if (actionId === id) closeAction();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("couldNotSave"));
    } finally {
      setBuyingId("");
    }
  }

  async function submitAction(e: FormEvent) {
    e.preventDefault();
    if (!personal || !actionId || !actionMode) return;
    const amount = parseAmount(actionAmount);
    if (!(amount > 0)) {
      setError(t("goalsActionAmount"));
      return;
    }
    setActionBusy(true);
    setError("");
    try {
      const path =
        actionMode === "allocate"
          ? `/savings-goals/${actionId}/allocate`
          : `/savings-goals/${actionId}/release`;
      const body =
        actionMode === "allocate"
          ? { amount, from: fromSource }
          : { amount };
      const next = await api<GoalsSummary>(
        householdPath(personal.householdId, path),
        { method: "POST", body: JSON.stringify(body) },
      );
      setData(next);
      closeAction();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("couldNotSave"));
    } finally {
      setActionBusy(false);
    }
  }

  if (active?.kind === "HOUSE" && !personal) {
    return (
      <PageShell>
        <p className="text-[var(--muted)]">{t("goalsHint")}</p>
        <BottomNav />
      </PageShell>
    );
  }

  const allocatedPct =
    data && data.savingsBalance > 0
      ? Math.min(
          100,
          Math.round((data.allocated / data.savingsBalance) * 1000) / 10,
        )
      : 0;

  return (
    <PageShell>
      <h1 className="page-title">🎯 {t("goalsTitle")}</h1>
      <Hint>{t("goalsHint")}</Hint>
      {error ? <p className="mt-3 text-red-700">{error}</p> : null}

      <section className="mt-4 overflow-hidden rounded-[1.75rem] bg-gradient-to-br from-teal-900 via-teal-800 to-emerald-950 p-5 text-white shadow-lg">
        <p className="text-base opacity-90">{t("goalsHeroTitle")}</p>
        <p className="mt-1 text-[clamp(1.4rem,7.2vw,2.25rem)] font-bold leading-tight">
          {data ? (
            <Money
              amount={data.savingsBalance}
              currency={currency}
              locale={locale}
            />
          ) : (
            "…"
          )}
        </p>

        <div className="mt-4 h-2.5 overflow-hidden rounded-full bg-white/15">
          <div
            className="h-full rounded-full bg-emerald-300/90 transition-[width] duration-500"
            style={{ width: `${allocatedPct}%` }}
          />
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3">
          <div className="rounded-2xl bg-white/12 px-3 py-2.5">
            <p className="text-xs opacity-80">{t("goalsAllocated")}</p>
            <p className="mt-0.5 text-lg font-semibold">
              {data ? (
                <Money
                  amount={data.allocated}
                  currency={currency}
                  locale={locale}
                />
              ) : (
                "…"
              )}
            </p>
          </div>
          <div className="rounded-2xl bg-white/12 px-3 py-2.5">
            <p className="text-xs opacity-80">{t("goalsFree")}</p>
            <p className="mt-0.5 text-lg font-semibold">
              {data ? (
                <Money amount={data.free} currency={currency} locale={locale} />
              ) : (
                "…"
              )}
            </p>
          </div>
        </div>
        <p className="mt-3 text-sm opacity-80">{t("goalsFreeHint")}</p>
      </section>

      <form
        onSubmit={onAdd}
        className="surface mt-5 space-y-3 rounded-[1.75rem] p-4"
      >
        <h2 className="text-xl font-semibold">➕ {t("goalsAdd")}</h2>
        <label className="block">
          <span className="mb-1 block font-medium">{t("goalsName")}</span>
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="field w-full rounded-2xl px-4 py-3 text-lg"
            placeholder={t("goalsNamePlaceholder")}
            dir="auto"
          />
          <Hint>{t("goalsNameHint")}</Hint>
        </label>
        <label className="block">
          <span className="mb-1 block font-medium">{t("goalsTarget")}</span>
          <input
            inputMode="decimal"
            dir="ltr"
            required
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            className="field amount-input w-full rounded-2xl px-4 py-4 text-2xl"
            placeholder="50000"
          />
          <Hint>{t("goalsTargetHint")}</Hint>
        </label>
        <div>
          <p className="mb-2 text-sm font-medium text-[var(--muted)]">
            {t("goalsColor")}
          </p>
          <div className="flex flex-wrap gap-2">
            {ACCENT_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={c}
                onClick={() => setColor(c)}
                className={`h-9 w-9 rounded-full transition ${
                  color === c
                    ? "ring-2 ring-[var(--foreground)] ring-offset-2 ring-offset-[var(--surface-bg)]"
                    : "opacity-80"
                }`}
                style={{ background: c }}
              />
            ))}
          </div>
        </div>
        <label className="block">
          <span className="mb-1 block font-medium">{t("noteOptional")}</span>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="field w-full rounded-2xl px-4 py-3 text-lg"
            dir="auto"
          />
        </label>
        <button
          type="submit"
          disabled={busy || !personal}
          className="flex min-h-14 w-full items-center justify-center rounded-2xl bg-teal-800 text-lg font-semibold text-white disabled:opacity-60"
        >
          {busy ? t("saving") : t("save")}
        </button>
      </form>

      <section className="surface mt-6 overflow-hidden rounded-[1.75rem]">
        <div className="border-b border-[var(--surface-border)] bg-[var(--soft-emerald)] px-4 py-3">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="text-xl font-semibold">{t("goalsList")}</h2>
            {data && data.goals.length > 0 ? (
              <span className="text-sm font-medium text-[var(--muted)]">
                {data.goals.length === 1
                  ? t("goalsCountOne")
                  : fill(t("goalsCount"), {
                      n: String(data.goals.length),
                    })}
              </span>
            ) : null}
          </div>
          <Hint>{t("goalsListHint")}</Hint>
        </div>

        {!data ? (
          <p className="px-4 py-5 text-[var(--muted)]">…</p>
        ) : data.goals.length === 0 ? (
          <p className="px-4 py-5 text-[var(--muted)]">{t("goalsEmpty")}</p>
        ) : (
          <ul className="divide-y divide-[var(--surface-border)]">
            {data.goals.map((g) => {
              const done = g.savedAmount + 0.001 >= g.targetAmount;
              const isOpen = actionId === g.id;
              return (
                <li key={g.id} className="px-4 py-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span
                          className="h-3 w-3 shrink-0 rounded-full"
                          style={{ background: g.color }}
                          aria-hidden
                        />
                        <p
                          className="truncate text-lg font-semibold"
                          dir="auto"
                        >
                          {g.name}
                        </p>
                      </div>
                      {g.note ? (
                        <p
                          className="mt-1 text-sm text-[var(--muted)]"
                          dir="auto"
                        >
                          {g.note}
                        </p>
                      ) : null}
                    </div>
                    <p className="shrink-0 text-sm font-bold text-[var(--accent-a-text)]">
                      {fill(t("goalsProgress"), { pct: String(g.pct) })}
                    </p>
                  </div>

                  <div className="mt-3">
                    <ProgressBar pct={g.pct} color={g.color} />
                    <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-sm">
                      <span className="font-medium">
                        <Money
                          amount={g.savedAmount}
                          currency={currency}
                          locale={locale}
                        />
                        <span className="text-[var(--muted)]"> / </span>
                        <Money
                          amount={g.targetAmount}
                          currency={currency}
                          locale={locale}
                        />
                      </span>
                      {done ? (
                        <span className="font-semibold text-[var(--accent-a-text)]">
                          {t("goalsDone")}
                        </span>
                      ) : (
                        <span className="text-[var(--muted)]">
                          {fill(t("goalsRemaining"), {
                            amount: money(g.remaining, currency, locale),
                          })}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2">
                    {done ? (
                      <button
                        type="button"
                        disabled={!!buyingId}
                        onClick={() => {
                          setConfirmBuyId(g.id);
                          setError("");
                        }}
                        className="rounded-xl bg-emerald-700 px-3 py-2 text-sm font-semibold text-white shadow-sm disabled:opacity-60"
                      >
                        🛍 {t("goalsBuy")}
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => openAction(g.id, "allocate")}
                        className="rounded-xl bg-teal-800 px-3 py-2 text-sm font-semibold text-white"
                      >
                        ＋ {t("goalsAddMoney")}
                      </button>
                    )}
                    {!done ? (
                      g.savedAmount > 0.001 ? (
                        <button
                          type="button"
                          onClick={() => openAction(g.id, "release")}
                          className="rounded-xl bg-[var(--panel-soft)] px-3 py-2 text-sm font-semibold"
                        >
                          {t("goalsRelease")}
                        </button>
                      ) : null
                    ) : (
                      <button
                        type="button"
                        onClick={() => openAction(g.id, "allocate")}
                        className="rounded-xl bg-[var(--panel-soft)] px-3 py-2 text-sm font-semibold"
                      >
                        ＋ {t("goalsAddMoney")}
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={!!deletingId}
                      onClick={() => onDelete(g.id)}
                      className="rounded-xl px-3 py-2 text-sm font-semibold text-red-700 hover:bg-[var(--soft-red)] disabled:opacity-60"
                    >
                      {deletingId === g.id ? t("saving") : t("goalsDelete")}
                    </button>
                  </div>

                  {confirmBuyId === g.id ? (
                    <div className="mt-3 space-y-2 rounded-2xl bg-[var(--soft-emerald)] p-3">
                      <p className="text-sm font-medium text-[var(--accent-a-text)]">
                        {t("goalsBuyConfirm")}
                      </p>
                      <Hint>{t("goalsBuyHint")}</Hint>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          disabled={!!buyingId}
                          onClick={() => onBuy(g.id)}
                          className="flex min-h-12 flex-1 items-center justify-center rounded-2xl bg-emerald-700 font-semibold text-white disabled:opacity-60"
                        >
                          {buyingId === g.id ? t("goalsBuying") : t("goalsBuy")}
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmBuyId("")}
                          className="min-h-12 rounded-2xl bg-[var(--surface-bg)] px-4 font-semibold text-[var(--muted)]"
                        >
                          {t("goalsCancel")}
                        </button>
                      </div>
                    </div>
                  ) : null}

                  {isOpen && actionMode ? (
                    <form
                      onSubmit={submitAction}
                      className="mt-3 space-y-3 rounded-2xl bg-[var(--panel-soft)] p-3"
                    >
                      <p className="text-sm font-medium">
                        {actionMode === "allocate"
                          ? t("goalsAddMoney")
                          : t("goalsRelease")}
                      </p>
                      <Hint>
                        {actionMode === "allocate"
                          ? t("goalsAddMoneyHint")
                          : t("goalsReleaseHint")}
                      </Hint>
                      {actionMode === "allocate" ? (
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            type="button"
                            onClick={() => setFromSource("CURRENT")}
                            className={`rounded-2xl px-2 py-3 text-sm font-bold ${
                              fromSource === "CURRENT"
                                ? "bg-teal-800 text-white shadow"
                                : "bg-[var(--surface-bg)]"
                            }`}
                          >
                            💵 {t("goalsFromCurrent")}
                          </button>
                          <button
                            type="button"
                            onClick={() => setFromSource("SAVINGS")}
                            className={`rounded-2xl px-2 py-3 text-sm font-bold ${
                              fromSource === "SAVINGS"
                                ? "bg-teal-800 text-white shadow"
                                : "bg-[var(--surface-bg)]"
                            }`}
                          >
                            💰 {t("goalsFromSavings")}
                          </button>
                        </div>
                      ) : null}
                      <label className="block">
                        <span className="mb-1 block text-sm font-medium">
                          {t("goalsActionAmount")}
                        </span>
                        <input
                          inputMode="decimal"
                          dir="ltr"
                          required
                          autoFocus
                          value={actionAmount}
                          onChange={(e) => setActionAmount(e.target.value)}
                          className="field amount-input w-full rounded-2xl px-4 py-3 text-xl"
                          placeholder="1000"
                        />
                      </label>
                      <div className="flex gap-2">
                        <button
                          type="submit"
                          disabled={actionBusy}
                          className="flex min-h-12 flex-1 items-center justify-center rounded-2xl bg-teal-800 font-semibold text-white disabled:opacity-60"
                        >
                          {actionBusy ? t("saving") : t("save")}
                        </button>
                        <button
                          type="button"
                          onClick={closeAction}
                          className="min-h-12 rounded-2xl bg-[var(--surface-bg)] px-4 font-semibold text-[var(--muted)]"
                        >
                          {t("goalsCancel")}
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
      <BottomNav />
    </PageShell>
  );
}
