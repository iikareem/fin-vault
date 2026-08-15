"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { useI18n } from "@/components/I18nProvider";
import { LanguageSwitch } from "@/components/LanguageSwitch";
import { Hint } from "@/components/Hint";

export default function LoginPage() {
  const router = useRouter();
  const { t } = useI18n();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      localStorage.removeItem("fb_space");
      router.replace("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : t("loginFailed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-[max(1.25rem,env(safe-area-inset-top))]">
      <LanguageSwitch />
      <div className="surface mt-6 rounded-[2rem] p-6">
        <p className="text-5xl" aria-hidden>
          🏠
        </p>
        <h1 className="mt-3 text-2xl font-bold tracking-tight sm:text-3xl">{t("appTitle")}</h1>
        <p className="mt-2 text-lg text-stone-600">{t("appSubtitle")}</p>
        <form onSubmit={onSubmit} className="mt-8 space-y-4">
          <label className="block">
            <span className="mb-1 block text-sm font-medium">{t("email")}</span>
            <input
              className="w-full rounded-2xl border border-stone-300 bg-white px-4 py-3 text-lg"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="username"
              required
            />
            <Hint>{t("emailHint")}</Hint>
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium">{t("password")}</span>
            <input
              className="w-full rounded-2xl border border-stone-300 bg-white px-4 py-3 text-lg"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
            <Hint>{t("passwordHint")}</Hint>
          </label>
          {error ? <p className="text-red-700">{error}</p> : null}
          <button
            disabled={busy}
            className="w-full rounded-2xl bg-emerald-800 px-4 py-4 text-lg font-semibold text-white disabled:opacity-60"
          >
            {busy ? t("loggingIn") : `🔑 ${t("login")}`}
          </button>
        </form>
      </div>
    </main>
  );
}
