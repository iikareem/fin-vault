"use client";

import Link from "next/link";
import { BottomNav } from "@/components/BottomNav";
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
  titleKey: MessageKey;
  hintKey: MessageKey;
  summary?: string;
  tone: "info" | "good" | "warn";
};

function StatusDot({ tone }: { tone: Section["tone"] }) {
  const color =
    tone === "warn"
      ? "bg-amber-500"
      : tone === "good"
        ? "bg-emerald-500"
        : "bg-[var(--accent-b)]";
  return (
    <span
      className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${color}`}
      aria-hidden
    />
  );
}

export default function ProfilePage() {
  const { t, locale } = useI18n();
  const { displayName, preferredCurrency, theme, budgetMonthStartDay } =
    useBooks();

  const initial = (displayName?.trim()?.[0] || "?").toUpperCase();
  const currencyLabel =
    CURRENCY_OPTIONS.find((c) => c.code === preferredCurrency) ??
    CURRENCY_OPTIONS[0];
  const currencyText =
    locale === "ar" ? currencyLabel.labelAr : currencyLabel.labelEn;
  const paydayText = fill(t("settingsPaydaySummary"), {
    n: String(budgetMonthStartDay),
  });

  const sections: Section[] = [
    {
      href: "/profile/appearance",
      titleKey: "themeSection",
      hintKey: "themeSectionHint",
      summary: t(THEME_LABEL[theme]),
      tone: "info",
    },
    {
      href: "/profile/money",
      titleKey: "moneySection",
      hintKey: "moneySectionHint",
      summary: `${preferredCurrency} · ${paydayText}`,
      tone: "good",
    },
    {
      href: "/profile/privacy",
      titleKey: "privacySection",
      hintKey: "privacySectionHint",
      tone: "info",
    },
    {
      href: "/profile/categories",
      titleKey: "myCategories",
      hintKey: "myCategoriesLinkHint",
      tone: "info",
    },
    {
      href: "/profile/security",
      titleKey: "securitySection",
      hintKey: "securitySectionHint",
      tone: "warn",
    },
    {
      href: "/profile/account",
      titleKey: "accountSection",
      hintKey: "accountSectionHint",
      tone: "info",
    },
  ];

  return (
    <PageShell>
      <header>
        <h1 className="text-[1.65rem] font-bold leading-tight tracking-tight text-[var(--foreground)]">
          {t("profileTitle")}
        </h1>
        <p className="mt-1 text-sm text-[var(--muted)]">{t("profileHint")}</p>
      </header>

      <section className="surface mt-4 flex items-center gap-3.5 rounded-[1.5rem] px-4 py-4">
        <span
          className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full text-xl font-bold"
          style={{
            background: "var(--accent-b-soft)",
            color: "var(--accent-b-text)",
          }}
          aria-hidden
        >
          {initial}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-lg font-bold text-[var(--foreground)]">
            {displayName || t("profileTitle")}
          </p>
          <p className="mt-0.5 truncate text-sm text-[var(--muted)]">
            {currencyText}
            {" · "}
            {paydayText}
          </p>
        </div>
      </section>

      <IosHomeScreenTip />

      <section className="mt-5">
        <h2 className="mb-2.5 text-base font-bold text-[var(--foreground)]">
          {t("settingsTitle")}
        </h2>
        <ul className="space-y-2.5">
          {sections.map((section) => (
            <li key={section.href}>
              <Link
                href={section.href}
                className="surface flex min-h-[4.5rem] items-start gap-3 rounded-[1.35rem] px-4 py-3.5 transition hover:bg-[var(--panel-soft)] active:scale-[0.99]"
              >
                <StatusDot tone={section.tone} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-start justify-between gap-3">
                    <span className="min-w-0">
                      <span className="block truncate text-[15px] font-semibold text-[var(--foreground)]">
                        {t(section.titleKey)}
                      </span>
                      <span className="mt-0.5 block text-xs leading-snug text-[var(--muted)]">
                        {section.summary || t(section.hintKey)}
                      </span>
                    </span>
                    <span
                      className="shrink-0 pt-0.5 text-lg text-[var(--muted)] opacity-60"
                      aria-hidden
                    >
                      →
                    </span>
                  </span>
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
