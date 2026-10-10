"use client";

import { useEffect, useState } from "react";
import {
  moneyVisibleFromPrefs,
  readUiPrefs,
  UI_PREFS_EVENT,
  type UiPrefs,
} from "@/lib/uiPrefs";

/** Live Privacy & comfort prefs (rehydrates after SSR and when settings change). */
export function useUiPrefs() {
  const [prefs, setPrefs] = useState<UiPrefs>(() => readUiPrefs());

  useEffect(() => {
    setPrefs(readUiPrefs());
    const onChange = (e: Event) => {
      const detail = (e as CustomEvent<UiPrefs>).detail;
      setPrefs(detail ?? readUiPrefs());
    };
    const onStorage = (e: StorageEvent) => {
      if (e.key === null || e.key === "fb_ui_prefs") {
        setPrefs(readUiPrefs());
      }
    };
    window.addEventListener(UI_PREFS_EVENT, onChange);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(UI_PREFS_EVENT, onChange);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  return prefs;
}

/**
 * Session money visibility that starts from the hide-balances preference
 * and resets when that preference changes (manual reveal still works).
 */
export function useMoneyVisible() {
  const prefs = useUiPrefs();
  const [visible, setVisible] = useState(() => {
    // Prefer hidden on SSR so balances never flash before prefs hydrate.
    if (typeof window === "undefined") return false;
    return moneyVisibleFromPrefs();
  });

  useEffect(() => {
    setVisible(moneyVisibleFromPrefs(prefs));
  }, [prefs.hideBalances]);

  return [visible, setVisible] as const;
}
