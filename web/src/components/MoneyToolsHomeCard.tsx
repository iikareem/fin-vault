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

type ToolTile = {
  key: string;
  href: string;
  emoji: string;
  title: string;
  attention?: boolean;
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

  const tiles = useMemo((): ToolTile[] => {
    const unpaid = (subs?.unpaidCount ?? 0) > 0;
    const owed =
      (outside?.owedToYou ?? 0) > 0.001 || (outside?.youOwe ?? 0) > 0.001;
    const tripWarn = Boolean(travels?.active?.overLimit);
    return [
      {
        key: "goals",
        href: "/goals",
        emoji: "🎯",
        title: t("navGoals"),
      },
      {
        key: "subs",
        href: "/commitments",
        emoji: "📌",
        title: t("navSubs"),
        attention: unpaid,
      },
      {
        key: "gold",
        href: "/gold",
        emoji: "🥇",
        title: t("navGold"),
      },
      {
        key: "outside",
        href: "/outside-loans",
        emoji: "🤝",
        title: t("navOutsideLoans"),
        attention: owed,
      },
      {
        key: "travel",
        href: travels?.active ? `/travels/${travels.active.id}` : "/travels",
        emoji: "✈",
        title: t("navTravels"),
        attention: tripWarn,
      },
    ];
  }, [subs, outside, travels, t]);

  const rows = useMemo(() => {
    const next: SnapshotRow[] = [];

    if (subs && subs.subscriptions.length > 0) {
      const unpaid = subs.unpaidCount > 0;
      if (unpaid) {
        next.push({
          key: "subs",
          href: "/commitments",
          emoji: "📌",
          title: t("navSubs"),
          detail:
            subs.unpaidCount === 1
              ? t("subsHomeUnpaidOne")
              : fill(t("subsHomeUnpaid"), { n: String(subs.unpaidCount) }),
          detailTone: "warn",
          amount: subs.dueAmount,
          score: 100,
        });
      }
    }

    if (travels?.active?.overLimit) {
      const trip = travels.active;
      next.push({
        key: "travel",
        href: `/travels/${trip.id}`,
        emoji: "✈",
        title: trip.name,
        detail: t("travelsHomeOverLimit"),
        detailTone: "warn",
        amount: trip.spent,
        amountCurrency: trip.currency,
        score: 95,
      });
    }

    if (outside && outside.open.length > 0) {
      const owed = outside.owedToYou > 0.001;
      const borrow = (outside.youOwe ?? 0) > 0.001;
      if (owed || borrow) {
        next.push({
          key: "outside",
          href: "/outside-loans",
          emoji: "🤝",
          title: t("navOutsideLoans"),
          detail: owed ? t("outsideOwedToYou") : t("outsideYouOwe"),
          detailTone: "warn",
          amount: owed ? outside.owedToYou : outside.youOwe,
          score: 70,
        });
      }
    }

    return next.sort((a, b) => b.score - a.score).slice(0, 2);
  }, [outside, travels, subs, t]);

  const attentionCount = tiles.filter((tile) => tile.attention).length;
  const loaded =
    goals != null || gold != null || outside != null || travels != null;

  const subtitle =
    attentionCount > 0
      ? attentionCount === 1
        ? t("toolsHomeAttentionOne")
        : fill(t("toolsHomeAttention"), { n: String(attentionCount) })
      : loaded
        ? t("toolsHomeQuiet")
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

      <div className="border-t border-[var(--surface-border)] px-3 py-3">
        <div className="grid grid-cols-5 gap-1.5">
          {tiles.map((tile) => (
            <Link
              key={tile.key}
              href={tile.href}
              aria-label={tile.title}
              className="relative flex min-h-[4.25rem] flex-col items-center justify-center gap-1 rounded-2xl bg-[var(--panel-soft)] px-1 py-2 text-center transition hover:opacity-95 active:scale-[0.98]"
            >
              {tile.attention ? (
                <span
                  className="absolute end-1.5 top-1.5 h-2 w-2 rounded-full bg-amber-500"
                  aria-hidden
                />
              ) : null}
              <span className="text-lg leading-none" aria-hidden>
                {tile.emoji}
              </span>
              <span className="max-w-full truncate text-[0.65rem] font-semibold leading-tight text-[var(--foreground)]">
                {tile.title}
              </span>
            </Link>
          ))}
        </div>
      </div>

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
                  <span className="mt-0.5 block truncate text-xs font-semibold leading-snug text-amber-800 dark:text-amber-300">
                    {row.detail}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
