"use client";

import { useState } from "react";
import { Hint } from "@/components/Hint";
import { useBooks, type AddTypePref } from "@/components/BooksProvider";
import { useI18n } from "@/components/I18nProvider";
import {
  PrefToggle,
  SettingsCard,
  SettingsPage,
} from "@/components/settings/SettingsChrome";

export default function HabitsSettingsPage() {
  const { t } = useI18n();
  const {
    showHomeTools,
    defaultAddType,
    skipAddConfirm,
    setPreferences,
  } = useBooks();
  const [busyKey, setBusyKey] = useState("");
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");

  function flashSaved() {
    setSaved(t("prefsSaved"));
    window.setTimeout(() => setSaved(""), 2200);
  }

  async function onToggle(
    key: "showHomeTools" | "skipAddConfirm",
    value: boolean,
  ) {
    if (busyKey) return;
    setBusyKey(key);
    setError("");
    setSaved("");
    try {
      await setPreferences({ [key]: value });
      flashSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("couldNotSave"));
    } finally {
      setBusyKey("");
    }
  }

  async function onAddType(next: AddTypePref) {
    if (busyKey || next === defaultAddType) return;
    setBusyKey("defaultAddType");
    setError("");
    setSaved("");
    try {
      await setPreferences({ defaultAddType: next });
      flashSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("couldNotSave"));
    } finally {
      setBusyKey("");
    }
  }

  return (
    <SettingsPage title={t("habitsSection")} hint={t("habitsSectionHint")}>
      {error ? (
        <p className="rounded-2xl bg-[var(--soft-red)] px-4 py-3 text-sm text-red-800">
          {error}
        </p>
      ) : null}
      {saved ? <p className="flash">{saved}</p> : null}

      <SettingsCard>
        <span className="block text-[15px] font-semibold">
          {t("defaultAddTypePref")}
        </span>
        <div className="grid grid-cols-2 gap-2">
          {(
            [
              { id: "EXPENSE" as const, label: t("paid") },
              { id: "INCOME" as const, label: t("moneyIn") },
            ] as const
          ).map((opt) => {
            const active = defaultAddType === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                disabled={Boolean(busyKey)}
                onClick={() => void onAddType(opt.id)}
                aria-pressed={active}
                className={`min-h-12 rounded-[1.15rem] px-3 text-base font-bold transition active:scale-[0.99] disabled:opacity-60 ${
                  active
                    ? "bg-[var(--cta-bg)] text-[var(--cta-fg)]"
                    : "bg-[var(--panel-soft)] text-[var(--foreground)] ring-1 ring-[var(--input-border)]"
                }`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
        <Hint>{t("defaultAddTypeHint")}</Hint>
      </SettingsCard>

      <SettingsCard>
        <div className="space-y-2">
          <PrefToggle
            checked={skipAddConfirm}
            disabled={Boolean(busyKey)}
            onChange={(v) => void onToggle("skipAddConfirm", v)}
            label={t("skipAddConfirmPref")}
            hint={t("skipAddConfirmHint")}
          />
          <PrefToggle
            checked={showHomeTools}
            disabled={Boolean(busyKey)}
            onChange={(v) => void onToggle("showHomeTools", v)}
            label={t("showHomeToolsPref")}
            hint={t("showHomeToolsHint")}
          />
        </div>
      </SettingsCard>
    </SettingsPage>
  );
}
