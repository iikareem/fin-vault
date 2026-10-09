"use client";

import { Hint } from "@/components/Hint";
import { useBooks } from "@/components/BooksProvider";
import { useI18n } from "@/components/I18nProvider";
import {
  SettingsCard,
  SettingsPage,
} from "@/components/settings/SettingsChrome";
import { api } from "@/lib/api";

export default function AccountSettingsPage() {
  const { t } = useI18n();
  const { displayName } = useBooks();
  const initial = (displayName?.trim()?.[0] || "?").toUpperCase();

  async function logout() {
    await api("/auth/logout", { method: "POST" });
    window.location.href = "/login";
  }

  return (
    <SettingsPage title={t("accountSection")} hint={t("accountSectionHint")}>
      <SettingsCard>
        {displayName ? (
          <div className="flex items-center gap-3 rounded-[1.15rem] bg-[var(--panel-soft)] px-3.5 py-3.5">
            <span
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-base font-bold"
              style={{
                background: "var(--accent-b-soft)",
                color: "var(--accent-b-text)",
              }}
              aria-hidden
            >
              {initial}
            </span>
            <div className="min-w-0">
              <p className="text-xs font-medium text-[var(--muted)]">
                {t("profileTitle")}
              </p>
              <p className="truncate text-base font-bold text-[var(--foreground)]">
                {displayName}
              </p>
            </div>
          </div>
        ) : null}
        <button
          type="button"
          onClick={logout}
          className="w-full rounded-[1.15rem] border border-[var(--input-border)] bg-[var(--surface-bg)] px-4 py-3.5 text-base font-semibold text-[var(--foreground)] transition hover:bg-[var(--panel-soft)] active:scale-[0.99]"
        >
          {t("logOut")}
        </button>
        <Hint>{t("logOutHint")}</Hint>
      </SettingsCard>
    </SettingsPage>
  );
}
