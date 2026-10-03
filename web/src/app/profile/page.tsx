"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
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
import { THEME_OPTIONS, type ThemeId } from "@/lib/themes";
import {
  patchUiPrefs,
  readUiPrefs,
  type UiPrefs,
} from "@/lib/uiPrefs";
import { IosHomeScreenTip } from "@/components/IosHomeScreenTip";

const THEME_LABEL: Record<ThemeId, MessageKey> = {
  light: "themeLight",
  dark: "themeDark",
  midnight: "themeMidnight",
  blue: "themeBlue",
  mint: "themeMint",
  forest: "themeForest",
  sand: "themeSand",
  amber: "themeAmber",
  rose: "themeRose",
  grape: "themeGrape",
  slate: "themeSlate",
};

const DAY_OPTIONS = Array.from({ length: 28 }, (_, i) => i + 1);

function formatIsoDate(iso: string, locale: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(
    locale === "ar" ? "ar" : "en",
    { day: "numeric", month: "short", year: "numeric" },
  );
}

function PrefToggle({
  checked,
  disabled,
  onChange,
  label,
  hint,
}: {
  checked: boolean;
  disabled?: boolean;
  onChange: (next: boolean) => void;
  label: string;
  hint: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="flex w-full items-start gap-3 rounded-2xl bg-[var(--panel-soft)] px-3 py-3 text-start transition hover:bg-[var(--press)] disabled:opacity-60"
    >
      <span className="min-w-0 flex-1">
        <span className="block text-base font-semibold leading-tight">
          {label}
        </span>
        <span className="mt-1 block text-sm leading-relaxed text-[var(--muted)]">
          {hint}
        </span>
      </span>
      <span
        className={`mt-0.5 inline-flex h-7 w-12 shrink-0 items-center rounded-full px-0.5 transition ${
          checked
            ? "justify-end bg-[var(--cta-bg)]"
            : "justify-start bg-[var(--input-border)]"
        }`}
        aria-hidden
      >
        <span className="h-6 w-6 rounded-full bg-white shadow" />
      </span>
    </button>
  );
}

function SettingsSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="surface mt-4 space-y-4 rounded-[1.75rem] p-4">
      <h2 className="text-sm font-bold uppercase tracking-wide text-[var(--muted)]">
        {title}
      </h2>
      {children}
    </section>
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
  const [uiPrefs, setUiPrefs] = useState<UiPrefs>(() => readUiPrefs());

  useEffect(() => {
    setPaydayDraft(budgetMonthStartDay);
    setPaydayConfirming(false);
  }, [budgetMonthStartDay]);

  const paydayDirty = paydayDraft !== budgetMonthStartDay;
  const draftRange = useMemo(
    () => budgetMonthRange(new Date(), paydayDraft),
    [paydayDraft],
  );

  const initial = (name?.trim()?.[0] || "?").toUpperCase();
  const currencyLabel =
    CURRENCY_OPTIONS.find((c) => c.code === preferredCurrency) ??
    CURRENCY_OPTIONS[0];

  function flashSaved() {
    setPrefsSaved(t("prefsSaved"));
    window.setTimeout(() => setPrefsSaved(""), 2200);
  }

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
      flashSaved();
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
      flashSaved();
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
      flashSaved();
      setPaydayConfirming(false);
    } catch (err) {
      setPrefsError(err instanceof Error ? err.message : "Failed");
    } finally {
      setPaydayBusy(false);
    }
  }

  function onUiPref<K extends keyof UiPrefs>(key: K, value: UiPrefs[K]) {
    const next = patchUiPrefs({ [key]: value });
    setUiPrefs(next);
    flashSaved();
  }

  return (
    <PageShell>
      <header className="surface relative overflow-hidden rounded-[1.75rem] p-4">
        <div
          className="pointer-events-none absolute inset-0 opacity-80"
          style={{
            background:
              "linear-gradient(135deg, color-mix(in srgb, var(--accent-b) 16%, transparent), color-mix(in srgb, var(--accent-a) 10%, transparent))",
          }}
          aria-hidden
        />
        <div className="relative flex items-center gap-3">
          <span
            className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl text-xl font-bold text-[var(--accent-b-fg)]"
            style={{ background: "var(--accent-b)" }}
            aria-hidden
          >
            {initial}
          </span>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-2xl font-bold tracking-tight">
              {name || t("profileTitle")}
            </h1>
            <p className="mt-1 text-sm leading-relaxed text-[var(--muted)]">
              {locale === "ar" ? currencyLabel.labelAr : currencyLabel.labelEn}
              {" · "}
              {fill(t("settingsPaydaySummary"), {
                n: String(budgetMonthStartDay),
              })}
            </p>
          </div>
        </div>
      </header>

      <Hint>{t("profileHint")}</Hint>
      <IosHomeScreenTip />

      {prefsError ? (
        <p className="mt-3 rounded-2xl bg-[var(--soft-red)] px-4 py-3 text-sm text-red-800">
          {prefsError}
        </p>
      ) : null}
      {prefsSaved ? <p className="flash mt-3">{prefsSaved}</p> : null}

      <SettingsSection title={t("settingsQuickLinks")}>
        <Link
          href="/profile/categories"
          className="flex min-h-[4.25rem] items-center gap-3 rounded-2xl bg-[var(--panel-soft)] px-3 py-3 transition hover:bg-[var(--press)]"
        >
          <span
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[var(--accent-b-soft)] text-xl"
            aria-hidden
          >
            🏷️
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-base font-bold leading-tight">
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
      </SettingsSection>

      <SettingsSection title={t("themeSection")}>
        <div>
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="font-medium">{t("themePref")}</span>
            <span className="text-xs font-semibold text-[var(--muted)]">
              {fill(t("settingsCurrentTheme"), {
                name: t(THEME_LABEL[theme]),
              })}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {THEME_OPTIONS.map((opt) => {
              const active = theme === opt.id;
              const [bg, a, b] = opt.swatch;
              return (
                <button
                  key={opt.id}
                  type="button"
                  disabled={themeBusy}
                  onClick={() => onTheme(opt.id)}
                  aria-pressed={active}
                  className={`overflow-hidden rounded-2xl text-start ring-2 transition ${
                    active
                      ? "ring-[var(--cta-bg)]"
                      : "ring-transparent hover:ring-[var(--input-border)]"
                  }`}
                >
                  <span
                    className="relative block h-12 w-full"
                    style={{ backgroundColor: bg }}
                    aria-hidden
                  >
                    <span
                      className="absolute bottom-2 start-2 h-4 w-4 rounded-full ring-1 ring-black/10"
                      style={{ backgroundColor: a }}
                    />
                    <span
                      className="absolute bottom-2 start-5 h-4 w-4 rounded-full ring-1 ring-black/10"
                      style={{ backgroundColor: b }}
                    />
                    {opt.dark ? (
                      <span className="absolute end-2 top-2 rounded-full bg-black/35 px-1.5 py-0.5 text-[10px] font-bold text-white">
                        {t("themeDark")}
                      </span>
                    ) : null}
                  </span>
                  <span
                    className={`block px-3 py-2 text-sm font-bold leading-tight ${
                      active
                        ? "bg-[var(--cta-bg)] text-[var(--cta-fg)]"
                        : "bg-[var(--surface-bg)] text-[var(--foreground)]"
                    }`}
                  >
                    {t(THEME_LABEL[opt.id])}
                  </span>
                </button>
              );
            })}
          </div>
          <Hint>{t("themePrefHint")}</Hint>
        </div>

        <div>
          <span className="mb-2 block font-medium">{t("languagePref")}</span>
          <div className="grid grid-cols-2 gap-2">
            {(
              [
                { id: "en" as const, label: t("langEn") },
                { id: "ar" as const, label: t("langAr") },
              ] as const
            ).map((opt) => {
              const active = locale === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setLocale(opt.id)}
                  aria-pressed={active}
                  className={`min-h-12 rounded-2xl px-3 text-base font-bold transition ${
                    active
                      ? "bg-[var(--cta-bg)] text-[var(--cta-fg)]"
                      : "bg-[var(--panel-soft)] text-[var(--foreground)]"
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
          <Hint>{t("languagePrefHint")}</Hint>
        </div>
      </SettingsSection>

      <SettingsSection title={t("moneySection")}>
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
      </SettingsSection>

      <SettingsSection title={t("privacySection")}>
        <div className="space-y-2">
          <PrefToggle
            checked={uiPrefs.hideBalances}
            onChange={(v) => onUiPref("hideBalances", v)}
            label={t("hideBalancesPref")}
            hint={t("hideBalancesHint")}
          />
          <PrefToggle
            checked={uiPrefs.reduceMotion}
            onChange={(v) => onUiPref("reduceMotion", v)}
            label={t("reduceMotionPref")}
            hint={t("reduceMotionHint")}
          />
          <PrefToggle
            checked={uiPrefs.compactUi}
            onChange={(v) => onUiPref("compactUi", v)}
            label={t("compactUiPref")}
            hint={t("compactUiHint")}
          />
        </div>
      </SettingsSection>

      <SettingsSection title={t("securitySection")}>
        <ChangePasswordForm />
      </SettingsSection>

      <SettingsSection title={t("accountSection")}>
        <button
          type="button"
          onClick={logout}
          className="w-full rounded-2xl border border-[var(--input-border)] bg-[var(--surface-bg)] px-4 py-3 text-lg font-semibold transition hover:bg-[var(--panel-soft)]"
        >
          {t("logOut")}
        </button>
        <Hint>{t("logOutHint")}</Hint>
      </SettingsSection>

      <BottomNav />
    </PageShell>
  );
}
