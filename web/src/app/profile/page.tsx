"use client";

import { BottomNav } from "@/components/BottomNav";
import { ChangePasswordForm } from "@/components/ChangePasswordForm";
import { Hint } from "@/components/Hint";
import { PageShell } from "@/components/PageShell";
import { useBooks } from "@/components/BooksProvider";
import { useI18n } from "@/components/I18nProvider";
import { api } from "@/lib/api";

export default function ProfilePage() {
  const { t } = useI18n();
  const { name } = useBooks();

  async function logout() {
    await api("/auth/logout", { method: "POST" });
    window.location.href = "/login";
  }

  return (
    <PageShell>
      <h1 className="text-2xl font-bold leading-tight sm:text-3xl">
        {t("profileTitle")}
      </h1>
      {name ? (
        <p className="mt-2 text-lg font-semibold text-stone-800">{name}</p>
      ) : null}
      <Hint>{t("profileHint")}</Hint>
      <div className="mt-6">
        <ChangePasswordForm />
      </div>
      <button
        type="button"
        onClick={logout}
        className="mt-10 w-full rounded-2xl border border-stone-300 px-4 py-3 text-lg"
      >
        {t("logOut")}
      </button>
      <Hint>{t("logOutHint")}</Hint>
      <BottomNav />
    </PageShell>
  );
}
