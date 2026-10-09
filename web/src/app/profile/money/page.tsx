"use client";

import { useEffect, useMemo, useState } from "react";
import { Hint } from "@/components/Hint";
import { useBooks } from "@/components/BooksProvider";
import { useI18n } from "@/components/I18nProvider";
import {
  SettingsCard,
  SettingsPage,
} from "@/components/settings/SettingsChrome";
import { budgetMonthRange } from "@/lib/calendar";
import { CURRENCY_OPTIONS } from "@/lib/currencies";
import { fill } from "@/lib/i18n";

const DAY_OPTIONS = Array.from({ length: 28 }, (_, i) => i + 1);

function formatIsoDate(iso: string, locale: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(
    locale === "ar" ? "ar" : "en",
    { day: "numeric", month: "short", year: "numeric" },
  );
}

export default function MoneySettingsPage() {
  const { t, locale } = useI18n();
  const {
    preferredCurrency,
    budgetMonthStartDay,
    setPreferences,
    house,
    personalOnly,
  } = useBooks();
  const [currencyBusy, setCurrencyBusy] = useState(false);
  const [paydayDraft, setPaydayDraft] = useState(budgetMonthStartDay);
  const [paydayBusy, setPaydayBusy] = useState(false);
  const [paydayConfirming, setPaydayConfirming] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");

  useEffect(() => {
    setPaydayDraft(budgetMonthStartDay);
    setPaydayConfirming(false);
  }, [budgetMonthStartDay]);

  const paydayDirty = paydayDraft !== budgetMonthStartDay;
  const draftRange = useMemo(
    () => budgetMonthRange(new Date(), paydayDraft),
    [paydayDraft],
  );

  function flashSaved() {
    setSaved(t("prefsSaved"));
    window.setTimeout(() => setSaved(""), 2200);
  }

  async function onCurrency(next: string) {
    setCurrencyBusy(true);
    setError("");
    setSaved("");
    try {
      await setPreferences({ preferredCurrency: next });
      flashSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("couldNotSave"));
    } finally {
      setCurrencyBusy(false);
    }
  }

  function onPaydayDraft(next: number) {
    setPaydayDraft(next);
    setPaydayConfirming(false);
    setError("");
    setSaved("");
  }

  function cancelPayday() {
    setPaydayDraft(budgetMonthStartDay);
    setPaydayConfirming(false);
    setError("");
  }

  async function savePayday() {
    if (!paydayDirty || paydayBusy) return;
    if (!paydayConfirming) {
      setPaydayConfirming(true);
      return;
    }
    setPaydayBusy(true);
    setError("");
    setSaved("");
    try {
      await setPreferences({ budgetMonthStartDay: paydayDraft });
      flashSaved();
      setPaydayConfirming(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("couldNotSave"));
    } finally {
      setPaydayBusy(false);
    }
  }

  return (
    <SettingsPage title={t("moneySection")} hint={t("moneySectionHint")}>
      {error ? (
        <p className="rounded-2xl bg-[var(--soft-red)] px-4 py-3 text-sm text-red-800">
          {error}
        </p>
      ) : null}
      {saved ? <p className="flash">{saved}</p> : null}

      <SettingsCard>
        <label className="block">
          <span className="mb-1.5 block text-[15px] font-semibold">
            {t("currencyPref")}
          </span>
          <select
            className="field !rounded-[1.15rem] text-lg"
            value={preferredCurrency}
            disabled={currencyBusy}
            onChange={(e) => onCurrency(e.target.value)}
          >
            {CURRENCY_OPTIONS.map((c) => (
              <option key={c.code} value={c.code}>
                {locale === "ar" ? c.labelAr : c.labelEn} ({c.code})
              </option>
            ))}
          </select>
          <Hint>
            {!personalOnly && house?.role === "ADMIN"
              ? t("currencyPrefHintAdmin")
              : t("currencyPrefHint")}
          </Hint>
        </label>
      </SettingsCard>

      <SettingsCard>
        <label className="block">
          <span className="mb-1.5 block text-[15px] font-semibold">
            {t("budgetMonthStartPref")}
          </span>
          <select
            className="field !rounded-[1.15rem] text-lg"
            value={paydayDraft}
            disabled={paydayBusy}
            onChange={(e) => onPaydayDraft(Number(e.target.value))}
          >
            {DAY_OPTIONS.map((d) => (
              <option key={d} value={d}>
                {fill(t("budgetMonthStartDay"), { n: String(d) })}
              </option>
            ))}
          </select>
        </label>
        <Hint>{t("budgetMonthStartHint")}</Hint>
        {paydayDirty ? (
          <div className="space-y-3 rounded-[1.15rem] bg-[var(--panel-soft)] p-3.5">
            <p className="text-sm leading-relaxed text-[var(--foreground)]">
              {fill(t("budgetMonthStartPreview"), {
                from: formatIsoDate(draftRange.from, locale),
                to: formatIsoDate(draftRange.to, locale),
              })}
            </p>
            {paydayConfirming ? (
              <p className="text-sm leading-relaxed text-[var(--muted)]">
                {t("budgetMonthStartWarn")}
              </p>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={paydayBusy}
                onClick={savePayday}
                className="rounded-[1.15rem] bg-[var(--cta-bg)] px-4 py-2.5 text-base font-semibold text-[var(--cta-fg)] disabled:opacity-60"
              >
                {paydayConfirming
                  ? t("budgetMonthStartConfirm")
                  : t("budgetMonthStartContinue")}
              </button>
              <button
                type="button"
                disabled={paydayBusy}
                onClick={cancelPayday}
                className="rounded-[1.15rem] border border-[var(--input-border)] bg-[var(--surface-bg)] px-4 py-2.5 text-base font-semibold disabled:opacity-60"
              >
                {t("budgetMonthStartCancel")}
              </button>
            </div>
          </div>
        ) : null}
      </SettingsCard>
    </SettingsPage>
  );
}
