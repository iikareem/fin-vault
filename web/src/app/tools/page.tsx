"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { api, money } from "@/lib/api";
import { BottomNav } from "@/components/BottomNav";
import { PageShell } from "@/components/PageShell";
import { PrivateMoney } from "@/components/PrivateMoney";
import { useI18n } from "@/components/I18nProvider";
import { useBooks } from "@/components/BooksProvider";
import { householdPath } from "@/lib/space";
import { fill } from "@/lib/i18n";
import { useMoneyVisible } from "@/hooks/useUiPrefs";

type GoalsHome = {
  allocated: number;
  goals: { id: string }[];
};
type SubsHome = {
  unpaidCount: number;
  dueAmount: number;
  monthlyTotal: number;
  subscriptions: { id: string }[];
};
type GoldHome = {
  totalValue: number;
  totalGrams?: number;
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

type ToolRow = {
  key: string;
  href: string;
  title: string;
  hint: ReactNode;
  amount?: number;
  amountCurrency?: string;
  amountTone?: "good" | "warn" | "neutral";
  dotTone: "info" | "warn" | "good";
  showChevronOnly?: boolean;
};

function StatusDot({ tone }: { tone: ToolRow["dotTone"] }) {
  const color =
    tone === "warn"
      ? "bg-amber-500"
      : tone === "good"
        ? "bg-emerald-500"
        : "bg-sky-600";
  return (
    <span
      className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${color}`}
      aria-hidden
    />
  );
}

export default function ToolsPage() {
  const { t, locale } = useI18n();
  const { personal, setKind } = useBooks();
  const hid = personal?.householdId ?? "";
  const currency = personal?.currency ?? "EGP";

  const [goals, setGoals] = useState<GoalsHome | null>(null);
  const [subs, setSubs] = useState<SubsHome | null>(null);
  const [gold, setGold] = useState<GoldHome | null>(null);
  const [outside, setOutside] = useState<OutsideHome | null>(null);
  const [travels, setTravels] = useState<TravelsHome | null>(null);
  const [error, setError] = useState("");
  const [moneyVisible, setMoneyVisible] = useMoneyVisible();

  useEffect(() => {
    setKind("PERSONAL");
  }, [setKind]);

  useEffect(() => {
    if (!hid) return;
    setError("");
    Promise.all([
      api<GoalsHome>(householdPath(hid, "/savings-goals")),
      api<SubsHome>(householdPath(hid, "/subscriptions")),
      api<GoldHome>(householdPath(hid, "/gold")),
      api<OutsideHome>(householdPath(hid, "/outside-loans")),
      api<TravelsHome>(householdPath(hid, "/travels/home")),
    ])
      .then(([g, s, go, o, tr]) => {
        setGoals(g);
        setSubs(s);
        setGold(go);
        setOutside(o);
        setTravels(tr);
      })
      .catch((e) => setError(e.message));
  }, [hid]);

  const attentionParts = useMemo(() => {
    const parts: string[] = [];
    const unpaid = subs?.unpaidCount ?? 0;
    if (unpaid > 0) {
      parts.push(
        unpaid === 1
          ? t("toolsAttentionBillsOne")
          : fill(t("toolsAttentionBills"), { n: String(unpaid) }),
      );
    }
    if (travels?.active?.overLimit) {
      parts.push(t("toolsAttentionTripOver"));
    }
    const owed = outside?.owedToYou ?? 0;
    const borrow = outside?.youOwe ?? 0;
    if (owed > 0.001 || borrow > 0.001) {
      parts.push(
        borrow > owed ? t("outsideYouOwe") : t("outsideOwedToYou"),
      );
    }
    return parts;
  }, [subs, travels, outside, t]);

  const rows = useMemo((): ToolRow[] => {
    const goalCount = goals?.goals.length ?? 0;
    const allocatedLabel =
      goals && moneyVisible
        ? money(goals.allocated, currency, locale)
        : moneyVisible
          ? "…"
          : "••••";

    const goalsHint =
      goals && goalCount > 0
        ? fill(t("toolsGoalsHint"), {
            n:
              goalCount === 1
                ? t("goalsCountOne")
                : fill(t("goalsCount"), { n: String(goalCount) }),
            amount: allocatedLabel,
          })
        : t("goalsHomeHint");

    const unpaid = subs?.unpaidCount ?? 0;
    const billsHint =
      subs && subs.subscriptions.length > 0
        ? unpaid === 0
          ? t("subsHomeAllPaid")
          : unpaid === 1
            ? t("subsHomeUnpaidOne")
            : fill(t("subsHomeUnpaid"), { n: String(unpaid) })
        : t("subsHomeHint");

    const grams =
      gold?.totalGrams != null && gold.totalGrams > 0
        ? fill(t("toolsGoldGrams"), {
            g: String(Math.round(gold.totalGrams * 1000) / 1000),
          })
        : null;
    const pct =
      gold?.totalGainLossPct != null
        ? `${gold.totalGainLossPct >= 0 ? "+" : ""}${gold.totalGainLossPct}%`
        : null;
    const goldHint =
      grams && pct
        ? `${grams} · ${pct}`
        : grams
          ? grams
          : pct
            ? pct
            : t("goldHomeHint");

    const owedAmt = outside?.owedToYou ?? 0;
    const borrowAmt = outside?.youOwe ?? 0;
    const outsideHint =
      outside && outside.open.length > 0
        ? owedAmt > 0.001
          ? t("outsideOwedToYou")
          : borrowAmt > 0.001
            ? t("outsideYouOwe")
            : fill(t("outsideOpenCount"), {
                n: String(outside.open.length),
              })
        : t("outsideLoansHomeHint");

    return [
      {
        key: "goals",
        href: "/goals",
        title: t("navGoals"),
        hint: goalsHint,
        amount: goals?.allocated,
        amountTone: "good",
        dotTone: "info",
      },
      {
        key: "bills",
        href: "/commitments",
        title: t("navSubs"),
        hint: billsHint,
        amount: subs
          ? unpaid > 0
            ? subs.dueAmount
            : subs.monthlyTotal
          : undefined,
        amountTone: unpaid > 0 ? "warn" : "good",
        dotTone: unpaid > 0 ? "warn" : "info",
      },
      {
        key: "gold",
        href: "/gold",
        title: t("navGold"),
        hint: goldHint,
        amount: gold?.totalValue,
        amountTone:
          gold?.totalGainLoss != null && gold.totalGainLoss < 0
            ? "warn"
            : "good",
        dotTone:
          gold?.totalGainLoss != null && gold.totalGainLoss < 0
            ? "warn"
            : "info",
      },
      {
        key: "outside",
        href: "/outside-loans",
        title: t("navOutsideLoans"),
        hint: outsideHint,
        amount:
          outside && owedAmt > 0.001
            ? owedAmt
            : outside && borrowAmt > 0.001
              ? borrowAmt
              : outside?.owedToYou,
        amountTone:
          owedAmt > 0.001 || borrowAmt > 0.001 ? "warn" : "neutral",
        dotTone: owedAmt > 0.001 || borrowAmt > 0.001 ? "warn" : "info",
      },
      {
        key: "travels",
        href: travels?.active ? `/travels/${travels.active.id}` : "/travels",
        title: t("navTravels"),
        hint: travels?.active
          ? travels.active.overLimit
            ? t("travelsHomeOverLimit")
            : fill(t("toolsTravelActive"), { name: travels.active.name })
          : t("travelsHomeHint"),
        amount: travels?.active?.spent,
        amountCurrency: travels?.active?.currency,
        amountTone: travels?.active?.overLimit ? "warn" : "neutral",
        dotTone: travels?.active?.overLimit ? "warn" : "info",
        showChevronOnly: !travels?.active,
      },
    ];
  }, [
    goals,
    subs,
    gold,
    outside,
    travels,
    moneyVisible,
    currency,
    locale,
    t,
  ]);

  return (
    <PageShell>
      <Link
        href="/"
        className="inline-flex min-h-10 items-center gap-1 text-sm font-semibold text-[var(--accent-b-text)]"
      >
        ← {t("netBack")}
      </Link>

      <header className="mt-1">
        <h1 className="page-title">{t("toolsTitle")}</h1>
        <p className="mt-1 text-sm leading-relaxed text-[var(--muted)]">
          {t("toolsHint")}
        </p>
      </header>

      {error ? (
        <p className="mt-3 rounded-2xl bg-[var(--soft-red)] px-4 py-3 text-sm text-red-800 dark:text-red-300">
          {error}
        </p>
      ) : null}

      {attentionParts.length > 0 ? (
        <section className="mt-4 rounded-[1.25rem] bg-[var(--soft-amber)] px-4 py-3.5">
          <p className="text-sm font-semibold text-amber-950 dark:text-amber-200">
            {t("attentionTitle")}
          </p>
          <p className="mt-1 text-sm leading-snug text-amber-900/90 dark:text-amber-200/90">
            {attentionParts.join(" · ")}
          </p>
        </section>
      ) : null}

      <ul className="mt-4 space-y-2.5">
        {rows.map((row) => {
          const amountClass =
            row.amountTone === "warn"
              ? "text-amber-800 dark:text-amber-300"
              : row.amountTone === "good"
                ? "text-emerald-800 dark:text-emerald-300"
                : "text-[var(--foreground)]";

          return (
            <li key={row.key}>
              <Link
                href={row.href}
                className="surface flex min-h-[4.5rem] items-start gap-3 rounded-[1.35rem] px-4 py-3.5 transition hover:bg-[var(--panel-soft)] active:scale-[0.99]"
              >
                <StatusDot tone={row.dotTone} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-start justify-between gap-3">
                    <span className="min-w-0">
                      <span className="block truncate text-[15px] font-semibold text-[var(--foreground)]">
                        {row.title}
                      </span>
                      <span className="mt-0.5 block text-xs leading-snug text-[var(--muted)]">
                        {row.hint}
                      </span>
                    </span>
                    {row.showChevronOnly ? (
                      <span
                        className="shrink-0 pt-0.5 text-lg text-[var(--muted)] opacity-60"
                        aria-hidden
                      >
                        →
                      </span>
                    ) : (
                      <span
                        className={`shrink-0 pt-0.5 text-base font-bold tabular-nums ${amountClass}`}
                      >
                        {row.amount != null ? (
                          <PrivateMoney
                            amount={row.amount}
                            currency={row.amountCurrency ?? currency}
                            locale={locale}
                            visible={moneyVisible}
                          />
                        ) : (
                          "…"
                        )}
                      </span>
                    )}
                  </span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>

      <button
        type="button"
        onClick={() => setMoneyVisible((v) => !v)}
        className="mt-4 w-full rounded-2xl border border-[var(--input-border)] bg-[var(--surface-bg)] px-4 py-2.5 text-sm font-semibold text-[var(--muted)]"
      >
        {moneyVisible ? t("tapToHideMoney") : t("tapToShowMoney")}
      </button>

      <BottomNav />
    </PageShell>
  );
}
