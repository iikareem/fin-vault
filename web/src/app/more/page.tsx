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
  ];

  return (
    <PageShell>
      <h1 className="text-2xl font-bold leading-tight sm:text-3xl">☰ {t("moreTitle")}</h1>
      <Hint>{t("moreHint")}</Hint>
      <ul className="mt-6 space-y-3">
        {links.map((link) => (
          <li key={link.href}>
            <Link
              href={link.href}
              className="surface flex min-h-20 flex-col justify-center gap-1 rounded-3xl px-5 py-4"
            >
              <span className="flex items-center gap-4 text-2xl font-bold">
                <span aria-hidden>{link.emoji}</span>
                <span>{link.label}</span>
              </span>
              <span className="text-base font-normal leading-relaxed text-stone-500">
                {link.hint}
              </span>
            </Link>
          </li>
        ))}
      </ul>
      <BottomNav />
    </PageShell>
  );
}
