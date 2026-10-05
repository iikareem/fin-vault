"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { BottomNav } from "@/components/BottomNav";
import { PageShell } from "@/components/PageShell";
import { Hint } from "@/components/Hint";
import { PrivateMoney } from "@/components/PrivateMoney";
import { useI18n } from "@/components/I18nProvider";
import { useBooks } from "@/components/BooksProvider";
import { householdPath } from "@/lib/space";
import { fill } from "@/lib/i18n";
import { readUiPrefs } from "@/lib/uiPrefs";

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
  totalGainLoss: number | null;
  totalGainLossPct: number | null;
};
type OutsideHome = {
  owedToYou: number;
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
  href: string;
  emoji: string;
  title: string;
  hint: string;
  hintClass?: string;
  amount?: number;
  amountCurrency?: string;
  amountNode?: ReactNode;
};

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
  const [moneyVisible, setMoneyVisible] = useState(() => {
    if (typeof window === "undefined") return false;
    return !readUiPrefs().hideBalances;
  });

  useEffect(() => {
    setKind("PERSONAL");
  }, [setKind]);

  useEffect(() => {
    setMoneyVisible(!readUiPrefs().hideBalances);
  }, []);

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

  const rows: ToolRow[] = [
    {
      href: "/goals",
      emoji: "🎯",
      title: t("navGoals"),
      amount: goals?.allocated,
      hint:
        goals && goals.goals.length > 0
          ? goals.goals.length === 1
            ? t("goalsCountOne")
            : fill(t("goalsCount"), { n: String(goals.goals.length) })
          : t("goalsHomeHint"),
    },
    {
      href: "/commitments",
      emoji: "📌",
      title: t("navSubs"),
      amount: subs
        ? subs.unpaidCount > 0
          ? subs.dueAmount
          : subs.monthlyTotal
        : undefined,
      hint:
        subs && subs.subscriptions.length > 0
          ? subs.unpaidCount === 0
            ? t("subsHomeAllPaid")
            : subs.unpaidCount === 1
              ? t("subsHomeUnpaidOne")
              : fill(t("subsHomeUnpaid"), { n: String(subs.unpaidCount) })
          : t("subsHomeHint"),
      hintClass:
        subs && subs.unpaidCount > 0
          ? "font-semibold text-amber-800 dark:text-amber-300"
          : undefined,
    },
    {
      href: "/gold",
      emoji: "🥇",
      title: t("navGold"),
      amount: gold?.totalValue,
      hint: gold?.totalGainLoss != null ? "" : t("goldHomeHint"),
      amountNode:
        gold?.totalGainLoss != null ? (
          <span
            className={
              moneyVisible
                ? gold.totalGainLoss >= 0
                  ? "font-semibold text-emerald-800 dark:text-emerald-300"
                  : "font-semibold text-red-800 dark:text-red-300"
                : "text-[var(--muted)]"
            }
          >
            <PrivateMoney
              amount={gold.totalGainLoss}
              currency={currency}
              locale={locale}
              visible={moneyVisible}
              extraSign={gold.totalGainLoss >= 0 ? "+" : "−"}
            />
            {moneyVisible && gold.totalGainLossPct != null ? (
              <span>
                {" "}
                ({gold.totalGainLossPct >= 0 ? "+" : ""}
                {gold.totalGainLossPct}%)
              </span>
            ) : null}
          </span>
        ) : null,
    },
    {
      href: "/outside-loans",
      emoji: "🤝",
      title: t("navOutsideLoans"),
      amount: outside?.owedToYou,
      hint:
        outside && outside.open.length > 0
          ? t("outsideOwedToYou")
          : t("outsideLoansHomeHint"),
    },
    {
      href: travels?.active ? `/travels/${travels.active.id}` : "/travels",
      emoji: "✈",
      title: travels?.active ? travels.active.name : t("navTravels"),
      amount: travels?.active?.spent,
      amountCurrency: travels?.active?.currency,
      hint: travels?.active
        ? t("travelsHomeActive")
        : t("travelsHomeHint"),
      hintClass: travels?.active?.overLimit
        ? "font-semibold text-amber-800 dark:text-amber-300"
        : undefined,
    },
  ];

  return (
    <PageShell>
      <header className="mb-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-[var(--accent-b-text)]">
          {t("toolsEyebrow")}
        </p>
        <h1 className="page-title">{t("toolsTitle")}</h1>
        <Hint>{t("toolsHint")}</Hint>
      </header>

      {error ? (
        <p className="mb-3 rounded-2xl bg-[var(--soft-red)] px-4 py-3 text-sm text-red-800 dark:text-red-300">
          {error}
        </p>
      ) : null}

      <ul className="space-y-2.5">
        {rows.map((row) => (
          <li key={row.href}>
            <Link
              href={row.href}
              className="surface flex min-h-[4.75rem] items-center gap-3 rounded-[1.5rem] px-4 py-3 transition hover:bg-[var(--panel-soft)] active:scale-[0.99]"
            >
              <span
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[var(--panel-soft)] text-xl"
                aria-hidden
              >
                {row.emoji}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center justify-between gap-2">
                  <span className="truncate text-base font-semibold text-[var(--foreground)]">
                    {row.title}
                  </span>
                  <span className="shrink-0 text-base font-bold tabular-nums text-[var(--foreground)]">
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
                </span>
                <span
                  className={`mt-0.5 block text-xs leading-snug ${
                    row.hintClass ?? "text-[var(--muted)]"
                  }`}
                >
                  {row.amountNode ?? row.hint}
                </span>
              </span>
              <span className="shrink-0 text-lg opacity-50" aria-hidden>
                →
              </span>
            </Link>
          </li>
        ))}
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
