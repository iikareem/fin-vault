"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { fill } from "@/lib/i18n";
import { useI18n } from "@/components/I18nProvider";
import { PrivateMoney } from "@/components/PrivateMoney";
import { householdPath } from "@/lib/space";

export type ToolsSubsSnapshot = {
  unpaidCount: number;
  dueAmount: number;
  monthlyTotal: number;
  paidCount: number;
  subscriptions: { id: string }[];
};

type GoalsHome = {
  allocated: number;
  goals: { id: string }[];
};
type GoldHome = {
  totalValue: number;
  totalGainLoss: number | null;
  totalGainLossPct: number | null;
};
type OutsideHome = {
  owedToYou: number;
  youOwe?: number;
  open: { id: string }[];
};
type TravelHomeCard = {
  id: string;
  name: string;
  currency: string;
  spent: number;
  pct: number | null;
  overLimit: boolean;
  status: "upcoming" | "active" | "past";
};
type TravelsHome = {
  active: TravelHomeCard | null;
};

type ToolChip = {
  key: string;
  href: string;
  title: string;
  detail: ReactNode;
  warn?: boolean;
  score: number;
};

type Props = {
  householdId: string;
  currency: string;
  moneyVisible: boolean;
  /** Already loaded on home — avoid a second subscriptions fetch. */
  subs: ToolsSubsSnapshot | null;
};

export function MoneyToolsHomeCard({
  householdId,
  currency,
  moneyVisible,
  subs,
}: Props) {
  const { t, locale } = useI18n();
  const [goals, setGoals] = useState<GoalsHome | null>(null);
  const [gold, setGold] = useState<GoldHome | null>(null);
  const [outside, setOutside] = useState<OutsideHome | null>(null);
  const [travels, setTravels] = useState<TravelsHome | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      api<GoalsHome>(householdPath(householdId, "/savings-goals")),
      api<GoldHome>(householdPath(householdId, "/gold")),
      api<OutsideHome>(householdPath(householdId, "/outside-loans")),
      api<TravelsHome>(householdPath(householdId, "/travels/home")),
    ])
      .then(([g, go, o, tr]) => {
        if (cancelled) return;
        setGoals(g);
        setGold(go);
        setOutside(o);
        setTravels(tr);
      })
      .catch(() => {
        /* Keep the hub link even if snapshots fail. */
      });
    return () => {
      cancelled = true;
    };
  }, [householdId]);

  const chips = useMemo((): ToolChip[] => {
    const next: ToolChip[] = [];

    const unpaid = subs?.unpaidCount ?? 0;
    if (subs && subs.subscriptions.length > 0) {
      next.push({
        key: "subs",
        href: "/commitments",
        title: t("navSubs"),
        detail:
          unpaid > 0
            ? unpaid === 1
              ? t("toolsDueSoonOne")
              : fill(t("toolsDueSoon"), { n: String(unpaid) })
            : t("toolsBadgeClear"),
        warn: unpaid > 0,
        score: unpaid > 0 ? 100 : 40,
      });
    }

    if (goals && goals.goals.length > 0) {
      next.push({
        key: "goals",
        href: "/goals",
        title: t("navGoals"),
        detail: (
          <PrivateMoney
            amount={goals.allocated}
            currency={currency}
            locale={locale}
            visible={moneyVisible}
          />
        ),
        score: 55,
      });
    } else {
      next.push({
        key: "goals",
        href: "/goals",
        title: t("navGoals"),
        detail: t("monthLimitSet"),
        score: 20,
      });
    }

    if (gold && gold.totalValue > 0.001) {
      const pct = gold.totalGainLossPct;
      const up = (gold.totalGainLoss ?? 0) >= 0;
      next.push({
        key: "gold",
        href: "/gold",
        title: t("navGold"),
        detail:
          pct == null
            ? (
                <PrivateMoney
                  amount={gold.totalValue}
                  currency="EGP"
                  locale={locale}
                  visible={moneyVisible}
                />
              )
            : `${up ? "+" : ""}${pct.toFixed(1)}%`,
        score: 50,
      });
    }

    if (travels?.active?.overLimit) {
      next.push({
        key: "travel",
        href: `/travels/${travels.active.id}`,
        title: t("navTravels"),
        detail: t("travelsHomeOverLimit"),
        warn: true,
        score: 95,
      });
    }

    const owedAmt = outside?.owedToYou ?? 0;
    const borrowAmt = outside?.youOwe ?? 0;
    if (owedAmt > 0.001 || borrowAmt > 0.001) {
      next.push({
        key: "outside",
        href: "/outside-loans",
        title: t("navOutsideLoans"),
        detail:
          borrowAmt > owedAmt ? t("outsideYouOwe") : t("outsideOwedToYou"),
        warn: true,
        score: 70,
      });
    }

    return next.sort((a, b) => b.score - a.score).slice(0, 3);
  }, [subs, goals, gold, outside, travels, currency, locale, moneyVisible, t]);

  return (
    <section className="mt-5">
      <div className="flex items-center justify-between gap-3 px-0.5">
        <h2 className="text-[15px] font-semibold text-[var(--foreground)]">
          {t("toolsHomeTitle")}
        </h2>
        <Link
          href="/tools"
          className="text-xs font-medium text-[var(--accent-b-text)]"
        >
          {t("latestSeeAll")}
        </Link>
      </div>
      <div className="-mx-1 mt-2.5 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {chips.map((chip) => (
          <Link
            key={chip.key}
            href={chip.href}
            className={`min-w-[7.25rem] shrink-0 rounded-2xl border bg-[var(--surface-bg)] px-3 py-3 transition hover:opacity-95 active:scale-[0.98] ${
              chip.warn
                ? "border-amber-300/80 dark:border-amber-500/40"
                : "border-[var(--surface-border)]"
            }`}
          >
            <span className="block text-[13px] font-semibold text-[var(--foreground)]">
              {chip.title}
            </span>
            <span
              className={`mt-1.5 block truncate text-[11px] leading-snug ${
                chip.warn
                  ? "font-medium text-amber-800 dark:text-amber-300"
                  : "text-[var(--muted)]"
              }`}
            >
              {chip.detail}
            </span>
          </Link>
        ))}
        {chips.length === 0 ? (
          <Link
            href="/tools"
            className="min-w-[7.25rem] shrink-0 rounded-2xl border border-[var(--surface-border)] bg-[var(--surface-bg)] px-3 py-3"
          >
            <span className="block text-[13px] font-semibold text-[var(--foreground)]">
              {t("toolsHomeTitle")}
            </span>
            <span className="mt-1.5 block text-[11px] text-[var(--muted)]">
              {t("toolsHomeHint")}
            </span>
          </Link>
        ) : null}
      </div>
    </section>
  );
}
