"use client";

import { useI18n } from "./I18nProvider";

export function LanguageSwitch({ compact = false }: { compact?: boolean }) {
  const { locale, setLocale, t } = useI18n();
  const pad = compact ? "min-h-11 px-2.5 py-1" : "px-3 py-1";
  return (
    <div className="inline-flex shrink-0 rounded-full bg-[var(--panel-soft)] p-1 text-sm font-semibold">
      <button
        type="button"
        onClick={() => setLocale("ar")}
        aria-label={t("langAr")}
        className={`rounded-full ${pad} ${
          locale === "ar"
            ? "bg-[var(--accent-a)] text-[var(--accent-a-fg)]"
            : "text-stone-600"
        }`}
      >
        {compact ? "ع" : t("langAr")}
      </button>
      <button
        type="button"
        onClick={() => setLocale("en")}
        aria-label={t("langEn")}
        className={`rounded-full ${pad} ${
          locale === "en"
            ? "bg-[var(--accent-a)] text-[var(--accent-a-fg)]"
            : "text-stone-600"
        }`}
      >
        {compact ? "En" : t("langEn")}
      </button>
    </div>
  );
}
