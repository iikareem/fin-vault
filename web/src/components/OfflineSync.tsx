"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useI18n } from "./I18nProvider";
import {
  flushOfflineQueue,
  isLikelyOffline,
  OFFLINE_QUEUE_CHANGED,
  pendingCount,
  type FlushProgress,
} from "@/lib/offline-queue";
import { offlineAwareNavigate } from "@/lib/offline-nav";

/**
 * Flushes queued offline expenses when the network returns and shows status
 * while offline, while items wait, or while sync progresses item-by-item.
 */
export function OfflineSync() {
  const { t } = useI18n();
  const [count, setCount] = useState(0);
  const [offline, setOffline] = useState(false);
  const [progress, setProgress] = useState<FlushProgress | null>(null);
  const doneHideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refreshCount = useCallback(async () => {
    try {
      setCount(await pendingCount());
    } catch {
      setCount(0);
    }
  }, []);

  const sync = useCallback(async () => {
    if (isLikelyOffline()) {
      setProgress(null);
      await refreshCount();
      return;
    }

    if (doneHideTimer.current) {
      clearTimeout(doneHideTimer.current);
      doneHideTimer.current = null;
    }

    try {
      const result = await flushOfflineQueue({
        onProgress: (p) => {
          setProgress(p);
          setCount(Math.max(0, p.total - p.done));
        },
      });
      await refreshCount();
      if (result.synced > 0 && result.remaining === 0) {
        setProgress((prev) =>
          prev
            ? { ...prev, done: prev.total, current: prev.total }
            : { current: result.synced, total: result.synced, done: result.synced },
        );
        doneHideTimer.current = setTimeout(() => {
          setProgress(null);
          doneHideTimer.current = null;
        }, 1600);
      } else {
        setProgress(null);
      }
    } catch {
      setProgress(null);
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
    const onOffline = () => {
      setOffline(true);
      setProgress(null);
    };
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
      if (doneHideTimer.current) clearTimeout(doneHideTimer.current);
    };
  }, [refreshCount, sync]);

  const syncing = progress !== null && progress.done < progress.total;
  const justDone =
    progress !== null && progress.total > 0 && progress.done >= progress.total;

  if (!offline && count <= 0 && !syncing && !justDone) return null;

  const pct =
    progress && progress.total > 0
      ? Math.min(100, Math.round((progress.done / progress.total) * 100))
      : 0;

  const label = offline
    ? count > 0
      ? count === 1
        ? t("offlineModePendingOne")
        : t("offlineModePending", { count: String(count) })
      : t("offlineModeHint")
    : syncing && progress
      ? t("offlineSyncProgress", {
          current: String(progress.current),
          total: String(progress.total),
        })
      : justDone && progress
        ? progress.total === 1
          ? t("offlineSyncDoneOne")
          : t("offlineSyncDone", { count: String(progress.total) })
        : count === 1
          ? t("offlinePendingOne")
          : t("offlinePending", { count: String(count) });

  return (
    <div
      role="status"
      aria-live="polite"
      className="mx-3 mt-2 rounded-xl border border-[color-mix(in_srgb,var(--foreground)_12%,transparent)] bg-[color-mix(in_srgb,var(--foreground)_6%,transparent)] px-3 py-2 text-center text-sm text-[var(--muted)]"
    >
      <p>{label}</p>
      {syncing || justDone ? (
        <div className="mx-auto mt-2 h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-[color-mix(in_srgb,var(--foreground)_12%,transparent)]">
          <div
            className="h-full rounded-full bg-emerald-700 transition-[width] duration-300 ease-out"
            style={{ width: `${justDone ? 100 : pct}%` }}
          />
        </div>
      ) : null}
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
