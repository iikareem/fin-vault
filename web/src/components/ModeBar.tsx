"use client";

import { usePathname } from "next/navigation";
import { useI18n } from "./I18nProvider";
import { useBooks } from "./BooksProvider";

export function ModeBar() {
  const path = usePathname();
  const { t } = useI18n();
  const { house, personal, active, setKind, personalOnly } = useBooks();
  if (path === "/login") return null;
  if (personalOnly) return null;
  if (!house || !personal) return null;
  const kind = active?.kind ?? "PERSONAL";

  return (
    <div className="chrome-bar sticky top-0 z-30 pt-[env(safe-area-inset-top)] backdrop-blur-xl">
      <div className="mx-auto flex max-w-lg items-center gap-2 px-3 py-2 sm:px-4">
        <div className="grid min-w-0 flex-1 grid-cols-2 gap-1 rounded-full bg-[var(--panel-soft)] p-1">
          <button
            type="button"
            onClick={() => setKind("HOUSE")}
            className={`min-h-11 rounded-full px-2 text-base font-bold sm:text-lg ${
              kind === "HOUSE"
                ? "bg-[var(--accent-a)] text-[var(--accent-a-fg)]"
                : "text-stone-500"
            }`}
          >
            🏠 {t("modeHouse")}
          </button>
          <button
            type="button"
            onClick={() => setKind("PERSONAL")}
            className={`min-h-11 rounded-full px-2 text-base font-bold sm:text-lg ${
              kind === "PERSONAL"
                ? "bg-[var(--accent-b)] text-[var(--accent-b-fg)]"
                : "text-stone-500"
            }`}
          >
            👛 {t("modeMine")}
          </button>
        </div>
      </div>
    </div>
  );
}
