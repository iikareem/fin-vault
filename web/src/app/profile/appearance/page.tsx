"use client";

import { useState } from "react";
import { Hint } from "@/components/Hint";
import { useBooks, type ThemeMode } from "@/components/BooksProvider";
import { useI18n } from "@/components/I18nProvider";
import {
  SettingsCard,
  SettingsPage,
} from "@/components/settings/SettingsChrome";
import { fill, type MessageKey } from "@/lib/i18n";
import { THEME_OPTIONS, type ThemeId } from "@/lib/themes";

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

export default function AppearanceSettingsPage() {
  const { t, locale, setLocale } = useI18n();
  const { theme, setPreferences } = useBooks();
  const [themeBusy, setThemeBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");

  function flashSaved() {
    setSaved(t("prefsSaved"));
    window.setTimeout(() => setSaved(""), 2200);
  }

  async function onTheme(next: ThemeMode) {
    setThemeBusy(true);
    setError("");
    setSaved("");
    try {
      await setPreferences({ theme: next });
      flashSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("couldNotSave"));
    } finally {
      setThemeBusy(false);
    }
  }

  return (
    <SettingsPage title={t("themeSection")} hint={t("themeSectionHint")}>
      {error ? (
        <p className="rounded-2xl bg-[var(--soft-red)] px-4 py-3 text-sm text-red-800">
          {error}
        </p>
      ) : null}
      {saved ? <p className="flash">{saved}</p> : null}

      <SettingsCard>
        <div className="flex items-center justify-between gap-2">
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
      </SettingsCard>

      <SettingsCard>
        <span className="block font-medium">{t("languagePref")}</span>
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
                onClick={() => {
                  setLocale(opt.id);
                  flashSaved();
                }}
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
      </SettingsCard>
    </SettingsPage>
  );
}
