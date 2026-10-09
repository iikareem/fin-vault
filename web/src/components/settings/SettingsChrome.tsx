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
      className="inline-flex min-h-10 items-center gap-1 text-sm font-semibold text-[var(--accent-b-text)]"
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
      <header className="mt-1">
        <h1 className="text-[1.65rem] font-bold leading-tight tracking-tight text-[var(--foreground)]">
          {title}
        </h1>
        {hint ? (
          <p className="mt-1 text-sm leading-relaxed text-[var(--muted)]">
            {hint}
          </p>
        ) : null}
      </header>
      <div className="mt-4 space-y-3.5">{children}</div>
      <BottomNav />
    </PageShell>
  );
}

export function SettingsCard({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`surface space-y-3.5 rounded-[1.35rem] p-4 ${className}`.trim()}
    >
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
      className="flex w-full items-start gap-3 rounded-[1.15rem] bg-[var(--panel-soft)] px-3.5 py-3.5 text-start transition hover:opacity-95 active:scale-[0.99] disabled:opacity-60"
    >
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-semibold leading-tight text-[var(--foreground)]">
          {label}
        </span>
        <span className="mt-1 block text-xs leading-snug text-[var(--muted)]">
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
