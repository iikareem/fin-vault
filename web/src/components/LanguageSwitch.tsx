"use client";

import { useI18n } from "./I18nProvider";

export function LanguageSwitch() {
  const { locale, setLocale, t } = useI18n();
  return (
    <div className="inline-flex rounded-full bg-white p-1 text-sm font-semibold shadow-sm">
      <button
        type="button"
        onClick={() => setLocale("ar")}
        className={`rounded-full px-3 py-1 ${
          locale === "ar" ? "bg-emerald-800 text-white" : "text-stone-600"
        }`}
      >
        {t("langAr")}
      </button>
      <button
        type="button"
        onClick={() => setLocale("en")}
        className={`rounded-full px-3 py-1 ${
          locale === "en" ? "bg-emerald-800 text-white" : "text-stone-600"
        }`}
      >
        {t("langEn")}
      </button>
    </div>
  );
}
