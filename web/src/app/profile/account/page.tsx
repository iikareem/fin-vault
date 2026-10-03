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

  async function logout() {
    await api("/auth/logout", { method: "POST" });
    window.location.href = "/login";
  }

  return (
    <SettingsPage title={t("accountSection")} hint={t("accountSectionHint")}>
      <SettingsCard>
        {displayName ? (
          <div className="rounded-2xl bg-[var(--panel-soft)] px-4 py-3">
            <p className="text-sm text-[var(--muted)]">{t("profileTitle")}</p>
            <p className="mt-0.5 text-lg font-bold">{displayName}</p>
          </div>
        ) : null}
        <button
          type="button"
          onClick={logout}
          className="w-full rounded-2xl border border-[var(--input-border)] bg-[var(--surface-bg)] px-4 py-3 text-lg font-semibold transition hover:bg-[var(--panel-soft)]"
        >
          {t("logOut")}
        </button>
        <Hint>{t("logOutHint")}</Hint>
      </SettingsCard>
    </SettingsPage>
  );
}