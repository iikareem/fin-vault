"use client";

import { useState } from "react";
import { useBooks } from "@/components/BooksProvider";
import { useI18n } from "@/components/I18nProvider";
import { useToast } from "@/components/Toast";
import {
  PrefToggle,
  SettingsCard,
  SettingsPage,
} from "@/components/settings/SettingsChrome";

export default function PrivacySettingsPage() {
  const { t } = useI18n();
  const toast = useToast();
  const {
    hideBalances,
    reduceMotion,
    compactUi,
    largeText,
    showPersonalMonthSpend,
    setPreferences,
  } = useBooks();
  const [busyKey, setBusyKey] = useState<string>("");
  const [error, setError] = useState("");

  async function onPref(
    key:
      | "hideBalances"
      | "reduceMotion"
      | "compactUi"
      | "largeText"
      | "showPersonalMonthSpend",
    value: boolean,
  ) {
    if (busyKey) return;
    setBusyKey(key);
    setError("");
    try {
      await setPreferences({ [key]: value });
      toast.success(t("prefsSaved"));
    } catch (err) {
      setError(err instanceof Error ? err.message : t("couldNotSave"));
    } finally {
      setBusyKey("");
    }
  }

  return (
    <SettingsPage title={t("privacySection")} hint={t("privacySectionHint")}>
      {error ? (
        <p className="rounded-2xl bg-[var(--soft-red)] px-4 py-3 text-sm text-red-800">
          {error}
        </p>
      ) : null}
      <SettingsCard>
        <div className="space-y-2">
          <PrefToggle
            checked={hideBalances}
            disabled={Boolean(busyKey)}
            onChange={(v) => void onPref("hideBalances", v)}
            label={t("hideBalancesPref")}
            hint={t("hideBalancesHint")}
          />
          <PrefToggle
            checked={showPersonalMonthSpend}
            disabled={Boolean(busyKey)}
            onChange={(v) => void onPref("showPersonalMonthSpend", v)}
            label={t("showPersonalMonthSpendPref")}
            hint={t("showPersonalMonthSpendHint")}
          />
          <PrefToggle
            checked={reduceMotion}
            disabled={Boolean(busyKey)}
            onChange={(v) => void onPref("reduceMotion", v)}
            label={t("reduceMotionPref")}
            hint={t("reduceMotionHint")}
          />
          <PrefToggle
            checked={compactUi}
            disabled={Boolean(busyKey)}
            onChange={(v) => void onPref("compactUi", v)}
            label={t("compactUiPref")}
            hint={t("compactUiHint")}
          />
          <PrefToggle
            checked={largeText}
            disabled={Boolean(busyKey)}
            onChange={(v) => void onPref("largeText", v)}
            label={t("largeTextPref")}
            hint={t("largeTextHint")}
          />
        </div>
      </SettingsCard>
    </SettingsPage>
  );
}
