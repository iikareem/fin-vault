"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { BottomNav } from "@/components/BottomNav";
import { PageShell } from "@/components/PageShell";
import { useI18n } from "@/components/I18nProvider";

export function SettingsBack() {
  const { t } = useI18n();
  return (
    <Link
      href="/profile"
      className="mb-3 inline-flex min-h-10 items-center gap-1 text-sm font-semibold text-[var(--accent-b-text)]"
    >
      ← {t("settingsBack")}
    </Link>
  );
}

export function SettingsPage({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <PageShell>
      <SettingsBack />
      <h1 className="page-title">{title}</h1>
      {hint ? (
        <p className="mt-1 text-sm leading-relaxed text-[var(--muted)]">{hint}</p>
      ) : null}
      <div className="mt-4 space-y-4">{children}</div>
      <BottomNav />
    </PageShell>
  );
}

export function SettingsCard({ children }: { children: ReactNode }) {
  return (
    <section className="surface space-y-4 rounded-[1.75rem] p-4">
      {children}
    </section>
  );
}

export function PrefToggle({
  checked,
  disabled,
  onChange,
  label,
  hint,
}: {
  checked: boolean;
  disabled?: boolean;
  onChange: (next: boolean) => void;
  label: string;
  hint: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="flex w-full items-start gap-3 rounded-2xl bg-[var(--panel-soft)] px-3 py-3 text-start transition hover:bg-[var(--press)] disabled:opacity-60"
    >
      <span className="min-w-0 flex-1">
        <span className="block text-base font-semibold leading-tight">
          {label}
        </span>
        <span className="mt-1 block text-sm leading-relaxed text-[var(--muted)]">
          {hint}
        </span>
      </span>
      <span
        className={`mt-0.5 inline-flex h-7 w-12 shrink-0 items-center rounded-full px-0.5 transition ${
          checked
            ? "justify-end bg-[var(--cta-bg)]"
            : "justify-start bg-[var(--input-border)]"
        }`}
        aria-hidden
      >
        <span className="h-6 w-6 rounded-full bg-white shadow" />
      </span>
    </button>
  );
}
