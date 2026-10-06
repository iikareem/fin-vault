"use client";

import { useCallback, useEffect, useState } from "react";
import { useI18n } from "./I18nProvider";
import {
  flushOfflineQueue,
  OFFLINE_QUEUE_CHANGED,
  pendingCount,
} from "@/lib/offline-queue";

/**
 * Flushes queued offline expenses when the network returns and shows a
 * compact pending banner while items are waiting.
 */
export function OfflineSync() {
  const { t } = useI18n();
  const [count, setCount] = useState(0);

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
    void refreshCount();
    void sync();

    const onOnline = () => {
      void sync();
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") void sync();
    };
    const onQueueChanged = () => {
      void refreshCount();
    };

    window.addEventListener("online", onOnline);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener(OFFLINE_QUEUE_CHANGED, onQueueChanged);
    return () => {
      window.removeEventListener("online", onOnline);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener(OFFLINE_QUEUE_CHANGED, onQueueChanged);
    };
  }, [refreshCount, sync]);

  if (count <= 0) return null;

  const label =
    count === 1
      ? t("offlinePendingOne")
      : t("offlinePending", { count: String(count) });

  return (
    <div
      role="status"
      className="mx-3 mt-2 rounded-xl border border-[color-mix(in_srgb,var(--foreground)_12%,transparent)] bg-[color-mix(in_srgb,var(--foreground)_6%,transparent)] px-3 py-2 text-center text-sm text-[var(--muted)]"
    >
      {label}
    </div>
  );
}
