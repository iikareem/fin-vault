"use client";

import Link from "next/link";
import { BottomNav } from "@/components/BottomNav";
import { Hint } from "@/components/Hint";
import { PageShell } from "@/components/PageShell";
import { useBooks } from "@/components/BooksProvider";
import { useI18n } from "@/components/I18nProvider";
import { CURRENCY_OPTIONS } from "@/lib/currencies";
import { fill, type MessageKey } from "@/lib/i18n";
import { type ThemeId } from "@/lib/themes";
import { IosHomeScreenTip } from "@/components/IosHomeScreenTip";

const THEME_LABEL: Record<ThemeId, MessageKey> = {
  light: "themeLight",
  dark: "themeDark",
  midnight: "themeMidnight",
  blue: "themeBlue",
  mint: "themeMint",
  forest: "themeForest",
  sand: "themeSand",
  amber: "themeAmber",
  rose: "themeRose",
  grape: "themeGrape",
  slate: "themeSlate",
};

type Section = {
  href: string;
  emoji: string;
  titleKey: MessageKey;
  hintKey: MessageKey;
  summary?: string;
};

export default function ProfilePage() {
  const { t, locale } = useI18n();
  const { displayName, preferredCurrency, theme, budgetMonthStartDay } =
    useBooks();

  const initial = (displayName?.trim()?.[0] || "?").toUpperCase();
  const currencyLabel =
    CURRENCY_OPTIONS.find((c) => c.code === preferredCurrency) ??
    CURRENCY_OPTIONS[0];

  const sections: Section[] = [
    {
      href: "/profile/appearance",
      emoji: "🎨",
      titleKey: "themeSection",
      hintKey: "themeSectionHint",
      summary: t(THEME_LABEL[theme]),
    },
    {
      href: "/profile/money",
      emoji: "💵",
      titleKey: "moneySection",
      hintKey: "moneySectionHint",
      summary: `${preferredCurrency} · ${fill(t("settingsPaydaySummary"), {
        n: String(budgetMonthStartDay),
      })}`,
    },
    {
      href: "/profile/privacy",
      emoji: "🔒",
      titleKey: "privacySection",
      hintKey: "privacySectionHint",
    },
    {
      href: "/profile/categories",
      emoji: "🏷️",
      titleKey: "myCategories",
      hintKey: "myCategoriesLinkHint",
    },
    {
      href: "/profile/security",
      emoji: "🛡️",
      titleKey: "securitySection",
      hintKey: "securitySectionHint",
    },
    {
      href: "/profile/account",
      emoji: "👤",
      titleKey: "accountSection",
      hintKey: "accountSectionHint",
    },
  ];

  return (
    <PageShell>
      <header className="surface relative overflow-hidden rounded-[1.75rem] p-4">
        <div
          className="pointer-events-none absolute inset-0 opacity-80"
          style={{
            background:
              "linear-gradient(135deg, color-mix(in srgb, var(--accent-b) 16%, transparent), color-mix(in srgb, var(--accent-a) 10%, transparent))",
          }}
          aria-hidden
        />
        <div className="relative flex items-center gap-3">
          <span
            className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl text-xl font-bold text-[var(--accent-b-fg)]"
            style={{ background: "var(--accent-b)" }}
            aria-hidden
          >
            {initial}
          </span>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-2xl font-bold tracking-tight">
              {displayName || t("profileTitle")}
            </h1>
            <p className="mt-1 text-sm leading-relaxed text-[var(--muted)]">
              {locale === "ar" ? currencyLabel.labelAr : currencyLabel.labelEn}
              {" · "}
              {fill(t("settingsPaydaySummary"), {
                n: String(budgetMonthStartDay),
              })}
            </p>
          </div>
        </div>
      </header>

      <Hint>{t("profileHint")}</Hint>
      <IosHomeScreenTip />

      <section className="mt-5">
        <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-[var(--muted)]">
          {t("settingsTitle")}
        </h2>
        <ul className="space-y-2">
          {sections.map((section) => (
            <li key={section.href}>
              <Link
                href={section.href}
                className="surface flex min-h-[4.5rem] items-center gap-3 rounded-[1.5rem] px-3 py-3 transition hover:bg-[var(--panel-soft)]"
              >
                <span
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[var(--panel-soft)] text-xl"
                  aria-hidden
                >
                  {section.emoji}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-base font-bold leading-tight">
                    {t(section.titleKey)}
                  </span>
                  <span className="mt-0.5 block text-sm leading-relaxed text-[var(--muted)]">
                    {section.summary || t(section.hintKey)}
                  </span>
                </span>
                <span
                  className="shrink-0 text-lg text-[var(--muted)]"
                  aria-hidden
                >
                  →
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <BottomNav />
    </PageShell>
  );
}
