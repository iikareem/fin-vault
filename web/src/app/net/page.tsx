"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { BottomNav } from "@/components/BottomNav";
import { PageShell } from "@/components/PageShell";
import { PrivateMoney } from "@/components/PrivateMoney";
import { useI18n } from "@/components/I18nProvider";
import { useBooks } from "@/components/BooksProvider";
import { householdPath } from "@/lib/space";
import {
  isCashWallet,
  isCurrentWallet,
  isSavingsWallet,
  sortCashWallets,
} from "@/lib/wallets";
import { readUiPrefs } from "@/lib/uiPrefs";
import { fill } from "@/lib/i18n";

type Account = { id: string; name: string; type?: string; balance: number };
type GoldHome = {
  totalValue: number;
  totalGrams?: number;
  totalGainLoss: number | null;
  totalGainLossPct: number | null;
};
type GoalsHome = {
  allocated: number;
  free: number;
  savingsBalance: number;
};

type Slice = {
  key: "current" | "savings" | "gold";
  label: string;
  amount: number;
  color: string;
  soft: string;
  href?: string;
};

function pctOf(part: number, whole: number) {
  if (!(whole > 0.001)) return 0;
  return Math.round((part / whole) * 1000) / 10;
}

function MixBar({
  slices,
  ready,
}: {
  slices: Slice[];
  ready: boolean;
}) {
  const total = slices.reduce((s, x) => s + Math.max(0, x.amount), 0);
  if (!ready) {
    return (
      <div className="h-3.5 w-full animate-pulse overflow-hidden rounded-full bg-white/25" />
    );
  }
  if (!(total > 0.001)) {
    return (
      <div className="h-3.5 w-full overflow-hidden rounded-full bg-white/20" />
    );
  }
  return (
    <div
      className="flex h-3.5 w-full overflow-hidden rounded-full bg-white/15 ring-1 ring-white/20"
      role="img"
      aria-label={slices
        .filter((s) => s.amount > 0.001)
        .map((s) => `${s.label} ${pctOf(s.amount, total)}%`)
        .join(" · ")}
    >
      {slices.map((s) => {
        const w = pctOf(Math.max(0, s.amount), total);
        if (w <= 0) return null;
        return (
          <div
            key={s.key}
            className="h-full min-w-[3px] transition-[width] duration-700 ease-out first:rounded-s-full last:rounded-e-full"
            style={{ width: `${w}%`, background: s.color }}
            title={`${s.label} ${w}%`}
          />
        );
      })}
    </div>
  );
}

export default function NetPage() {
  const { t, locale } = useI18n();
  const router = useRouter();
  const { personal, setKind, loading } = useBooks();
  const currency = personal?.currency ?? "EGP";
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [gold, setGold] = useState<GoldHome | null>(null);
  const [goals, setGoals] = useState<GoalsHome | null>(null);
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);
  const [moneyVisible, setMoneyVisible] = useState(
    () => !readUiPrefs().hideBalances,
  );

  useEffect(() => {
    if (loading) return;
    if (!personal) {
      router.replace("/");
      return;
    }
    setKind("PERSONAL");
    const hid = personal.householdId;
    Promise.all([
      api<Account[]>(householdPath(hid, "/accounts")),
      api<GoldHome>(householdPath(hid, "/gold")),
      api<GoalsHome>(householdPath(hid, "/savings-goals")).catch(() => null),
    ])
      .then(([list, goldData, goalsData]) => {
        setAccounts(sortCashWallets(list.filter(isCashWallet)));
        setGold(goldData);
        setGoals(goalsData);
        setReady(true);
      })
      .catch((e) => {
        setError(e instanceof Error ? e.message : t("couldNotSave"));
        setReady(true);
      });
  }, [loading, personal, router, setKind, t]);

  const current = accounts.find(isCurrentWallet)?.balance ?? 0;
  const savings = accounts.find(isSavingsWallet)?.balance ?? 0;
  const goldValue = gold?.totalValue ?? 0;
  const cash = current + savings;
  const net = cash + goldValue;
  const allocated = Math.min(
    goals?.allocated ?? 0,
    Math.max(0, savings),
  );
  const freeSavings = Math.max(0, savings - allocated);

  const slices: Slice[] = useMemo(
    () => [
      {
        key: "current",
        label: t("netCurrent"),
        amount: current,
        color: "#34d399",
        soft: "var(--soft-emerald)",
      },
      {
        key: "savings",
        label: t("netSavings"),
        amount: savings,
        color: "#38bdf8",
        soft: "var(--soft-sky)",
        href: "/goals",
      },
      {
        key: "gold",
        label: t("netGold"),
        amount: goldValue,
        color: "#fbbf24",
        soft: "var(--soft-amber)",
        href: "/gold",
      },
    ],
    [current, savings, goldValue, t],
  );

  const cashPct = pctOf(cash, net);
  const goldPct = pctOf(goldValue, net);
  const empty = ready && !(net > 0.001);

  return (
    <PageShell>
      <Link
        href="/"
        className="inline-flex min-h-10 items-center gap-1 text-sm font-semibold text-[var(--accent-b-text)]"
      >
        ← {t("netBack")}
      </Link>

      <header className="mt-1">
        <h1 className="page-title">{t("netTitle")}</h1>
        <p className="mt-1 text-sm leading-relaxed text-[var(--muted)]">
          {t("netHint")}
        </p>
      </header>
      {error ? <p className="mt-2 text-red-700">{error}</p> : null}

      <section
        className="relative mt-4 cursor-pointer select-none overflow-hidden rounded-[1.75rem] p-5 shadow-lg"
        style={{ color: "#fff", background: "var(--wallet-b)" }}
        onClick={() => setMoneyVisible((v) => !v)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setMoneyVisible((v) => !v);
          }
        }}
        role="button"
        tabIndex={0}
        aria-pressed={moneyVisible}
      >
        <div
          className="pointer-events-none absolute -end-10 -top-14 h-40 w-40 rounded-full opacity-30"
          style={{
            background:
              "radial-gradient(circle, rgba(255,255,255,0.45), transparent 70%)",
          }}
          aria-hidden
        />
        <div
          className="pointer-events-none absolute -bottom-16 -start-8 h-44 w-44 rounded-full opacity-25"
          style={{
            background:
              "radial-gradient(circle, rgba(251,191,36,0.55), transparent 70%)",
          }}
          aria-hidden
        />

        <div className="relative">
          <p className="text-base font-medium opacity-90">{t("netTotal")}</p>
          <p className="mt-1 text-[clamp(1.75rem,8vw,2.55rem)] font-bold leading-tight tracking-tight">
            {ready ? (
              <PrivateMoney
                amount={net}
                currency={currency}
                locale={locale}
                visible={moneyVisible}
              />
            ) : (
              "…"
            )}
          </p>

          <div className="mt-4 space-y-2.5">
            <p className="text-xs font-semibold uppercase tracking-wide opacity-80">
              {t("netMix")}
            </p>
            <MixBar slices={slices} ready={ready} />
            <div className="flex flex-wrap gap-2 pt-0.5">
              {ready
                ? slices
                    .filter((s) => s.amount > 0.001)
                    .map((s) => {
                      const p = pctOf(s.amount, net);
                      return (
                        <span
                          key={s.key}
                          className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-2.5 py-1 text-xs font-semibold backdrop-blur-sm"
                        >
                          <span
                            className="h-2 w-2 shrink-0 rounded-full"
                            style={{ background: s.color }}
                            aria-hidden
                          />
                          {s.label}
                          <span className="opacity-80 tabular-nums">{p}%</span>
                        </span>
                      );
                    })
                : null}
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2">
            <div className="rounded-2xl bg-white/15 px-3 py-2.5 backdrop-blur-sm">
              <p className="text-xs opacity-85">{t("netCashShare")}</p>
              <p className="mt-0.5 text-lg font-bold tabular-nums">
                {ready ? `${cashPct}%` : "…"}
              </p>
            </div>
            <div className="rounded-2xl bg-white/15 px-3 py-2.5 backdrop-blur-sm">
              <p className="text-xs opacity-85">{t("netGoldShare")}</p>
              <p className="mt-0.5 text-lg font-bold tabular-nums">
                {ready ? `${goldPct}%` : "…"}
              </p>
            </div>
          </div>

          <p className="mt-3 text-sm opacity-90">
            {moneyVisible ? t("tapToHideMoney") : t("tapToShowMoney")}
          </p>
        </div>
      </section>

      {!ready ? (
        <p className="mt-4 text-sm text-[var(--muted)]">{t("netLoading")}</p>
      ) : null}

      {empty ? (
        <p className="surface mt-4 rounded-[1.5rem] px-4 py-5 text-center text-sm text-[var(--muted)]">
          {t("netEmpty")}
        </p>
      ) : null}

      <section className="mt-4 space-y-3">
        {slices.map((s) => {
          const share = pctOf(s.amount, net);
          const body = (
            <>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full ring-2 ring-white/80"
                      style={{ background: s.color }}
                      aria-hidden
                    />
                    <p className="text-sm font-semibold">{s.label}</p>
                  </div>
                  {net > 0.001 ? (
                    <p className="mt-1 text-xs text-[var(--muted)]">
                      {fill(t("netShare"), { pct: String(share) })}
                    </p>
                  ) : null}
                </div>
                <div className="text-end">
                  <p className="text-lg font-bold tabular-nums leading-tight">
                    {ready ? (
                      <PrivateMoney
                        amount={s.amount}
                        currency={currency}
                        locale={locale}
                        visible={moneyVisible}
                      />
                    ) : (
                      "…"
                    )}
                  </p>
                  {s.href ? (
                    <p className="mt-1 text-xs font-semibold text-[var(--accent-b-text)]">
                      →
                    </p>
                  ) : null}
                </div>
              </div>
              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[var(--panel-soft)]">
                <div
                  className="h-full rounded-full transition-[width] duration-700 ease-out"
                  style={{
                    width: ready ? `${Math.min(100, share)}%` : "0%",
                    background: `linear-gradient(90deg, ${s.color}99, ${s.color})`,
                  }}
                />
              </div>
            </>
          );

          const className =
            "block rounded-[1.5rem] border border-[var(--surface-border)] p-4 shadow-[var(--surface-shadow)] transition hover:opacity-[0.98] active:scale-[0.995]";

          if (s.href) {
            return (
              <Link
                key={s.key}
                href={s.href}
                className={className}
                style={{ background: s.soft }}
              >
                {body}
              </Link>
            );
          }
          return (
            <div
              key={s.key}
              className={className}
              style={{ background: s.soft }}
            >
              {body}
            </div>
          );
        })}
      </section>

      {ready && savings > 0.001 ? (
        <section className="surface mt-3 rounded-[1.5rem] p-4">
          <p className="text-sm font-semibold">{t("netSavings")}</p>
          <div className="mt-3 space-y-2.5">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm text-[var(--muted)]">
                {t("netSavingsInGoals")}
              </p>
              <p className="font-semibold tabular-nums">
                <PrivateMoney
                  amount={allocated}
                  currency={currency}
                  locale={locale}
                  visible={moneyVisible}
                />
              </p>
            </div>
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm text-[var(--muted)]">
                {t("netSavingsFree")}
              </p>
              <p className="font-semibold tabular-nums">
                <PrivateMoney
                  amount={freeSavings}
                  currency={currency}
                  locale={locale}
                  visible={moneyVisible}
                />
              </p>
            </div>
            {savings > 0.001 ? (
              <div className="flex h-2 overflow-hidden rounded-full bg-[var(--panel-soft)] ring-1 ring-[var(--chrome-edge)]">
                <div
                  className="h-full bg-[var(--accent-a)] transition-[width] duration-700"
                  style={{ width: `${pctOf(allocated, savings)}%` }}
                />
                <div
                  className="h-full bg-[var(--accent-b)]/70 transition-[width] duration-700"
                  style={{ width: `${pctOf(freeSavings, savings)}%` }}
                />
              </div>
            ) : null}
          </div>
        </section>
      ) : null}

      {ready && gold && goldValue > 0.001 ? (
        <section className="surface mt-3 rounded-[1.5rem] p-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-semibold">{t("netGold")}</p>
            {gold.totalGrams != null && gold.totalGrams > 0 ? (
              <p className="text-sm tabular-nums text-[var(--muted)]">
                {fill(t("netGoldGrams"), {
                  n: String(
                    Math.round(gold.totalGrams * 1000) / 1000,
                  ),
                })}
              </p>
            ) : null}
          </div>
          {gold.totalGainLoss != null ? (
            <div className="mt-3 flex items-center justify-between gap-3">
              <p className="text-sm text-[var(--muted)]">
                {gold.totalGainLoss >= 0
                  ? t("netGoldGain")
                  : t("netGoldLoss")}
              </p>
              <p
                className={`font-semibold tabular-nums ${
                  gold.totalGainLoss > 0
                    ? "text-emerald-800 dark:text-emerald-300"
                    : gold.totalGainLoss < 0
                      ? "text-red-800 dark:text-red-300"
                      : "text-[var(--muted)]"
                }`}
              >
                <PrivateMoney
                  amount={Math.abs(gold.totalGainLoss)}
                  currency={currency}
                  locale={locale}
                  visible={moneyVisible}
                  extraSign={gold.totalGainLoss >= 0 ? "+" : "−"}
                />
                {gold.totalGainLossPct != null ? (
                  <span className="ms-1 text-xs opacity-80">
                    ({gold.totalGainLoss >= 0 ? "+" : "−"}
                    {Math.abs(gold.totalGainLossPct)}%)
                  </span>
                ) : null}
              </p>
            </div>
          ) : null}
        </section>
      ) : null}

      <BottomNav />
    </PageShell>
  );
}
