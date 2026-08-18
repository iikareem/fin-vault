"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { BottomNav } from "@/components/BottomNav";
import { PageShell } from "@/components/PageShell";
import { useI18n } from "@/components/I18nProvider";
import { useBooks } from "@/components/BooksProvider";
import { householdPath } from "@/lib/space";
import { labelFor } from "@/lib/i18n";
import { Hint } from "@/components/Hint";

type User = {
  id: string;
  name: string;
  email: string;
  relation: string;
  role: string;
};

export default function FamilyPage() {
  const { t } = useI18n();
  const { house, setKind } = useBooks();
  const [users, setUsers] = useState<User[]>([]);
  const [error, setError] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [pwBusy, setPwBusy] = useState(false);
  const [pwDone, setPwDone] = useState(false);
  const [pwError, setPwError] = useState("");

  useEffect(() => {
    if (!house) return;
    setKind("HOUSE");
    api<User[]>(householdPath(house.householdId, "/users"))
      .then(setUsers)
      .catch((e) => setError(e.message));
  }, [house?.householdId]);

  async function logout() {
    await api("/auth/logout", { method: "POST" });
    window.location.href = "/login";
  }

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    setPwBusy(true);
    setPwDone(false);
    setPwError("");
    try {
      await api("/auth/change-password", {
        method: "POST",
        body: JSON.stringify({
          currentPassword,
          newPassword,
        }),
      });
      setCurrentPassword("");
      setNewPassword("");
      setPwDone(true);
    } catch (err) {
      const msg =
        err instanceof Error && err.message ? err.message : "";
      setPwError(
        msg.includes("Wrong current password")
          ? t("wrongCurrentPassword")
          : msg.includes("at least 8")
            ? t("newPasswordTooShort")
            : t("changePasswordFailed"),
      );
    } finally {
      setPwBusy(false);
    }
  }

  return (
    <PageShell>
      <h1 className="text-2xl font-bold leading-tight sm:text-3xl">👨‍👩‍👧‍👦 {t("family")}</h1>
      <p className="mt-2 text-stone-600">{t("familyBlurb")}</p>
      <Hint>{t("familyRoleHint")}</Hint>
      <ul className="mt-5 space-y-2">
        {users.map((u) => (
          <li key={u.id} className="rounded-2xl bg-white px-4 py-3 shadow-sm">
            <p className="font-semibold">
              {u.name}
              {u.relation ? ` · ${labelFor(u.relation, t)}` : ""}
            </p>
            <p className="text-sm text-stone-500">
              {u.email} · {u.role === "ADMIN" ? t("fullAccess") : t("viewHouseOwnMoney")}
            </p>
          </li>
        ))}
      </ul>
      {error ? <p className="mt-3 text-red-700">{error}</p> : null}

      <form
        onSubmit={changePassword}
        className="mt-8 space-y-3 rounded-2xl bg-white p-4 shadow-sm"
      >
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
        {pwDone ? (
          <p className="rounded-xl bg-emerald-50 px-3 py-2 text-emerald-800">
            ✅ {t("passwordChanged")} {t("passwordChangedHint")}
          </p>
        ) : null}
        {pwError ? <p className="text-red-700">{pwError}</p> : null}
        <button
          disabled={pwBusy}
          className="w-full rounded-2xl bg-emerald-800 px-4 py-3 text-lg font-semibold text-white disabled:opacity-60"
        >
          {pwBusy ? t("saving") : t("changePassword")}
        </button>
      </form>

      <button
        onClick={logout}
        className="mt-10 w-full rounded-2xl border border-stone-300 px-4 py-3 text-lg"
      >
        {t("logOut")} 🚪
      </button>
      <Hint>{t("logOutHint")}</Hint>
      <BottomNav />
    </PageShell>
  );
}
