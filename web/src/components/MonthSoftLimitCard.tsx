"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { api, parseAmount, todayISO } from "@/lib/api";
import { useI18n } from "@/components/I18nProvider";
import { PrivateMoney } from "@/components/PrivateMoney";
import { Hint } from "@/components/Hint";
import { LimitBar } from "@/components/LimitBar";
import { householdPath } from "@/lib/space";
import { fill } from "@/lib/i18n";

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
  /** Organic month surplus (income − outflow). Unchanged by wallet transfers. */
  savedThisMonth: number;
  /** Surplus auto-moved Current → Savings for this plan. */
  autoMovedToSavings?: number;
  save: SaveTrack | null;
  spendAllowance: SpendAllowanceTrack | null;
  overLimit: boolean;
};

type Props = {
  householdId: string;
  currency: string;
  moneyVisible?: boolean;
  status: MonthSoftLimitStatus | null;
  /** True while home summary is still loading — keeps the card slot stable. */
  loading?: boolean;
  /** Slim progress strip for the redesigned personal home. */
  variant?: "card" | "strip";
  onUpdated: (next: MonthSoftLimitStatus) => void;
};

type PlanVerdict =
  | { kind: "met"; amount: number }
  | { kind: "ahead"; amount: number }
  | { kind: "onTrack"; amount: number }
  | { kind: "behind"; amount: number }
  | { kind: "negative"; amount: number }
  | { kind: "overSpend"; amount: number };

function parseDay(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function periodFraction(from: string, to: string, today: string) {
  const start = parseDay(from).getTime();
  const end = parseDay(to).getTime();
  const now = parseDay(today).getTime();
  const dayMs = 86_400_000;
  const days = Math.max(1, Math.round((end - start) / dayMs) + 1);
  const elapsed = Math.min(
    days,
    Math.max(1, Math.round((now - start) / dayMs) + 1),
  );
  return { days, elapsed, fraction: elapsed / days };
}

function planVerdict(
  save: SaveTrack,
  allowance: SpendAllowanceTrack | null,
  periodFrom: string,
  periodTo: string,
): PlanVerdict {
  if (save.met) {
    return { kind: "met", amount: Math.max(0, save.saved - save.amount) };
  }

  if (allowance?.overAllowance) {
    return {
      kind: "overSpend",
      amount: Math.max(0, -allowance.remaining),
    };
  }

  if (save.saved < -0.001) {
    return { kind: "negative", amount: Math.abs(save.saved) };
  }

  const { fraction } = periodFraction(periodFrom, periodTo, todayISO());
  const expected = save.amount * fraction;
  const delta = save.saved - expected;
  const slack = Math.max(save.amount * 0.03, 1);

  if (delta > slack) return { kind: "ahead", amount: delta };
  if (delta < -slack) return { kind: "behind", amount: Math.abs(delta) };
  return { kind: "onTrack", amount: save.remaining };
}

export function MonthSoftLimitCard({
  householdId,
  currency,
  moneyVisible = true,
  status,
  loading = false,
  variant = "card",
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

  const verdict = useMemo(() => {
    if (!status?.save) return null;
    return planVerdict(
      status.save,
      status.spendAllowance,
      status.periodFrom,
      status.periodTo,
    );
  }, [status]);

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

  if (loading || !status) {
    if (!loading) return null;
    if (variant === "strip") {
      return (
        <section
          className="surface overflow-hidden rounded-[1.25rem] px-4 py-3.5"
          aria-busy="true"
          aria-label={t("monthLimitThisMonth")}
        >
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-semibold text-[var(--foreground)]">
              {t("monthLimitThisMonth")}
            </p>
            <span className="text-xs font-semibold text-[var(--muted)]">…</span>
          </div>
          <div className="mt-2.5 h-1.5 rounded-full bg-[var(--panel-soft)]" />
          <div className="mt-2 flex items-center justify-between gap-2 text-xs text-[var(--muted)]">
            <span>…</span>
            <span>…</span>
          </div>
        </section>
      );
    }
    return (
      <section
        className="surface overflow-hidden rounded-[1.75rem] p-3.5"
        aria-busy="true"
        aria-label={t("monthLimitTitle")}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--accent-a-text)]">
              {t("monthLimitTitle")}
            </p>
            <span className="mt-1.5 inline-flex rounded-full bg-[var(--panel-soft)] px-2.5 py-1 text-xs font-semibold text-[var(--muted)]">
              …
            </span>
          </div>
          <span className="shrink-0 rounded-2xl bg-[var(--panel-soft)] px-3 py-2 text-sm font-semibold text-[var(--muted)]">
            …
          </span>
        </div>
        <div className="mt-3">
          <p className="text-xs font-medium text-[var(--muted)]">…</p>
          <p className="mt-0.5 text-[1.65rem] font-bold leading-none text-[var(--muted)]">
            …
          </p>
        </div>
        <div className="mt-3 h-2 rounded-full bg-[var(--panel-soft)]" />
      </section>
    );
  }

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
              <PrivateMoney
                amount={status.savedThisMonth}
                currency={currency}
                locale={locale}
                visible={moneyVisible}
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

  const tone =
    verdict?.kind === "met" || verdict?.kind === "ahead"
      ? "good"
      : verdict?.kind === "onTrack"
        ? "ok"
        : verdict
          ? "warn"
          : "ok";

  const toneWrap =
    tone === "good"
      ? "bg-[var(--soft-emerald)] text-[var(--accent-a-text)]"
      : tone === "warn"
        ? "bg-[var(--soft-amber)] text-amber-950 dark:text-amber-200"
        : "bg-[var(--panel-soft)] text-[var(--muted)]";

  const toneHero =
    tone === "good"
      ? "text-[var(--accent-a-text)]"
      : tone === "warn"
        ? "text-amber-900 dark:text-amber-200"
        : "text-[var(--foreground)]";

  let statusLabel = "";
  let heroLabel = "";
  if (verdict?.kind === "met") {
    statusLabel = t("monthLimitStatusMet");
    heroLabel =
      verdict.amount > 0.001
        ? t("monthLimitWinExtra")
        : t("monthLimitWinExact");
  } else if (verdict?.kind === "ahead") {
    statusLabel = t("monthLimitStatusAhead");
    heroLabel = t("monthLimitWinAhead");
  } else if (verdict?.kind === "onTrack") {
    statusLabel = t("monthLimitStatusOnTrack");
    heroLabel = t("monthLimitSaveLeft");
  } else if (verdict?.kind === "behind") {
    statusLabel = t("monthLimitStatusBehind");
    heroLabel = t("monthLimitWinBehind");
  } else if (verdict?.kind === "negative") {
    statusLabel = t("monthLimitStatusDown");
    heroLabel = t("monthLimitSaveNegative");
  } else if (verdict?.kind === "overSpend") {
    statusLabel = t("monthLimitStatusOver");
    heroLabel = t("monthLimitOverSpendBy");
  }

  if (variant === "strip") {
    const statusTone =
      tone === "good"
        ? "text-[var(--accent-a-text)]"
        : tone === "warn"
          ? "text-amber-800 dark:text-amber-300"
          : "text-[var(--accent-b-text)]";
    const overSpend =
      allowance && incomeKnown && allowance.overAllowance
        ? Math.max(0, -allowance.remaining)
        : null;
    const leftToSpend =
      allowance && incomeKnown && !allowance.overAllowance
        ? Math.max(0, allowance.remaining)
        : null;
    const leftToSave =
      save && !save.met ? Math.max(0, save.remaining) : null;

    return (
      <section className="surface overflow-hidden rounded-[1.25rem] px-4 py-3.5">
        <button
          type="button"
          onClick={openEdit}
          className="flex w-full flex-col gap-2.5 text-start"
        >
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-semibold text-[var(--foreground)]">
              {t("monthLimitThisMonth")}
            </p>
            {hasPlan && verdict ? (
              <span className={`text-xs font-semibold ${statusTone}`}>
                {statusLabel}
              </span>
            ) : (
              <span className="text-xs font-semibold text-[var(--accent-b-text)]">
                {t("monthLimitSet")}
              </span>
            )}
          </div>
          {hasPlan && save && verdict ? (
            <>
              {(leftToSpend != null || overSpend != null || leftToSave != null) && (
                <div>
                  <p className="text-[11px] font-medium text-[var(--muted)]">
                    {overSpend != null
                      ? t("monthLimitOverSpend")
                      : leftToSpend != null
                        ? t("monthLimitLeftThisMonth")
                        : t("monthLimitSaveLeft")}
                  </p>
                  <p
                    className={`mt-0.5 text-xl font-bold tabular-nums leading-none ${
                      overSpend != null
                        ? "text-amber-800 dark:text-amber-300"
                        : "text-[var(--foreground)]"
                    }`}
                  >
                    <PrivateMoney
                      amount={overSpend ?? leftToSpend ?? leftToSave ?? 0}
                      currency={currency}
                      locale={locale}
                      visible={moneyVisible}
                    />
                  </p>
                </div>
              )}
              <LimitBar
                pct={save.pct}
                over={verdict.kind === "overSpend"}
                tone="save"
                size="sm"
              />
              <div className="flex items-baseline justify-between gap-2 text-xs font-medium text-[var(--muted)]">
                <p className="min-w-0 tabular-nums">
                  {t("monthLimitSavedSoFar")}{" "}
                  <span className="text-[var(--foreground)]">
                    <PrivateMoney
                      amount={Math.max(0, save.saved)}
                      currency={currency}
                      locale={locale}
                      visible={moneyVisible}
                    />
                  </span>
                  <span>
                    {" "}
                    /{" "}
                    <PrivateMoney
                      amount={save.amount}
                      currency={currency}
                      locale={locale}
                      visible={moneyVisible}
                    />
                  </span>
                </p>
                <p className="shrink-0 tabular-nums">
                  {fill(t("monthLimitPct"), {
                    n: String(Math.min(999, Math.round(save.pct))),
                  })}
                </p>
              </div>
              {(status.autoMovedToSavings ?? 0) > 0.001 ? (
                <p className="text-[11px] font-medium text-[var(--muted)]">
                  {t("monthLimitAutoSaveHint")}{" "}
                  <span className="tabular-nums text-[var(--foreground)]">
                    <PrivateMoney
                      amount={status.autoMovedToSavings ?? 0}
                      currency={currency}
                      locale={locale}
                      visible={moneyVisible}
                    />
                  </span>
                </p>
              ) : null}
            </>
          ) : (
            <p className="text-xs leading-snug text-[var(--muted)]">
              {t("monthLimitEmptyHint")}
            </p>
          )}
        </button>
      </section>
    );
  }

  return (
    <section className="surface overflow-hidden rounded-[1.75rem] p-3.5">
      <button
        type="button"
        onClick={openEdit}
        className="flex w-full flex-col gap-3 text-start"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--accent-a-text)]">
              {t("monthLimitTitle")}
            </p>
            {hasPlan && verdict ? (
              <span
                className={`mt-1.5 inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${toneWrap}`}
              >
                {statusLabel}
              </span>
            ) : null}
          </div>
          <span className="shrink-0 rounded-2xl bg-[var(--accent-a)] px-3 py-2 text-sm font-semibold text-[var(--accent-a-fg)]">
            {hasPlan ? t("monthLimitEdit") : t("monthLimitSet")}
          </span>
        </div>

        {hasPlan && save && verdict ? (
          <>
            <div>
              <p className="text-xs font-medium text-[var(--muted)]">
                {heroLabel}
              </p>
              <p
                className={`mt-0.5 text-[1.65rem] font-bold tabular-nums leading-none ${toneHero}`}
              >
                {verdict.kind === "ahead" ||
                (verdict.kind === "met" && verdict.amount > 0.001) ? (
                  <>
                    {moneyVisible ? <span aria-hidden>+</span> : null}
                    <PrivateMoney
                      amount={verdict.amount}
                      currency={currency}
                      locale={locale}
                      visible={moneyVisible}
                    />
                  </>
                ) : verdict.kind === "met" ? (
                  <PrivateMoney
                    amount={save.saved}
                    currency={currency}
                    locale={locale}
                    visible={moneyVisible}
                  />
                ) : (
                  <PrivateMoney
                    amount={verdict.amount}
                    currency={currency}
                    locale={locale}
                    visible={moneyVisible}
                  />
                )}
              </p>
            </div>

            <div>
              <div className="mb-1.5 flex items-baseline justify-between gap-2">
                <p className="text-sm font-semibold tabular-nums text-[var(--foreground)]">
                  <PrivateMoney
                    amount={Math.max(0, save.saved)}
                    currency={currency}
                    locale={locale}
                    visible={moneyVisible}
                  />
                  <span className="font-medium text-[var(--muted)]">
                    {" "}
                    /{" "}
                    <PrivateMoney
                      amount={save.amount}
                      currency={currency}
                      locale={locale}
                      visible={moneyVisible}
                    />
                  </span>
                </p>
                <p className="shrink-0 text-xs font-semibold tabular-nums text-[var(--muted)]">
                  {fill(t("monthLimitPct"), {
                    n: String(Math.min(999, Math.round(save.pct))),
                  })}
                </p>
              </div>
              <LimitBar
                pct={save.pct}
                over={verdict.kind === "overSpend"}
                tone="save"
                size="sm"
              />
            </div>

            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-medium text-[var(--muted)]">
              {!save.met ? (
                <span>
                  {t("monthLimitSaveLeft")}{" "}
                  <span className="tabular-nums text-[var(--foreground)]">
                    <PrivateMoney
                      amount={save.remaining}
                      currency={currency}
                      locale={locale}
                      visible={moneyVisible}
                    />
                  </span>
                </span>
              ) : null}
              {allowance && incomeKnown ? (
                <span>
                  {allowance.overAllowance ? (
                    <>
                      {t("monthLimitOverSpend")}{" "}
                      <span className="tabular-nums text-amber-800 dark:text-amber-300">
                        <PrivateMoney
                          amount={Math.max(0, -allowance.remaining)}
                          currency={currency}
                          locale={locale}
                          visible={moneyVisible}
                        />
                      </span>
                    </>
                  ) : (
                    <>
                      {t("monthLimitSpendRoomShort")}{" "}
                      <span className="tabular-nums text-[var(--foreground)]">
                        <PrivateMoney
                          amount={Math.max(0, allowance.remaining)}
                          currency={currency}
                          locale={locale}
                          visible={moneyVisible}
                        />
                      </span>
                    </>
                  )}
                </span>
              ) : null}
              {(status.autoMovedToSavings ?? 0) > 0.001 ? (
                <span>
                  {t("monthLimitAutoSaveHint")}{" "}
                  <span className="tabular-nums text-[var(--foreground)]">
                    <PrivateMoney
                      amount={status.autoMovedToSavings ?? 0}
                      currency={currency}
                      locale={locale}
                      visible={moneyVisible}
                    />
                  </span>
                </span>
              ) : null}
            </div>
          </>
        ) : (
          <div>
            <p className="text-base font-semibold text-[var(--foreground)]">
              {t("monthLimitEmptyTitle")}
            </p>
            <p className="mt-1 text-sm leading-snug text-[var(--muted)]">
              {t("monthLimitEmptyHint")}
            </p>
          </div>
        )}
      </button>
    </section>
  );
}
