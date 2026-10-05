"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { api, parseAmount } from "@/lib/api";
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

  if (editing) {
    return (
      <section className="surface overflow-hidden rounded-[1.75rem] p-4">
        <form onSubmit={onSave} className="space-y-3">
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

          <label className="block">
            <span className="mb-1 block text-sm font-semibold text-[var(--accent-a-text)]">
              {t("monthLimitModeSave")}
            </span>
            <input
              className="field text-lg"
              inputMode="decimal"
              value={saveDraft}
              onChange={(e) => setSaveDraft(e.target.value)}
              placeholder={t("monthLimitAmountPlaceholder")}
              autoFocus
            />
            <span className="mt-1.5 block text-xs font-medium tabular-nums text-[var(--muted)]">
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
      </section>
    );
  }

  return (
    <section className="surface overflow-hidden rounded-[1.75rem] p-3.5">
      <button
        type="button"
        onClick={openEdit}
        className="flex w-full items-start justify-between gap-3 text-start"
      >
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--accent-a-text)]">
            {t("monthLimitTitle")}
          </p>
          {hasPlan && save ? (
            <>
              <p className="mt-1 text-xl font-bold tabular-nums leading-none text-[var(--foreground)]">
                <Money
                  amount={save.saved}
                  currency={currency}
                  locale={locale}
                />
                <span className="text-sm font-semibold text-[var(--muted)]">
                  {" "}
                  /{" "}
                  <Money
                    amount={save.amount}
                    currency={currency}
                    locale={locale}
                  />
                </span>
              </p>
              <div className="mt-2">
                <LimitBar pct={save.pct} over={false} tone="save" size="sm" />
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
                ) : allowance && incomeKnown ? (
                  <>
                    {t("monthLimitSpendRoomShort")}{" "}
                    <Money
                      amount={Math.max(0, allowance.remaining)}
                      currency={currency}
                      locale={locale}
                    />
                    {allowance.overAllowance ? (
                      <span className="ms-1 text-amber-800 dark:text-amber-300">
                        · {t("monthLimitOverSpend")}
                      </span>
                    ) : null}
                  </>
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
            </>
          ) : (
            <p className="mt-1 text-sm leading-snug text-[var(--muted)]">
              {t("monthLimitEmptyHint")}
            </p>
          )}
        </div>
        <span className="shrink-0 rounded-2xl bg-[var(--accent-a)] px-3 py-2 text-sm font-semibold text-[var(--accent-a-fg)]">
          {hasPlan ? t("monthLimitEdit") : t("monthLimitSet")}
        </span>
      </button>
    </section>
  );
}
