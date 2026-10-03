"use client";

import { ChangePasswordForm } from "@/components/ChangePasswordForm";
import { useI18n } from "@/components/I18nProvider";
import {
  SettingsCard,
  SettingsPage,
} from "@/components/settings/SettingsChrome";

export default function SecuritySettingsPage() {
  const { t } = useI18n();
  return (
    <SettingsPage title={t("securitySection")} hint={t("securitySectionHint")}>
      <SettingsCard>
        <ChangePasswordForm />
      </SettingsCard>
    </SettingsPage>
  );
}
