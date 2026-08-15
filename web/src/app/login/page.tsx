"use client";

import { FormEvent, useEffect, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { AUTH_REQUIRED, api } from "@/lib/api";
import { useI18n } from "@/components/I18nProvider";
import { LanguageSwitch } from "@/components/LanguageSwitch";
import { Hint } from "@/components/Hint";

export default function LoginPage() {
  const router = useRouter();
  const { t } = useI18n();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let cancelled = false;
    api("/auth/me")
      .then(() => {
        if (!cancelled) router.replace("/");
      })
      .catch(() => {
        if (!cancelled) setChecking(false);
      });
    return () => {
      cancelled = true;
    };
  }, [router]);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const email = (
      form.elements.namedItem("email") as HTMLInputElement | null
    )?.value.trim();
    const password = (
      form.elements.namedItem("password") as HTMLInputElement | null
    )?.value;
    if (!email || !password) {
      setError(t("loginFailed"));
      return;
    }
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
      const code = err instanceof Error ? err.message : "";
      if (code === "LOGIN_TIMEOUT") setError(t("loginTimeout"));
      else if (code === "LOGIN_NETWORK") setError(t("loginNetwork"));
      else if (code === AUTH_REQUIRED) setError(t("loginFailed"));
      else setError(code || t("loginFailed"));
    } finally {
      setBusy(false);
    }
  }

  if (checking) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center px-4">
        <Image
          src="/icon.png"
          alt="Fin Vault"
          width={64}
          height={64}
          priority
          className="rounded-2xl shadow-sm"
        />
        <p className="mt-4 text-stone-600">{t("loggingIn")}</p>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-[max(1.25rem,env(safe-area-inset-top))]">
      <LanguageSwitch />
      <div className="surface mt-6 rounded-[2rem] p-6">
        <Image
          src="/icon.png"
          alt="Fin Vault"
          width={72}
          height={72}
          priority
          className="rounded-2xl shadow-sm"
        />
        <h1 className="mt-3 text-2xl font-bold tracking-tight sm:text-3xl">{t("appTitle")}</h1>
        <p className="mt-2 text-lg text-stone-600">{t("appSubtitle")}</p>
        <form noValidate onSubmit={onSubmit} className="mt-8 space-y-4">
          <label className="block">
            <span className="mb-1 block text-sm font-medium">{t("email")}</span>
            <input
              className="w-full rounded-2xl border border-stone-300 bg-white px-4 py-3 text-lg"
              type="text"
              name="email"
              inputMode="email"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              dir="ltr"
              lang="en"
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
              name="password"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              dir="ltr"
              lang="en"
              autoComplete="current-password"
              required
            />
            <Hint>{t("passwordHint")}</Hint>
          </label>
          {error ? <p className="text-red-700">{error}</p> : null}
          <button
            type="submit"
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
