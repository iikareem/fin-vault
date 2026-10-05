"use client";

import { useEffect, useMemo, useState } from "react";
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

type SnapshotRow = {
  key: string;
  href: string;
  emoji: string;
  title: string;
  detail: string;
  detailTone?: "warn" | "good" | "muted";
  amount?: number;
  amountCurrency?: string;
  amountSign?: "+" | "−";
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

  const rows = useMemo(() => {
    const next: SnapshotRow[] = [];

    if (subs && subs.subscriptions.length > 0) {
      const unpaid = subs.unpaidCount > 0;
      next.push({
        key: "subs",
        href: "/commitments",
        emoji: "📌",
        title: t("navSubs"),
        detail: unpaid
          ? subs.unpaidCount === 1
            ? t("subsHomeUnpaidOne")
            : fill(t("subsHomeUnpaid"), { n: String(subs.unpaidCount) })
          : t("subsHomeAllPaid"),
        detailTone: unpaid ? "warn" : "good",
        amount: unpaid ? subs.dueAmount : subs.monthlyTotal,
        score: unpaid ? 100 : 35,
      });
    }

    if (travels?.active) {
      const trip = travels.active;
      next.push({
        key: "travel",
        href: `/travels/${trip.id}`,
        emoji: "✈",
        title: trip.name,
        detail: trip.overLimit
          ? t("travelsHomeOverLimit")
          : t("travelsHomeActive"),
        detailTone: trip.overLimit ? "warn" : "muted",
        amount: trip.spent,
        amountCurrency: trip.currency,
        score: trip.overLimit ? 95 : 80,
      });
    }

    if (outside && outside.open.length > 0) {
      const owed = outside.owedToYou > 0.001;
      const borrow = (outside.youOwe ?? 0) > 0.001;
      next.push({
        key: "outside",
        href: "/outside-loans",
        emoji: "🤝",
        title: t("navOutsideLoans"),
        detail: owed
          ? t("outsideOwedToYou")
          : borrow
            ? t("outsideYouOwe")
            : fill(t("outsideOpenCount"), {
                n: String(outside.open.length),
              }),
        detailTone: owed || borrow ? "warn" : "muted",
        amount: owed
          ? outside.owedToYou
          : borrow
            ? outside.youOwe
            : undefined,
        score: owed || borrow ? 70 : 25,
      });
    }

    if (goals && goals.goals.length > 0) {
      next.push({
        key: "goals",
        href: "/goals",
        emoji: "🎯",
        title: t("navGoals"),
        detail:
          goals.goals.length === 1
            ? t("goalsCountOne")
            : fill(t("goalsCount"), { n: String(goals.goals.length) }),
        detailTone: "muted",
        amount: goals.allocated,
        score: 45,
      });
    }

    if (gold && gold.totalValue > 0.001) {
      const gain = gold.totalGainLoss;
      next.push({
        key: "gold",
        href: "/gold",
        emoji: "🥇",
        title: t("navGold"),
        detail:
          gain == null
            ? t("goldHomeHintShort")
            : gain >= 0
              ? t("goldHomeUp")
              : t("goldHomeDown"),
        detailTone:
          gain == null ? "muted" : gain >= 0 ? "good" : "warn",
        amount: gain != null ? Math.abs(gain) : gold.totalValue,
        amountSign:
          gain == null ? undefined : gain >= 0 ? "+" : "−",
        score: 40,
      });
    }

    return next.sort((a, b) => b.score - a.score).slice(0, 3);
  }, [goals, gold, outside, travels, subs, t]);

  const attentionCount = rows.filter((r) => r.detailTone === "warn").length;
  const loaded = goals != null || gold != null || outside != null || travels != null;

  const subtitle =
    attentionCount > 0
      ? attentionCount === 1
        ? t("toolsHomeAttentionOne")
        : fill(t("toolsHomeAttention"), { n: String(attentionCount) })
      : rows.length > 0
        ? t("toolsHomeQuiet")
        : loaded
          ? t("toolsHomeEmpty")
          : t("toolsHomeHint");

  return (
    <section className="surface mt-5 overflow-hidden rounded-[1.75rem]">
      <Link
        href="/tools"
        className="flex items-center justify-between gap-3 px-4 py-3.5 transition hover:bg-[var(--panel-soft)] active:scale-[0.99]"
      >
        <span className="min-w-0">
          <span className="block text-base font-semibold text-[var(--foreground)]">
            {t("toolsHomeTitle")}
          </span>
          <span
            className={`mt-0.5 block text-xs leading-snug ${
              attentionCount > 0
                ? "font-semibold text-amber-800 dark:text-amber-300"
                : "text-[var(--muted)]"
            }`}
          >
            {subtitle}
          </span>
        </span>
        <span className="shrink-0 text-lg opacity-60" aria-hidden>
          →
        </span>
      </Link>

      {rows.length > 0 ? (
        <ul className="border-t border-[var(--surface-border)]">
          {rows.map((row) => (
            <li
              key={row.key}
              className="border-t border-[var(--surface-border)] first:border-t-0"
            >
              <Link
                href={row.href}
                className="flex items-center gap-3 px-4 py-3 transition hover:bg-[var(--panel-soft)] active:scale-[0.99]"
              >
                <span
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[var(--panel-soft)] text-lg"
                  aria-hidden
                >
                  {row.emoji}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-semibold text-[var(--foreground)]">
                      {row.title}
                    </span>
                    {row.amount != null ? (
                      <span className="shrink-0 text-sm font-bold tabular-nums text-[var(--foreground)]">
                        <PrivateMoney
                          amount={row.amount}
                          currency={row.amountCurrency ?? currency}
                          locale={locale}
                          visible={moneyVisible}
                          extraSign={row.amountSign}
                        />
                      </span>
                    ) : null}
                  </span>
                  <span
                    className={`mt-0.5 block truncate text-xs leading-snug ${
                      row.detailTone === "warn"
                        ? "font-semibold text-amber-800 dark:text-amber-300"
                        : row.detailTone === "good"
                          ? "font-medium text-[var(--accent-a-text)]"
                          : "text-[var(--muted)]"
                    }`}
                  >
                    {row.detail}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : null}

      <Link
        href="/tools"
        className="block border-t border-[var(--surface-border)] px-4 py-2.5 text-center text-sm font-semibold text-[var(--accent-a-text)] transition hover:bg-[var(--panel-soft)]"
      >
        {t("toolsHomeOpenAll")}
      </Link>
    </section>
  );
}
