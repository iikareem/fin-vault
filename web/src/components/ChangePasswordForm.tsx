"use client";

import { FormEvent, useState } from "react";
import { api } from "@/lib/api";
import { useI18n } from "@/components/I18nProvider";

export function ChangePasswordForm() {
  const { t } = useI18n();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setDone(false);
    setError("");
    try {
      await api("/auth/change-password", {
        method: "POST",
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      setCurrentPassword("");
      setNewPassword("");
      setDone(true);
    } catch (err) {
      const msg = err instanceof Error && err.message ? err.message : "";
      setError(
        msg.includes("Wrong current password")
          ? t("wrongCurrentPassword")
          : msg.includes("at least 8")
            ? t("newPasswordTooShort")
            : t("changePasswordFailed"),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3 rounded-2xl bg-white p-4 shadow-sm">
      <p className="text-lg font-semibold">🔐 {t("changePassword")}</p>
      <label className="block">
        <span className="mb-1 block font-medium">{t("currentPassword")}</span>
        <input
          type="password"
          className="w-full rounded-2xl border border-stone-300 bg-white px-4 py-3 text-lg"
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          autoComplete="current-password"
          required
        />
      </label>
      <label className="block">
        <span className="mb-1 block font-medium">{t("newPassword")}</span>
        <input
          type="password"
          className="w-full rounded-2xl border border-stone-300 bg-white px-4 py-3 text-lg"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          autoComplete="new-password"
          minLength={8}
          required
        />
      </label>
      {done ? (
        <p className="rounded-xl bg-emerald-50 px-3 py-2 text-emerald-800">
          {t("passwordChanged")} {t("passwordChangedHint")}
        </p>
      ) : null}
      {error ? <p className="text-red-700">{error}</p> : null}
      <button
        disabled={busy}
        className="w-full rounded-2xl bg-emerald-800 px-4 py-3 text-lg font-semibold text-white disabled:opacity-60"
      >
        {busy ? t("saving") : t("changePassword")}
      </button>
    </form>
  );
}
