"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { BottomNav } from "@/components/BottomNav";
import { PageShell } from "@/components/PageShell";
import { PrivateMoney } from "@/components/PrivateMoney";
import { Hint } from "@/components/Hint";
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

type Account = { id: string; name: string; type?: string; balance: number };
type GoldHome = { totalValue: number };

export default function NetPage() {
  const { t, locale } = useI18n();
  const router = useRouter();
  const { personal, setKind, loading } = useBooks();
  const currency = personal?.currency ?? "EGP";
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [goldValue, setGoldValue] = useState(0);
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
    ])
      .then(([list, gold]) => {
        setAccounts(sortCashWallets(list.filter(isCashWallet)));
        setGoldValue(gold.totalValue ?? 0);
        setReady(true);
      })
      .catch((e) => {
        setError(e instanceof Error ? e.message : t("couldNotSave"));
        setReady(true);
      });
  }, [loading, personal, router, setKind, t]);

  const current = accounts.find(isCurrentWallet)?.balance ?? 0;
  const savings = accounts.find(isSavingsWallet)?.balance ?? 0;
  const cash = current + savings;
  const net = cash + goldValue;

  return (
    <PageShell>
      <Link
        href="/"
        className="inline-flex min-h-10 items-center gap-1 text-sm font-semibold text-[var(--accent-b-text)]"
      >
        ← {t("netBack")}
      </Link>

      <h1 className="page-title mt-2">{t("netTitle")}</h1>
      <Hint>{t("netHint")}</Hint>
      {error ? <p className="mt-2 text-red-700">{error}</p> : null}

      <section
        className="mt-4 cursor-pointer select-none rounded-[1.75rem] p-5 shadow-lg"
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
        <p className="text-base opacity-90">{t("netTotal")}</p>
        <p className="mt-1 text-[clamp(1.6rem,7.5vw,2.4rem)] font-bold leading-tight">
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
        <p className="mt-3 text-sm opacity-90">
          {moneyVisible ? t("tapToHideMoney") : t("tapToShowMoney")}
        </p>
      </section>

      <section className="surface mt-4 space-y-3 rounded-[1.75rem] p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-[var(--muted)]">
              {t("netCash")}
            </p>
            <p className="text-xs text-[var(--muted)]">
              {t("netCurrent")} · {t("netSavings")}
            </p>
          </div>
          <p className="text-lg font-bold tabular-nums">
            {ready ? (
              <PrivateMoney
                amount={cash}
                currency={currency}
                locale={locale}
                visible={moneyVisible}
              />
            ) : (
              "…"
            )}
          </p>
        </div>

        <div className="rounded-2xl bg-[var(--panel-soft)] px-3 py-2.5">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-medium">{t("netCurrent")}</p>
            <p className="font-semibold tabular-nums">
              {ready ? (
                <PrivateMoney
                  amount={current}
                  currency={currency}
                  locale={locale}
                  visible={moneyVisible}
                />
              ) : (
                "…"
              )}
            </p>
          </div>
          <div className="mt-2 flex items-center justify-between gap-3">
            <p className="text-sm font-medium">{t("netSavings")}</p>
            <p className="font-semibold tabular-nums">
              {ready ? (
                <PrivateMoney
                  amount={savings}
                  currency={currency}
                  locale={locale}
                  visible={moneyVisible}
                />
              ) : (
                "…"
              )}
            </p>
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-[var(--surface-border)] pt-3">
          <p className="text-sm font-medium">{t("netGold")}</p>
          <p className="text-lg font-bold tabular-nums">
            {ready ? (
              <PrivateMoney
                amount={goldValue}
                currency={currency}
                locale={locale}
                visible={moneyVisible}
              />
            ) : (
              "…"
            )}
          </p>
        </div>
      </section>

      <BottomNav />
    </PageShell>
  );
}
