"use client";

import { FormEvent, useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { useI18n } from "@/components/I18nProvider";
import { LanguageSwitch } from "@/components/LanguageSwitch";
import { Hint } from "@/components/Hint";

export default function RegisterPage() {
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
    const name = (
      form.elements.namedItem("name") as HTMLInputElement | null
    )?.value.trim();
    const email = (
      form.elements.namedItem("email") as HTMLInputElement | null
    )?.value.trim();
    const password = (
      form.elements.namedItem("password") as HTMLInputElement | null
    )?.value;
    if (!name || !email || !password) {
      setError(t("registerFailed"));
      return;
    }
    if (password.length < 8) {
      setError(t("registerPasswordShort"));
      return;
    }
    setBusy(true);
    setError("");
    try {
      await api("/auth/register", {
        method: "POST",
        body: JSON.stringify({ name, email, password }),
      });
      localStorage.removeItem("fb_space");
      router.replace("/");
    } catch (err) {
      const code = err instanceof Error ? err.message : "";
      if (code === "LOGIN_TIMEOUT") setError(t("loginTimeout"));
      else if (code === "LOGIN_NETWORK") setError(t("loginNetwork"));
      else if (/already registered/i.test(code)) setError(t("registerEmailTaken"));
      else if (/password/i.test(code)) setError(t("registerPasswordShort"));
      else setError(code || t("registerFailed"));
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
        <p className="mt-4 text-stone-600">{t("registering")}</p>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-4 pb-[max(1.25rem,env(safe-area-inset-bottom,0px))] pt-[max(1.25rem,env(safe-area-inset-top,0px))]">
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
        <h1 className="page-title mt-3">{t("registerTitle")}</h1>
        <p className="mt-2 text-lg text-stone-600">{t("registerSubtitle")}</p>
        <form noValidate onSubmit={onSubmit} className="mt-8 space-y-4">
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">{t("name")}</span>
            <input
              className="field text-lg"
              type="text"
              name="name"
              autoComplete="name"
              required
              dir="auto"
            />
            <Hint>{t("registerNameHint")}</Hint>
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">{t("email")}</span>
            <input
              className="field text-lg"
              type="text"
              name="email"
              inputMode="email"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              dir="ltr"
              lang="en"
              autoComplete="email"
              required
            />
            <Hint>{t("emailHint")}</Hint>
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">{t("password")}</span>
            <input
              className="field text-lg"
              type="password"
              name="password"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              dir="ltr"
              lang="en"
              autoComplete="new-password"
              required
              minLength={8}
            />
            <Hint>{t("registerPasswordHint")}</Hint>
          </label>
          {error ? <p className="text-red-700">{error}</p> : null}
          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-2xl bg-emerald-800 px-4 py-4 text-lg font-semibold text-white shadow-md transition hover:opacity-95 disabled:opacity-60"
          >
            {busy ? t("registering") : `✨ ${t("register")}`}
          </button>
        </form>
        <p className="mt-5 text-center text-sm text-stone-600">
          {t("registerHaveAccount")}{" "}
          <Link href="/login" className="font-semibold text-emerald-800 underline-offset-2 hover:underline">
            {t("login")}
          </Link>
        </p>
      </div>
    </main>
  );
}
