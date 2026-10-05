"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { api, parseAmount } from "@/lib/api";
import { fill } from "@/lib/i18n";
import { useI18n } from "@/components/I18nProvider";
import { Money } from "@/components/Money";
import { Hint } from "@/components/Hint";
import { LimitBar } from "@/components/LimitBar";
import { householdPath } from "@/lib/space";

export type SoftLimitMode = "PERSONAL" | "ALL";

export type MonthSoftLimitStatus = {
  periodKey: string;
  periodFrom: string;
  periodTo: string;
  amount: number | null;
  mode: SoftLimitMode | null;
  spent: number;
  spentPersonal: number;
  spentAll: number;
  commitmentsSpend: number;
  remaining: number | null;
  pct: number | null;
  overLimit: boolean;
};

type Props = {
  householdId: string;
  currency: string;
  status: MonthSoftLimitStatus | null;
  onUpdated: (next: MonthSoftLimitStatus) => void;
};

function previewSpent(status: MonthSoftLimitStatus, mode: SoftLimitMode) {
  return mode === "ALL" ? status.spentAll : status.spentPersonal;
}

export function MonthSoftLimitCard({
  householdId,
  currency,
  status,
  onUpdated,
}: Props) {
  const { t, locale } = useI18n();
  const [editing, setEditing] = useState(false);
  const [amountDraft, setAmountDraft] = useState("");
  const [modeDraft, setModeDraft] = useState<SoftLimitMode>("PERSONAL");
  const [busy, setBusy] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [error, setError] = useState("");

  const hasLimit = status?.amount != null && status.amount > 0;

  useEffect(() => {
    if (!editing || !status) return;
    setAmountDraft(status.amount != null ? String(status.amount) : "");
    setModeDraft(status.mode ?? "PERSONAL");
    setError("");
    setConfirmRemove(false);
  }, [editing, status?.periodKey, status?.amount, status?.mode]);

  const liveSpent = useMemo(() => {
    if (!status) return 0;
    return previewSpent(status, modeDraft);
  }, [status, modeDraft]);

  const livePct = useMemo(() => {
    const amt = parseAmount(amountDraft);
    if (!Number.isFinite(amt) || amt <= 0) return null;
    return Math.round((liveSpent / amt) * 1000) / 10;
  }, [amountDraft, liveSpent]);

  const liveOver = livePct != null && livePct > 100.001;

  function openEdit() {
    if (!status) return;
    setAmountDraft(status.amount != null ? String(status.amount) : "");
    setModeDraft(status.mode ?? "PERSONAL");
    setError("");
    setConfirmRemove(false);
    setEditing(true);
  }

  function closeEdit() {
    setEditing(false);
    setError("");
    setConfirmRemove(false);
  }

  async function onSave(e: FormEvent) {
    e.preventDefault();
    if (!status || busy) return;
    const value = parseAmount(amountDraft);
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
            amount: value,
            mode: modeDraft,
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

  const modeLabel =
    status.mode === "ALL" ? t("monthLimitModeAll") : t("monthLimitModePersonal");

  return (
    <section className="surface overflow-hidden rounded-[1.75rem]">
      {!editing ? (
        <div className="p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wide text-sky-800">
                {t("monthLimitTitle")}
              </p>
              <h2 className="mt-0.5 text-lg font-bold text-[var(--foreground)]">
                {hasLimit ? t("monthLimitHeading") : t("monthLimitEmptyTitle")}
              </h2>
            </div>
            <button
              type="button"
              onClick={openEdit}
              className="shrink-0 rounded-2xl bg-sky-800 px-3 py-2 text-sm font-semibold text-white"
            >
              {hasLimit ? t("monthLimitEdit") : t("monthLimitSet")}
            </button>
          </div>

          {hasLimit && status.amount != null ? (
            <>
              <div className="mt-3 flex flex-wrap items-end justify-between gap-2">
                <p className="text-2xl font-bold tabular-nums leading-none">
                  <Money
                    amount={status.spent}
                    currency={currency}
                    locale={locale}
                  />
                  <span className="text-base font-semibold text-[var(--muted)]">
                    {" "}
                    /{" "}
                    <Money
                      amount={status.amount}
                      currency={currency}
                      locale={locale}
                    />
                  </span>
                </p>
                <span
                  className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide ${
                    status.overLimit
                      ? "bg-amber-100 text-amber-900"
                      : "bg-sky-100 text-sky-900"
                  }`}
                >
                  {modeLabel}
                </span>
              </div>

              <div className="mt-3">
                <LimitBar pct={status.pct} over={status.overLimit} />
              </div>

              <div className="mt-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-sm">
                <p
                  className={
                    status.overLimit
                      ? "font-semibold text-amber-800"
                      : "font-medium text-[var(--muted)]"
                  }
                >
                  {status.overLimit ? (
                    <>
                      {t("monthLimitOverBy")}{" "}
                      <Money
                        amount={status.spent - status.amount}
                        currency={currency}
                        locale={locale}
                      />
                    </>
                  ) : status.remaining != null ? (
                    <>
                      {t("monthLimitRemaining")}{" "}
                      <Money
                        amount={status.remaining}
                        currency={currency}
                        locale={locale}
                      />
                    </>
                  ) : null}
                </p>
                {status.pct != null ? (
                  <p className="tabular-nums text-[var(--muted)]">
                    {fill(t("monthLimitPct"), {
                      pct: String(Math.round(status.pct)),
                    })}
                  </p>
                ) : null}
              </div>

              {status.mode === "ALL" && status.commitmentsSpend > 0.001 ? (
                <p className="mt-2 text-xs leading-snug text-[var(--muted)]">
                  {t("monthLimitCommitmentsPart")}{" "}
                  <Money
                    amount={status.commitmentsSpend}
                    currency={currency}
                    locale={locale}
                  />
                  {" · "}
                  {t("monthLimitPersonalSlice")}{" "}
                  <Money
                    amount={status.spentPersonal}
                    currency={currency}
                    locale={locale}
                  />
                </p>
              ) : status.mode === "PERSONAL" &&
                status.commitmentsSpend > 0.001 ? (
                <p className="mt-2 text-xs leading-snug text-[var(--muted)]">
                  {t("monthLimitCommitmentsExcluded")}{" "}
                  <Money
                    amount={status.commitmentsSpend}
                    currency={currency}
                    locale={locale}
                  />
                </p>
              ) : (
                <p className="mt-2 text-xs leading-snug text-[var(--muted)]">
                  {t("monthLimitSoftHint")}
                </p>
              )}
            </>
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
              <h2 className="text-lg font-bold">{t("monthLimitEditTitle")}</h2>
              <Hint>{t("monthLimitEditHint")}</Hint>
            </div>
            <button
              type="button"
              onClick={closeEdit}
              className="shrink-0 rounded-2xl border border-[var(--input-border)] bg-[var(--surface-bg)] px-3 py-2 text-sm font-semibold"
            >
              {t("monthLimitCancel")}
            </button>
          </div>

          <label className="block">
            <span className="mb-1 block text-xs font-medium text-[var(--muted)]">
              {t("monthLimitAmount")}
            </span>
            <input
              className="field text-lg"
              inputMode="decimal"
              value={amountDraft}
              onChange={(e) => setAmountDraft(e.target.value)}
              placeholder={t("monthLimitAmountPlaceholder")}
              autoFocus
            />
          </label>

          <fieldset>
            <legend className="mb-1.5 text-xs font-medium text-[var(--muted)]">
              {t("monthLimitMode")}
            </legend>
            <div className="grid grid-cols-2 gap-2">
              {(
                [
                  {
                    id: "PERSONAL" as const,
                    title: t("monthLimitModePersonal"),
                    hint: t("monthLimitModePersonalHint"),
                    spent: status.spentPersonal,
                  },
                  {
                    id: "ALL" as const,
                    title: t("monthLimitModeAll"),
                    hint: t("monthLimitModeAllHint"),
                    spent: status.spentAll,
                  },
                ] as const
              ).map((opt) => {
                const active = modeDraft === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setModeDraft(opt.id)}
                    className={`rounded-2xl border px-3 py-2.5 text-start transition ${
                      active
                        ? "border-sky-700 bg-sky-50 ring-2 ring-sky-700/30"
                        : "border-[var(--input-border)] bg-[var(--panel-soft)] hover:bg-[var(--surface-bg)]"
                    }`}
                  >
                    <span className="block text-sm font-semibold leading-snug">
                      {opt.title}
                    </span>
                    <span className="mt-0.5 block text-[11px] leading-snug text-[var(--muted)]">
                      {opt.hint}
                    </span>
                    <span className="mt-1.5 block text-xs font-semibold tabular-nums text-sky-900">
                      {t("monthLimitSoFar")}{" "}
                      <Money
                        amount={opt.spent}
                        currency={currency}
                        locale={locale}
                      />
                    </span>
                  </button>
                );
              })}
            </div>
          </fieldset>

          {livePct != null ? (
            <div className="rounded-2xl bg-[var(--panel-soft)] px-3 py-2.5">
              <div className="flex items-center justify-between gap-2 text-sm">
                <span className="font-medium text-[var(--muted)]">
                  {t("monthLimitPreview")}
                </span>
                <span
                  className={`font-semibold tabular-nums ${
                    liveOver ? "text-amber-800" : "text-[var(--foreground)]"
                  }`}
                >
                  {fill(t("monthLimitPct"), {
                    pct: String(Math.round(livePct)),
                  })}
                </span>
              </div>
              <div className="mt-2">
                <LimitBar pct={livePct} over={liveOver} />
              </div>
            </div>
          ) : null}

          {error ? <p className="text-sm text-red-700">{error}</p> : null}

          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              disabled={busy}
              className="rounded-2xl bg-[var(--cta-bg)] px-4 py-2.5 text-base font-semibold text-[var(--cta-fg)] disabled:opacity-60"
            >
              {busy ? t("monthLimitSaving") : t("monthLimitSave")}
            </button>
            {hasLimit ? (
              <button
                type="button"
                disabled={removing || busy}
                onClick={onRemove}
                className="rounded-2xl border border-amber-300 bg-amber-50 px-4 py-2.5 text-base font-semibold text-amber-950 disabled:opacity-60"
              >
                {confirmRemove
                  ? t("monthLimitRemoveConfirm")
                  : t("monthLimitRemove")}
              </button>
            ) : null}
          </div>
          <p className="text-xs leading-snug text-[var(--muted)]">
            {t("monthLimitSoftHint")}
          </p>
        </form>
      )}
    </section>
  );
}
