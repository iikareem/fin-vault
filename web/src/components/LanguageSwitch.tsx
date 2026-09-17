"use client";

import { useI18n } from "./I18nProvider";

export function LanguageSwitch({ compact = false }: { compact?: boolean }) {
  const { locale, setLocale, t } = useI18n();
  const pad = compact ? "min-h-11 px-2.5 py-1" : "px-3 py-1";
  return (
    <div className="inline-flex shrink-0 rounded-full bg-[var(--panel-soft)] p-1 text-sm font-semibold shadow-inner">
      <button
        type="button"
        onClick={() => setLocale("ar")}
        aria-label={t("langAr")}
        className={`rounded-full transition-all duration-200 ${pad} ${
          locale === "ar"
            ? "bg-emerald-800 text-white shadow-sm"
            : "text-stone-600 hover:text-stone-800"
        }`}
      >
        {compact ? "ع" : t("langAr")}
      </button>
      <button
        type="button"
        onClick={() => setLocale("en")}
        aria-label={t("langEn")}
        className={`rounded-full transition-all duration-200 ${pad} ${
          locale === "en"
            ? "bg-emerald-800 text-white shadow-sm"
            : "text-stone-600 hover:text-stone-800"
        }`}
      >
        {compact ? "En" : t("langEn")}
      </button>
    </div>
  );
}
