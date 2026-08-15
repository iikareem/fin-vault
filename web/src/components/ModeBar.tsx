"use client";

import { usePathname } from "next/navigation";
import { useI18n } from "./I18nProvider";
import { useBooks } from "./BooksProvider";
import { LanguageSwitch } from "./LanguageSwitch";

export function ModeBar() {
  const path = usePathname();
  const { t } = useI18n();
  const { house, personal, active, setKind } = useBooks();
  if (path === "/login") return null;
  if (!house || !personal) return null;
  const kind = active?.kind ?? "HOUSE";

  return (
    <div className="sticky top-0 z-30 bg-[#edf4f0]/92 pt-[env(safe-area-inset-top)] backdrop-blur-xl">
      <div className="mx-auto flex max-w-lg items-center gap-2 px-3 py-2 sm:px-4">
        <div className="grid min-w-0 flex-1 grid-cols-2 gap-1 rounded-full bg-white p-1 shadow-sm">
          <button
            type="button"
            onClick={() => setKind("HOUSE")}
            className={`min-h-11 rounded-full px-2 text-base font-bold sm:text-lg ${
              kind === "HOUSE"
                ? "bg-emerald-800 text-white"
                : "text-stone-500"
            }`}
          >
            🏠 {t("modeHouse")}
          </button>
          <button
            type="button"
            onClick={() => setKind("PERSONAL")}
            className={`min-h-11 rounded-full px-2 text-base font-bold sm:text-lg ${
              kind === "PERSONAL" ? "bg-sky-800 text-white" : "text-stone-500"
            }`}
          >
            👛 {t("modeMine")}
          </button>
        </div>
        <LanguageSwitch compact />
      </div>
    </div>
  );
}
