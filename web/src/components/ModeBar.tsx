"use client";

import { usePathname } from "next/navigation";
import { useI18n } from "./I18nProvider";
import { useBooks } from "./BooksProvider";
import { HOUSE_BOOKS_ENABLED } from "@/lib/features";

/**
 * Top chrome below the fixed ios-top-mask: house/personal switch when
 * enabled, otherwise an in-flow safe-area spacer so Hello / charts clear
 * the Dynamic Island.
 */
export function ModeBar() {
  const path = usePathname();
  const { t } = useI18n();
  const { house, personal, active, setKind, personalOnly } = useBooks();
  if (path === "/login" || path === "/register") return null;

  const showSwitch =
    HOUSE_BOOKS_ENABLED && !personalOnly && Boolean(house && personal);
  const kind = active?.kind ?? "PERSONAL";

  if (!showSwitch) {
    return <div aria-hidden className="ios-top-spacer" />;
  }

  return (
    <div className="chrome-bar sticky top-0 z-30 pt-[env(safe-area-inset-top,0px)]">
      <div className="mx-auto flex max-w-lg items-center gap-2 px-3 py-2 sm:px-4">
        <div className="grid min-w-0 flex-1 grid-cols-2 gap-1 rounded-full bg-[var(--panel-soft)] p-1 ring-1 ring-[var(--input-border)]">
          <button
            type="button"
            onClick={() => setKind("HOUSE")}
            className={`min-h-11 rounded-full px-2 text-base font-bold transition-colors sm:text-lg ${
              kind === "HOUSE"
                ? "bg-[var(--accent-a)] text-[var(--accent-a-fg)]"
                : "text-[var(--muted)]"
            }`}
          >
            🏠 {t("modeHouse")}
          </button>
          <button
            type="button"
            onClick={() => setKind("PERSONAL")}
            className={`min-h-11 rounded-full px-2 text-base font-bold transition-colors sm:text-lg ${
              kind === "PERSONAL"
                ? "bg-[var(--accent-b)] text-[var(--accent-b-fg)]"
                : "text-[var(--muted)]"
            }`}
          >
            👛 {t("modeMine")}
          </button>
        </div>
      </div>
    </div>
  );
}
