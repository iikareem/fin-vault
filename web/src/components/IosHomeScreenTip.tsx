"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/components/I18nProvider";

const DISMISS_KEY = "fb_ios_home_tip_dismissed";

function isIosSafari() {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  const iOS = /iPad|iPhone|iPod/.test(ua);
  const touchMac = navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
  return iOS || touchMac;
}

function isStandaloneDisplay() {
  if (typeof window === "undefined") return true;
  const media = window.matchMedia("(display-mode: standalone)").matches;
  const legacy =
    "standalone" in navigator &&
    Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
  return media || legacy;
}

/** Tip for iPhone/iPad: Add to Home Screen hides Safari’s search bar. */
export function IosHomeScreenTip() {
  const { t } = useI18n();
  const [show, setShow] = useState(false);

  useEffect(() => {
    try {
      if (localStorage.getItem(DISMISS_KEY) === "1") return;
      if (!isIosSafari() || isStandaloneDisplay()) return;
      setShow(true);
    } catch {
      /* ignore */
    }
  }, []);

  if (!show) return null;

  return (
    <div className="banner-info mt-4 flex items-start gap-3">
      <p className="min-w-0 flex-1 text-sm leading-relaxed">
        <span className="font-semibold">{t("iosHomeTipTitle")}</span>
        <span className="mt-1 block text-[var(--muted)]">{t("iosHomeTipBody")}</span>
      </p>
      <button
        type="button"
        className="shrink-0 rounded-full px-2 py-1 text-sm font-semibold text-[var(--muted)]"
        onClick={() => {
          try {
            localStorage.setItem(DISMISS_KEY, "1");
          } catch {
            /* ignore */
          }
          setShow(false);
        }}
        aria-label={t("iosHomeTipDismiss")}
      >
        ✕
      </button>
    </div>
  );
}
