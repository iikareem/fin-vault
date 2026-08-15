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
