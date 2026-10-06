"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useI18n } from "./I18nProvider";
import {
  flushOfflineQueue,
  isLikelyOffline,
  OFFLINE_QUEUE_CHANGED,
  pendingCount,
} from "@/lib/offline-queue";
import { offlineAwareNavigate } from "@/lib/offline-nav";

/**
 * Flushes queued offline expenses when the network returns and shows status
 * while offline or while items are waiting to sync.
 */
export function OfflineSync() {
  const { t } = useI18n();
  const [count, setCount] = useState(0);
  const [offline, setOffline] = useState(false);

  const refreshCount = useCallback(async () => {
    try {
      setCount(await pendingCount());
    } catch {
      setCount(0);
    }
  }, []);

  const sync = useCallback(async () => {
    try {
      await flushOfflineQueue();
    } catch {
      /* keep queue; next online/focus will retry */
    } finally {
      await refreshCount();
    }
  }, [refreshCount]);

  useEffect(() => {
    const updateOnline = () => setOffline(isLikelyOffline());
    updateOnline();
    void refreshCount();
    void sync();

    const onOnline = () => {
      setOffline(false);
      void sync();
    };
    const onOffline = () => setOffline(true);
    const onVisible = () => {
      updateOnline();
      if (document.visibilityState === "visible") void sync();
    };
    const onQueueChanged = () => {
      void refreshCount();
    };

    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener(OFFLINE_QUEUE_CHANGED, onQueueChanged);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener(OFFLINE_QUEUE_CHANGED, onQueueChanged);
    };
  }, [refreshCount, sync]);

  if (!offline && count <= 0) return null;

  const label = offline
    ? count > 0
      ? count === 1
        ? t("offlineModePendingOne")
        : t("offlineModePending", { count: String(count) })
      : t("offlineModeHint")
    : count === 1
      ? t("offlinePendingOne")
      : t("offlinePending", { count: String(count) });

  return (
    <div
      role="status"
      className="mx-3 mt-2 rounded-xl border border-[color-mix(in_srgb,var(--foreground)_12%,transparent)] bg-[color-mix(in_srgb,var(--foreground)_6%,transparent)] px-3 py-2 text-center text-sm text-[var(--muted)]"
    >
      <p>{label}</p>
      {offline ? (
        <Link
          href="/add?type=expense"
          onClick={(e) => offlineAwareNavigate("/add?type=expense", e)}
          className="mt-2 inline-flex min-h-10 items-center justify-center rounded-full bg-emerald-800 px-4 text-sm font-semibold text-white"
        >
          {t("offlineAddExpense")}
        </Link>
      ) : null}
    </div>
  );
}
