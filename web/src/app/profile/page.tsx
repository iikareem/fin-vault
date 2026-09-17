"use client";

import { useState } from "react";
import { BottomNav } from "@/components/BottomNav";
import { ChangePasswordForm } from "@/components/ChangePasswordForm";
import { Hint } from "@/components/Hint";
import { PageShell } from "@/components/PageShell";
import { useBooks, type ThemeMode } from "@/components/BooksProvider";
import { useI18n } from "@/components/I18nProvider";
import { api } from "@/lib/api";
import { CURRENCY_OPTIONS } from "@/lib/currencies";

export default function ProfilePage() {
  const { t, locale, setLocale } = useI18n();
  const {
    name,
    preferredCurrency,
    theme,
    setPreferences,
    house,
  } = useBooks();
  const [currencyBusy, setCurrencyBusy] = useState(false);
  const [themeBusy, setThemeBusy] = useState(false);
  const [prefsError, setPrefsError] = useState("");
  const [prefsSaved, setPrefsSaved] = useState("");

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

  return (
    <PageShell>
      <h1 className="page-title">{t("profileTitle")}</h1>
      {name ? (
        <p className="mt-2 text-lg font-semibold text-stone-800">{name}</p>
      ) : null}
      <Hint>{t("profileHint")}</Hint>

      <section className="surface mt-6 space-y-5 rounded-[1.75rem] p-4">
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
            {house?.role === "ADMIN"
              ? t("currencyPrefHintAdmin")
              : t("currencyPrefHint")}
          </Hint>
        </label>

        <div>
          <span className="mb-2 block font-medium">{t("themePref")}</span>
          <div className="seg grid-cols-2">
            <button
              type="button"
              disabled={themeBusy}
              onClick={() => onTheme("light")}
              className={`min-h-12 rounded-2xl px-3 py-2 font-semibold transition ${
                theme === "light"
                  ? "bg-[var(--surface-bg)] text-[var(--foreground)] shadow-sm"
                  : "text-[var(--muted)]"
              }`}
            >
              ☀️ {t("themeLight")}
            </button>
            <button
              type="button"
              disabled={themeBusy}
              onClick={() => onTheme("dark")}
              className={`min-h-12 rounded-2xl px-3 py-2 font-semibold transition ${
                theme === "dark"
                  ? "bg-[var(--surface-bg)] text-[var(--foreground)] shadow-sm"
                  : "text-[var(--muted)]"
              }`}
            >
              🌙 {t("themeDark")}
            </button>
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
            <option value="ar">{t("langAr")}</option>
            <option value="en">{t("langEn")}</option>
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
