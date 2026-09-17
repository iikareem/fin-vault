"use client";

import { useEffect } from "react";
import Link from "next/link";
import { BottomNav } from "@/components/BottomNav";
import { PageShell } from "@/components/PageShell";
import { useI18n } from "@/components/I18nProvider";
import { useBooks } from "@/components/BooksProvider";
import { Hint } from "@/components/Hint";

export default function MorePage() {
  const { t } = useI18n();
  const { setKind } = useBooks();

  useEffect(() => {
    setKind("HOUSE");
  }, [setKind]);

  const links = [
    { href: "/with-house", label: t("withHouseTitle"), emoji: "🏠", hint: t("moreWithHouseHint") },
    { href: "/between/history", label: t("betweenHistoryTitle"), emoji: "🤝", hint: t("moreBetweenHistoryHint") },
    { href: "/analytics", label: t("navCharts"), emoji: "📊", hint: t("moreChartsHint") },
    { href: "/charity", label: t("navCharity"), emoji: "🕌", hint: t("moreCharityHint") },
    { href: "/family", label: t("navFamily"), emoji: "👨‍👩‍👧‍👦", hint: t("moreFamilyHint") },
    { href: "/profile", label: t("navProfile"), emoji: "👤", hint: t("profileHint") },
  ];

  return (
    <PageShell>
      <h1 className="page-title">☰ {t("moreTitle")}</h1>
      <Hint>{t("moreHint")}</Hint>
      <ul className="mt-6 space-y-3">
        {links.map((link) => (
          <li key={link.href}>
            <Link
              href={link.href}
              className="surface flex min-h-20 items-center gap-3 rounded-3xl px-5 py-4 transition hover:bg-[var(--panel-soft)]"
            >
              <span
                className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[var(--panel-soft)] text-2xl"
                aria-hidden
              >
                {link.emoji}
              </span>
              <span className="min-w-0 flex-1 text-right">
                <span className="block text-xl font-bold leading-tight">
                  {link.label}
                </span>
                <span className="mt-1 block text-sm font-normal leading-relaxed text-stone-500">
                  {link.hint}
                </span>
              </span>
              <span className="shrink-0 text-lg text-stone-400" aria-hidden>
                →
              </span>
            </Link>
          </li>
        ))}
      </ul>
      <BottomNav />
    </PageShell>
  );
}
