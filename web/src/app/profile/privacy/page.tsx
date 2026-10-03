"use client";

import { useState } from "react";
import { useI18n } from "@/components/I18nProvider";
import {
  PrefToggle,
  SettingsCard,
  SettingsPage,
} from "@/components/settings/SettingsChrome";
import {
  patchUiPrefs,
  readUiPrefs,
  type UiPrefs,
} from "@/lib/uiPrefs";

export default function PrivacySettingsPage() {
  const { t } = useI18n();
  const [uiPrefs, setUiPrefs] = useState<UiPrefs>(() => readUiPrefs());
  const [saved, setSaved] = useState("");

  function onUiPref<K extends keyof UiPrefs>(key: K, value: UiPrefs[K]) {
    const next = patchUiPrefs({ [key]: value });
    setUiPrefs(next);
    setSaved(t("prefsSaved"));
    window.setTimeout(() => setSaved(""), 2200);
  }

  return (
    <SettingsPage title={t("privacySection")} hint={t("privacySectionHint")}>
      {saved ? <p className="flash">{saved}</p> : null}
      <SettingsCard>
        <div className="space-y-2">
          <PrefToggle
            checked={uiPrefs.hideBalances}
            onChange={(v) => onUiPref("hideBalances", v)}
            label={t("hideBalancesPref")}
            hint={t("hideBalancesHint")}
          />
          <PrefToggle
            checked={uiPrefs.reduceMotion}
            onChange={(v) => onUiPref("reduceMotion", v)}
            label={t("reduceMotionPref")}
            hint={t("reduceMotionHint")}
          />
          <PrefToggle
            checked={uiPrefs.compactUi}
            onChange={(v) => onUiPref("compactUi", v)}
            label={t("compactUiPref")}
            hint={t("compactUiHint")}
          />
        </div>
      </SettingsCard>
    </SettingsPage>
  );
}
