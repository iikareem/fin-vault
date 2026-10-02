"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { BottomNav } from "@/components/BottomNav";
import { ChangePasswordForm } from "@/components/ChangePasswordForm";
import { Hint } from "@/components/Hint";
import { PageShell } from "@/components/PageShell";
import { useBooks, type ThemeMode } from "@/components/BooksProvider";
import { useI18n } from "@/components/I18nProvider";
import { api } from "@/lib/api";
import { budgetMonthRange } from "@/lib/calendar";
import { CURRENCY_OPTIONS } from "@/lib/currencies";
import { fill, type MessageKey } from "@/lib/i18n";
import { THEME_OPTIONS } from "@/lib/themes";
import { IosHomeScreenTip } from "@/components/IosHomeScreenTip";

const THEME_LABEL: Record<ThemeMode, MessageKey> = {
  light: "themeLight",
  dark: "themeDark",
  blue: "themeBlue",
  sand: "themeSand",
  rose: "themeRose",
};

const DAY_OPTIONS = Array.from({ length: 28 }, (_, i) => i + 1);

function formatIsoDate(iso: string, locale: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(
    locale === "ar" ? "ar" : "en",
    { day: "numeric", month: "short", year: "numeric" },
  );
}

export default function ProfilePage() {
  const { t, locale, setLocale } = useI18n();
  const {
    name,
    preferredCurrency,
    theme,
    budgetMonthStartDay,
    setPreferences,
    house,
    personalOnly,
  } = useBooks();
  const [currencyBusy, setCurrencyBusy] = useState(false);
  const [themeBusy, setThemeBusy] = useState(false);
  const [paydayDraft, setPaydayDraft] = useState(budgetMonthStartDay);
  const [paydayBusy, setPaydayBusy] = useState(false);
  const [paydayConfirming, setPaydayConfirming] = useState(false);
  const [prefsError, setPrefsError] = useState("");
  const [prefsSaved, setPrefsSaved] = useState("");

  useEffect(() => {
    setPaydayDraft(budgetMonthStartDay);
    setPaydayConfirming(false);
  }, [budgetMonthStartDay]);

  const paydayDirty = paydayDraft !== budgetMonthStartDay;
  const draftRange = useMemo(
    () => budgetMonthRange(new Date(), paydayDraft),
    [paydayDraft],
  );

  async function logout() {
    await api("/auth/logout", { method: "POST" });
    window.location.href = "/login";
  }

  async function onCurrency(next: string) {
    setCurrencyBusy(true);
    setPrefsError("");
    setPrefsSaved("");
    try {
      await setPreferences({ preferredCurrency: next });
      setPrefsSaved(t("prefsSaved"));
    } catch (err) {
      setPrefsError(err instanceof Error ? err.message : "Failed");
    } finally {
      setCurrencyBusy(false);
    }
  }

  async function onTheme(next: ThemeMode) {
    setThemeBusy(true);
    setPrefsError("");
    setPrefsSaved("");
    try {
      await setPreferences({ theme: next });
      setPrefsSaved(t("prefsSaved"));
    } catch (err) {
      setPrefsError(err instanceof Error ? err.message : "Failed");
    } finally {
      setThemeBusy(false);
    }
  }

  function onPaydayDraft(next: number) {
    setPaydayDraft(next);
    setPaydayConfirming(false);
    setPrefsError("");
    setPrefsSaved("");
  }

  function cancelPayday() {
    setPaydayDraft(budgetMonthStartDay);
    setPaydayConfirming(false);
    setPrefsError("");
  }

  async function savePayday() {
    if (!paydayDirty || paydayBusy) return;
    if (!paydayConfirming) {
      setPaydayConfirming(true);
      return;
    }
    setPaydayBusy(true);
    setPrefsError("");
    setPrefsSaved("");
    try {
      await setPreferences({ budgetMonthStartDay: paydayDraft });
      setPrefsSaved(t("prefsSaved"));
      setPaydayConfirming(false);
    } catch (err) {
      setPrefsError(err instanceof Error ? err.message : "Failed");
    } finally {
      setPaydayBusy(false);
    }
  }

  return (
    <PageShell>
      <h1 className="page-title">{t("profileTitle")}</h1>
      {name ? (
        <p className="mt-2 text-lg font-semibold text-stone-800">{name}</p>
      ) : null}
      <Hint>{t("profileHint")}</Hint>
      <IosHomeScreenTip />

      <Link
        href="/profile/categories"
        className="surface mt-5 flex min-h-[4.5rem] items-center gap-3 rounded-[1.75rem] px-4 py-3 transition hover:bg-[var(--panel-soft)]"
      >
        <span
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[var(--accent-b-soft)] text-2xl"
          aria-hidden
        >
          🏷️
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-lg font-bold leading-tight">
            {t("myCategories")}
          </span>
          <span className="mt-0.5 block text-sm leading-relaxed text-[var(--muted)]">
            {t("myCategoriesLinkHint")}
          </span>
        </span>
        <span className="shrink-0 text-lg text-[var(--muted)]" aria-hidden>
          →
        </span>
      </Link>

      <section className="surface mt-5 space-y-5 rounded-[1.75rem] p-4">
        <h2 className="text-xl font-bold">{t("settingsTitle")}</h2>

        <label className="block">
          <span className="mb-1.5 block font-medium">{t("currencyPref")}</span>
          <select
            className="field text-lg"
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

        <div>
          <label className="block">
            <span className="mb-1.5 block font-medium">
              {t("budgetMonthStartPref")}
            </span>
            <select
              className="field text-lg"
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
            <div className="mt-3 space-y-3 rounded-2xl bg-[var(--panel-soft)] p-3">
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
                  className="rounded-2xl bg-[var(--cta-bg)] px-4 py-2.5 text-base font-semibold text-[var(--cta-fg)] disabled:opacity-60"
                >
                  {paydayConfirming
                    ? t("budgetMonthStartConfirm")
                    : t("budgetMonthStartContinue")}
                </button>
                <button
                  type="button"
                  disabled={paydayBusy}
                  onClick={cancelPayday}
                  className="rounded-2xl border border-[var(--input-border)] bg-[var(--surface-bg)] px-4 py-2.5 text-base font-semibold disabled:opacity-60"
                >
                  {t("budgetMonthStartCancel")}
                </button>
              </div>
            </div>
          ) : null}
        </div>

        <div>
          <span className="mb-2 block font-medium">{t("themePref")}</span>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {THEME_OPTIONS.map((opt) => {
              const active = theme === opt.id;
              const [bg, houseColor, mineColor] = opt.swatch;
              return (
                <button
                  key={opt.id}
                  type="button"
                  disabled={themeBusy}
                  onClick={() => onTheme(opt.id)}
                  className={`overflow-hidden rounded-2xl text-start ring-2 ${
                    active
                      ? "ring-[var(--cta-bg)]"
                      : "ring-transparent"
                  }`}
                >
                  <span
                    className="block h-10 w-full"
                    style={{ backgroundColor: bg }}
                    aria-hidden
                  />
                  <span
                    className={`flex items-center justify-between gap-2 px-3 py-2 ${
                      active
                        ? "bg-[var(--cta-bg)] text-[var(--cta-fg)]"
                        : "bg-[var(--surface-bg)] text-[var(--foreground)]"
                    }`}
                  >
                    <span className="text-sm font-bold leading-tight">
                      {t(THEME_LABEL[opt.id])}
                    </span>
                    <span className="flex items-center gap-1" aria-hidden>
                      <span
                        className="h-3.5 w-3.5 rounded-full ring-1 ring-black/10"
                        style={{ backgroundColor: houseColor }}
                      />
                      <span
                        className="h-3.5 w-3.5 rounded-full ring-1 ring-black/10"
                        style={{ backgroundColor: mineColor }}
                      />
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
          <Hint>{t("themePrefHint")}</Hint>
        </div>

        <label className="block">
          <span className="mb-1.5 block font-medium">{t("languagePref")}</span>
          <select
            className="field text-lg"
            value={locale}
            onChange={(e) => setLocale(e.target.value as "ar" | "en")}
          >
            <option value="en">{t("langEn")}</option>
            <option value="ar">{t("langAr")}</option>
          </select>
        </label>

        {prefsError ? <p className="text-red-700">{prefsError}</p> : null}
        {prefsSaved ? <p className="flash">{prefsSaved}</p> : null}
      </section>

      <div className="mt-6">
        <ChangePasswordForm />
      </div>
      <button
        type="button"
        onClick={logout}
        className="mt-10 w-full rounded-2xl border border-[var(--input-border)] bg-[var(--surface-bg)] px-4 py-3 text-lg font-semibold transition hover:bg-[var(--panel-soft)]"
      >
        {t("logOut")}
      </button>
      <Hint>{t("logOutHint")}</Hint>
      <BottomNav />
    </PageShell>
  );
}
