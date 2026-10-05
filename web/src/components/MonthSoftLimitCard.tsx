"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { api, parseAmount } from "@/lib/api";
import { categoryLabel, fill } from "@/lib/i18n";
import { useI18n } from "@/components/I18nProvider";
import { Money } from "@/components/Money";
import { Hint } from "@/components/Hint";
import { LimitBar } from "@/components/LimitBar";
import { householdPath } from "@/lib/space";

export type SaveTrack = {
  amount: number;
  saved: number;
  remaining: number;
  pct: number;
  met: boolean;
};

export type SpendAllowanceTrack = {
  allowance: number;
  spent: number;
  remaining: number;
  pct: number;
  overAllowance: boolean;
};

export type MonthPlanCategory = {
  categoryId: string;
  name: string;
  nameAr: string;
  emoji: string;
  color: string;
  total: number;
  pctOfSpent: number;
};

export type MonthSoftLimitStatus = {
  periodKey: string;
  periodFrom: string;
  periodTo: string;
  saveTargetAmount: number | null;
  periodIncome: number;
  periodOutflow: number;
  spentAll: number;
  commitmentsSpend: number;
  savedThisMonth: number;
  save: SaveTrack | null;
  spendAllowance: SpendAllowanceTrack | null;
  categories: MonthPlanCategory[];
  overLimit: boolean;
};

type Props = {
  householdId: string;
  currency: string;
  status: MonthSoftLimitStatus | null;
  onUpdated: (next: MonthSoftLimitStatus) => void;
};

export function MonthSoftLimitCard({
  householdId,
  currency,
  status,
  onUpdated,
}: Props) {
  const { t, locale } = useI18n();
  const [editing, setEditing] = useState(false);
  const [saveDraft, setSaveDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [error, setError] = useState("");

  const hasPlan =
    status?.saveTargetAmount != null && status.saveTargetAmount > 0;

  useEffect(() => {
    if (!editing || !status) return;
    setSaveDraft(
      status.saveTargetAmount != null ? String(status.saveTargetAmount) : "",
    );
    setError("");
    setConfirmRemove(false);
  }, [editing, status?.periodKey, status?.saveTargetAmount]);

  const liveSavePct = useMemo(() => {
    if (!status) return null;
    const amt = parseAmount(saveDraft.trim());
    if (!Number.isFinite(amt) || amt <= 0) return null;
    const progress = Math.max(0, status.savedThisMonth);
    return Math.round((progress / amt) * 1000) / 10;
  }, [saveDraft, status]);

  function openEdit() {
    if (!status) return;
    setSaveDraft(
      status.saveTargetAmount != null ? String(status.saveTargetAmount) : "",
    );
    setError("");
    setConfirmRemove(false);
    setEditing(true);
  }

  async function onSave(e: FormEvent) {
    e.preventDefault();
    if (!status || busy) return;
    const value = parseAmount(saveDraft.trim());
    if (!Number.isFinite(value) || value <= 0) {
      setError(t("monthLimitAmountHint"));
      return;
    }
    setBusy(true);
    setError("");
    try {
      const next = await api<MonthSoftLimitStatus>(
        householdPath(householdId, "/month-soft-limit"),
        {
          method: "PUT",
          body: JSON.stringify({
            periodKey: status.periodKey,
            saveTargetAmount: value,
          }),
        },
      );
      onUpdated(next);
      setEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("monthLimitSaveFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function onRemove() {
    if (!status || removing) return;
    if (!confirmRemove) {
      setConfirmRemove(true);
      return;
    }
    setRemoving(true);
    setError("");
    try {
      const next = await api<MonthSoftLimitStatus>(
        householdPath(
          householdId,
          `/month-soft-limit?period=${encodeURIComponent(status.periodKey)}`,
        ),
        { method: "DELETE" },
      );
      onUpdated(next);
      setEditing(false);
      setConfirmRemove(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("monthLimitSaveFailed"));
    } finally {
      setRemoving(false);
    }
  }

  if (!status) return null;

  const save = status.save;
  const allowance = status.spendAllowance;
  const incomeKnown = status.periodIncome > 0.001;

  return (
    <section className="surface overflow-hidden rounded-[1.75rem]">
      {!editing ? (
        <div className="p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--accent-a-text)]">
                {t("monthLimitTitle")}
              </p>
              <h2 className="mt-0.5 text-lg font-bold text-[var(--foreground)]">
                {hasPlan ? t("monthLimitHeading") : t("monthLimitEmptyTitle")}
              </h2>
            </div>
            <button
              type="button"
              onClick={openEdit}
              className="shrink-0 rounded-2xl bg-[var(--accent-a)] px-3 py-2 text-sm font-semibold text-[var(--accent-a-fg)]"
            >
              {hasPlan ? t("monthLimitEdit") : t("monthLimitSet")}
            </button>
          </div>

          {hasPlan && save ? (
            <div className="mt-3 space-y-2.5">
              <div className="rounded-2xl bg-[var(--accent-a-soft)] px-3.5 py-3">
                <p className="text-xs font-bold uppercase tracking-wide text-[var(--accent-a-text)]">
                  {t("monthLimitModeSave")}
                </p>
                <p className="mt-2 text-2xl font-bold tabular-nums leading-none text-[var(--foreground)]">
                  <Money
                    amount={save.saved}
                    currency={currency}
                    locale={locale}
                  />
                  <span className="text-base font-semibold text-[var(--muted)]">
                    {" "}
                    /{" "}
                    <Money
                      amount={save.amount}
                      currency={currency}
                      locale={locale}
                    />
                  </span>
                </p>
                <div className="mt-2.5">
                  <LimitBar pct={save.pct} over={false} tone="save" />
                </div>
                <p
                  className={`mt-1.5 text-xs font-medium ${
                    save.met
                      ? "text-[var(--accent-a-text)]"
                      : save.saved < -0.001
                        ? "text-amber-800 dark:text-amber-300"
                        : "text-[var(--muted)]"
                  }`}
                >
                  {save.met ? (
                    t("monthLimitSaveMet")
                  ) : save.saved < -0.001 ? (
                    <>
                      {t("monthLimitSaveNegative")}{" "}
                      <Money
                        amount={Math.abs(save.saved)}
                        currency={currency}
                        locale={locale}
                      />
                    </>
                  ) : (
                    <>
                      {t("monthLimitSaveLeft")}{" "}
                      <Money
                        amount={save.remaining}
                        currency={currency}
                        locale={locale}
                      />
                    </>
                  )}
                </p>
              </div>

              <div className="rounded-2xl bg-[var(--accent-b-soft)] px-3.5 py-3">
                <p className="text-xs font-bold uppercase tracking-wide text-[var(--accent-b-text)]">
                  {t("monthLimitSpendRoom")}
                </p>
                <p className="mt-0.5 text-[11px] leading-snug text-[var(--muted)]">
                  {incomeKnown
                    ? t("monthLimitSpendRoomHint")
                    : t("monthLimitSpendRoomNoIncome")}
                </p>
                {allowance && incomeKnown ? (
                  <>
                    <p className="mt-2 text-xl font-bold tabular-nums leading-none text-[var(--foreground)]">
                      <Money
                        amount={Math.max(0, allowance.remaining)}
                        currency={currency}
                        locale={locale}
                      />
                      <span className="text-sm font-semibold text-[var(--muted)]">
                        {" "}
                        {t("monthLimitSpendRoomLeft")}{" "}
                        <Money
                          amount={allowance.allowance}
                          currency={currency}
                          locale={locale}
                        />
                      </span>
                    </p>
                    <div className="mt-2.5">
                      <LimitBar
                        pct={allowance.pct}
                        over={allowance.overAllowance}
                        tone="personal"
                      />
                    </div>
                    <p
                      className={`mt-1.5 text-xs font-medium ${
                        allowance.overAllowance
                          ? "text-amber-800 dark:text-amber-300"
                          : "text-[var(--muted)]"
                      }`}
                    >
                      {t("monthLimitSpentOfAllowance")}{" "}
                      <Money
                        amount={allowance.spent}
                        currency={currency}
                        locale={locale}
                      />
                    </p>
                  </>
                ) : (
                  <p className="mt-2 text-sm tabular-nums text-[var(--foreground)]">
                    {t("monthLimitSpentSoFar")}{" "}
                    <Money
                      amount={status.periodOutflow}
                      currency={currency}
                      locale={locale}
                    />
                  </p>
                )}
              </div>

              {status.categories.length > 0 ? (
                <div className="rounded-2xl bg-[var(--panel-soft)] px-3.5 py-3">
                  <p className="text-xs font-bold uppercase tracking-wide text-[var(--muted)]">
                    {t("monthLimitWhereSpent")}
                  </p>
                  <ul className="mt-2.5 space-y-2">
                    {status.categories.map((cat) => (
                      <li key={cat.categoryId}>
                        <div className="flex items-center justify-between gap-2 text-sm">
                          <span className="min-w-0 truncate font-medium text-[var(--foreground)]">
                            {cat.emoji ? `${cat.emoji} ` : ""}
                            {categoryLabel(cat, locale, t)}
                          </span>
                          <span className="shrink-0 tabular-nums font-semibold">
                            <Money
                              amount={cat.total}
                              currency={currency}
                              locale={locale}
                            />
                          </span>
                        </div>
                        <div className="mt-1 flex items-center gap-2">
                          <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-[var(--surface-bg)] ring-1 ring-[var(--chrome-edge)]">
                            <div
                              className="h-full rounded-full transition-[width] duration-500"
                              style={{
                                width: `${Math.min(100, cat.pctOfSpent)}%`,
                                backgroundColor: cat.color || "#64748b",
                              }}
                            />
                          </div>
                          <span className="w-10 shrink-0 text-end text-[10px] tabular-nums text-[var(--muted)]">
                            {fill(t("monthLimitPct"), {
                              pct: String(Math.round(cat.pctOfSpent)),
                            })}
                          </span>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              <p className="px-0.5 text-xs leading-snug text-[var(--muted)]">
                {t("monthLimitSoftHint")}
              </p>
            </div>
          ) : (
            <p className="mt-2 text-sm leading-relaxed text-[var(--muted)]">
              {t("monthLimitEmptyHint")}
            </p>
          )}
        </div>
      ) : (
        <form onSubmit={onSave} className="space-y-3 p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-[var(--foreground)]">
                {t("monthLimitEditTitle")}
              </h2>
              <Hint>{t("monthLimitEditHint")}</Hint>
            </div>
            <button
              type="button"
              onClick={() => {
                setEditing(false);
                setError("");
              }}
              className="shrink-0 rounded-2xl border border-[var(--input-border)] bg-[var(--surface-bg)] px-3 py-2 text-sm font-semibold text-[var(--foreground)]"
            >
              {t("monthLimitCancel")}
            </button>
          </div>

          <label className="block rounded-2xl bg-[var(--accent-a-soft)] p-3">
            <span className="mb-0.5 block text-sm font-semibold text-[var(--accent-a-text)]">
              {t("monthLimitModeSave")}
            </span>
            <span className="mb-2 block text-[11px] leading-snug text-[var(--muted)]">
              {t("monthLimitModeSaveHint")}
            </span>
            <input
              className="field text-lg"
              inputMode="decimal"
              value={saveDraft}
              onChange={(e) => setSaveDraft(e.target.value)}
              placeholder={t("monthLimitAmountPlaceholder")}
              autoFocus
            />
            <span className="mt-1.5 block text-xs font-semibold tabular-nums text-[var(--accent-a-text)]">
              {t("monthLimitSavedSoFar")}{" "}
              <Money
                amount={status.savedThisMonth}
                currency={currency}
                locale={locale}
              />
            </span>
            {liveSavePct != null ? (
              <div className="mt-2">
                <LimitBar pct={liveSavePct} over={false} tone="save" size="sm" />
              </div>
            ) : null}
          </label>

          {error ? (
            <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              disabled={busy}
              className="rounded-2xl bg-[var(--cta-bg)] px-4 py-2.5 text-base font-semibold text-[var(--cta-fg)] disabled:opacity-60"
            >
              {busy ? t("monthLimitSaving") : t("monthLimitSave")}
            </button>
            {hasPlan ? (
              <button
                type="button"
                disabled={removing || busy}
                onClick={onRemove}
                className="rounded-2xl border border-amber-500/40 bg-[var(--soft-amber)] px-4 py-2.5 text-base font-semibold text-amber-950 dark:text-amber-200 disabled:opacity-60"
              >
                {confirmRemove
                  ? t("monthLimitRemoveConfirm")
                  : t("monthLimitRemove")}
              </button>
            ) : null}
          </div>
        </form>
      )}
    </section>
  );
}
