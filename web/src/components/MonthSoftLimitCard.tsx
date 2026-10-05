"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { api, parseAmount } from "@/lib/api";
import { fill } from "@/lib/i18n";
import { useI18n } from "@/components/I18nProvider";
import { Money } from "@/components/Money";
import { Hint } from "@/components/Hint";
import { LimitBar, type LimitBarTone } from "@/components/LimitBar";
import { householdPath } from "@/lib/space";

export type CeilingTrack = {
  amount: number;
  spent: number;
  remaining: number;
  pct: number;
  overLimit: boolean;
};

export type MonthSoftLimitStatus = {
  periodKey: string;
  periodFrom: string;
  periodTo: string;
  personalAmount: number | null;
  totalAmount: number | null;
  spentPersonal: number;
  spentAll: number;
  commitmentsSpend: number;
  personal: CeilingTrack | null;
  total: CeilingTrack | null;
  overLimit: boolean;
};

type Props = {
  householdId: string;
  currency: string;
  status: MonthSoftLimitStatus | null;
  onUpdated: (next: MonthSoftLimitStatus) => void;
};

function parseOptionalAmount(raw: string): number | null | "invalid" {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const value = parseAmount(trimmed);
  if (!Number.isFinite(value) || value <= 0) return "invalid";
  return value;
}

function CeilingLane({
  label,
  hint,
  track,
  spentFallback,
  currency,
  locale,
  tone,
}: {
  label: string;
  hint?: string;
  track: CeilingTrack | null;
  spentFallback: number;
  currency: string;
  locale: "ar" | "en";
  tone: LimitBarTone;
}) {
  const { t } = useI18n();
  const spent = track?.spent ?? spentFallback;
  const over = track?.overLimit ?? false;
  const accentText =
    tone === "personal"
      ? "text-[var(--accent-a-text)]"
      : "text-[var(--accent-b-text)]";
  const softBg =
    tone === "personal"
      ? "bg-[var(--accent-a-soft)]"
      : "bg-[var(--accent-b-soft)]";

  return (
    <div className={`rounded-2xl ${softBg} px-3.5 py-3`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className={`text-xs font-bold uppercase tracking-wide ${accentText}`}>
            {label}
          </p>
          {hint ? (
            <p className="mt-0.5 text-[11px] leading-snug text-[var(--muted)]">
              {hint}
            </p>
          ) : null}
        </div>
        {track ? (
          <span
            className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold tabular-nums ${
              over
                ? "bg-amber-500/20 text-amber-800 dark:text-amber-300"
                : `${softBg} ${accentText} ring-1 ring-[var(--chrome-edge)]`
            }`}
          >
            {fill(t("monthLimitPct"), { pct: String(Math.round(track.pct)) })}
          </span>
        ) : null}
      </div>

      <p className="mt-2 text-xl font-bold tabular-nums leading-none text-[var(--foreground)]">
        <Money amount={spent} currency={currency} locale={locale} />
        {track ? (
          <span className="text-sm font-semibold text-[var(--muted)]">
            {" "}
            / <Money amount={track.amount} currency={currency} locale={locale} />
          </span>
        ) : null}
      </p>

      {track ? (
        <>
          <div className="mt-2.5">
            <LimitBar pct={track.pct} over={over} tone={tone} />
          </div>
          <p
            className={`mt-1.5 text-xs font-medium ${
              over ? "text-amber-800 dark:text-amber-300" : "text-[var(--muted)]"
            }`}
          >
            {over ? (
              <>
                {t("monthLimitOverBy")}{" "}
                <Money
                  amount={track.spent - track.amount}
                  currency={currency}
                  locale={locale}
                />
              </>
            ) : (
              <>
                {t("monthLimitRemaining")}{" "}
                <Money
                  amount={track.remaining}
                  currency={currency}
                  locale={locale}
                />
              </>
            )}
          </p>
        </>
      ) : (
        <p className="mt-2 text-xs text-[var(--muted)]">{t("monthLimitUnset")}</p>
      )}
    </div>
  );
}

export function MonthSoftLimitCard({
  householdId,
  currency,
  status,
  onUpdated,
}: Props) {
  const { t, locale } = useI18n();
  const [editing, setEditing] = useState(false);
  const [personalDraft, setPersonalDraft] = useState("");
  const [totalDraft, setTotalDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [error, setError] = useState("");

  const hasLimit = Boolean(
    (status?.personalAmount != null && status.personalAmount > 0) ||
      (status?.totalAmount != null && status.totalAmount > 0),
  );

  useEffect(() => {
    if (!editing || !status) return;
    setPersonalDraft(
      status.personalAmount != null ? String(status.personalAmount) : "",
    );
    setTotalDraft(status.totalAmount != null ? String(status.totalAmount) : "");
    setError("");
    setConfirmRemove(false);
  }, [
    editing,
    status?.periodKey,
    status?.personalAmount,
    status?.totalAmount,
  ]);

  const livePersonal = useMemo(() => {
    const amt = parseOptionalAmount(personalDraft);
    if (amt === "invalid" || amt == null || !status) return null;
    const pct = Math.round((status.spentPersonal / amt) * 1000) / 10;
    return { pct, over: pct > 100.001 };
  }, [personalDraft, status]);

  const liveTotal = useMemo(() => {
    const amt = parseOptionalAmount(totalDraft);
    if (amt === "invalid" || amt == null || !status) return null;
    const pct = Math.round((status.spentAll / amt) * 1000) / 10;
    return { pct, over: pct > 100.001 };
  }, [totalDraft, status]);

  function openEdit() {
    if (!status) return;
    setPersonalDraft(
      status.personalAmount != null ? String(status.personalAmount) : "",
    );
    setTotalDraft(status.totalAmount != null ? String(status.totalAmount) : "");
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
    const personal = parseOptionalAmount(personalDraft);
    const total = parseOptionalAmount(totalDraft);
    if (personal === "invalid" || total === "invalid") {
      setError(t("monthLimitAmountHint"));
      return;
    }
    if (personal == null && total == null) {
      setError(t("monthLimitNeedOne"));
      return;
    }
    if (personal != null && total != null && total + 0.001 < personal) {
      setError(t("monthLimitTotalTooLow"));
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
            personalAmount: personal,
            totalAmount: total,
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

  return (
    <section className="surface overflow-hidden rounded-[1.75rem]">
      {!editing ? (
        <div className="p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--accent-b-text)]">
                {t("monthLimitTitle")}
              </p>
              <h2 className="mt-0.5 text-lg font-bold text-[var(--foreground)]">
                {hasLimit ? t("monthLimitHeading") : t("monthLimitEmptyTitle")}
              </h2>
            </div>
            <button
              type="button"
              onClick={openEdit}
              className="shrink-0 rounded-2xl bg-[var(--accent-b)] px-3 py-2 text-sm font-semibold text-[var(--accent-b-fg)]"
            >
              {hasLimit ? t("monthLimitEdit") : t("monthLimitSet")}
            </button>
          </div>

          {hasLimit ? (
            <div className="mt-3 space-y-2.5">
              <CeilingLane
                label={t("monthLimitModePersonal")}
                hint={t("monthLimitModePersonalHint")}
                track={status.personal}
                spentFallback={status.spentPersonal}
                currency={currency}
                locale={locale}
                tone="personal"
              />
              <CeilingLane
                label={t("monthLimitModeAll")}
                hint={t("monthLimitModeAllHint")}
                track={status.total}
                spentFallback={status.spentAll}
                currency={currency}
                locale={locale}
                tone="total"
              />
              {status.commitmentsSpend > 0.001 ? (
                <p className="px-0.5 text-xs leading-snug text-[var(--muted)]">
                  {t("monthLimitCommitmentsPart")}{" "}
                  <Money
                    amount={status.commitmentsSpend}
                    currency={currency}
                    locale={locale}
                  />
                </p>
              ) : (
                <p className="px-0.5 text-xs leading-snug text-[var(--muted)]">
                  {t("monthLimitSoftHint")}
                </p>
              )}
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
              onClick={closeEdit}
              className="shrink-0 rounded-2xl border border-[var(--input-border)] bg-[var(--surface-bg)] px-3 py-2 text-sm font-semibold text-[var(--foreground)]"
            >
              {t("monthLimitCancel")}
            </button>
          </div>

          <div className="space-y-2.5">
            <label className="block rounded-2xl bg-[var(--accent-a-soft)] p-3">
              <span className="mb-0.5 block text-sm font-semibold text-[var(--accent-a-text)]">
                {t("monthLimitModePersonal")}
              </span>
              <span className="mb-2 block text-[11px] leading-snug text-[var(--muted)]">
                {t("monthLimitModePersonalHint")}
              </span>
              <input
                className="field text-lg"
                inputMode="decimal"
                value={personalDraft}
                onChange={(e) => setPersonalDraft(e.target.value)}
                placeholder={t("monthLimitAmountPlaceholder")}
                autoFocus
              />
              <span className="mt-1.5 block text-xs font-semibold tabular-nums text-[var(--accent-a-text)]">
                {t("monthLimitSoFar")}{" "}
                <Money
                  amount={status.spentPersonal}
                  currency={currency}
                  locale={locale}
                />
              </span>
              {livePersonal ? (
                <div className="mt-2">
                  <LimitBar
                    pct={livePersonal.pct}
                    over={livePersonal.over}
                    tone="personal"
                    size="sm"
                  />
                </div>
              ) : null}
            </label>

            <label className="block rounded-2xl bg-[var(--accent-b-soft)] p-3">
              <span className="mb-0.5 block text-sm font-semibold text-[var(--accent-b-text)]">
                {t("monthLimitModeAll")}
              </span>
              <span className="mb-2 block text-[11px] leading-snug text-[var(--muted)]">
                {t("monthLimitModeAllHint")}
              </span>
              <input
                className="field text-lg"
                inputMode="decimal"
                value={totalDraft}
                onChange={(e) => setTotalDraft(e.target.value)}
                placeholder={t("monthLimitAmountPlaceholder")}
              />
              <span className="mt-1.5 block text-xs font-semibold tabular-nums text-[var(--accent-b-text)]">
                {t("monthLimitSoFar")}{" "}
                <Money
                  amount={status.spentAll}
                  currency={currency}
                  locale={locale}
                />
              </span>
              {liveTotal ? (
                <div className="mt-2">
                  <LimitBar
                    pct={liveTotal.pct}
                    over={liveTotal.over}
                    tone="total"
                    size="sm"
                  />
                </div>
              ) : null}
            </label>
          </div>

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
            {hasLimit ? (
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
          <p className="text-xs leading-snug text-[var(--muted)]">
            {t("monthLimitSoftHint")}
          </p>
        </form>
      )}
    </section>
  );
}
