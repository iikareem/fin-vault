"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";
import { useI18n } from "./I18nProvider";
import type { MessageKey } from "@/lib/i18n";

export type ToastTone = "success" | "error" | "info";

type ToastItem = {
  id: number;
  message: string;
  tone: ToastTone;
};

type ToastApi = {
  show: (message: string, tone?: ToastTone) => void;
  success: (message: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;
};

const ToastContext = createContext<ToastApi | null>(null);

/** Cross-page success keys written to sessionStorage before navigate. */
const NAV_FLASH_KEYS = new Set<string>([
  "claimSaved",
  "payBackDone",
  "housePaidForSaved",
  "coverRepayDone",
  "transferSaved",
  "cashWithdrawSaved",
  "cashWithdrawWithTransferSaved",
  "savedOffline",
]);

const DISMISS_MS: Record<ToastTone, number> = {
  success: 3200,
  info: 3600,
  error: 4800,
};

export function setNavFlash(key: MessageKey) {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem("fb_flash", key);
  } catch {
    /* ignore */
  }
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const pathname = usePathname();
  const [toast, setToast] = useState<ToastItem | null>(null);
  const [entered, setEntered] = useState(false);
  const [mounted, setMounted] = useState(false);
  const idRef = useRef(0);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const enterRaf = useRef<number | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  const clearTimers = useCallback(() => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    if (clearTimer.current) clearTimeout(clearTimer.current);
    if (enterRaf.current != null) cancelAnimationFrame(enterRaf.current);
    hideTimer.current = null;
    clearTimer.current = null;
    enterRaf.current = null;
  }, []);

  const dismiss = useCallback(() => {
    setEntered(false);
    clearTimers();
    clearTimer.current = setTimeout(() => setToast(null), 220);
  }, [clearTimers]);

  const show = useCallback(
    (message: string, tone: ToastTone = "success") => {
      if (!message.trim()) return;
      clearTimers();
      const id = ++idRef.current;
      setToast({ id, message, tone });
      setEntered(false);
      // Next paint → slide/fade in (also guarantees a non-zero opacity frame).
      enterRaf.current = requestAnimationFrame(() => {
        enterRaf.current = requestAnimationFrame(() => {
          setEntered(true);
          hideTimer.current = setTimeout(dismiss, DISMISS_MS[tone]);
        });
      });
    },
    [clearTimers, dismiss],
  );

  const api = useMemo<ToastApi>(
    () => ({
      show,
      success: (message) => show(message, "success"),
      error: (message) => show(message, "error"),
      info: (message) => show(message, "info"),
    }),
    [show],
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    let key: string | null = null;
    try {
      key = sessionStorage.getItem("fb_flash");
      if (key) sessionStorage.removeItem("fb_flash");
    } catch {
      return;
    }
    if (key && NAV_FLASH_KEYS.has(key)) {
      show(t(key as MessageKey), "success");
    }
  }, [pathname, show, t]);

  useEffect(() => () => clearTimers(), [clearTimers]);

  const toneClass =
    toast?.tone === "error"
      ? "bg-red-800 text-white"
      : toast?.tone === "info"
        ? "bg-sky-800 text-white"
        : "bg-emerald-800 text-white";

  const overlay =
    mounted && toast ? (
      <div
        className="fb-toast-host pointer-events-none fixed inset-x-0 top-0 z-[300] flex justify-center px-3 pt-[calc(0.75rem+env(safe-area-inset-top,0px))] sm:px-4"
        aria-live="polite"
        aria-relevant="additions"
        role="status"
      >
        <button
          type="button"
          key={toast.id}
          onClick={dismiss}
          className={`fb-toast pointer-events-auto w-full max-w-md rounded-2xl px-4 py-3.5 text-start text-[0.95rem] font-semibold shadow-xl transition duration-200 ease-out ${toneClass} ${
            entered
              ? "translate-y-0 opacity-100"
              : "-translate-y-2 opacity-0"
          }`}
        >
          <span className="flex items-start gap-2.5">
            <ToastIcon tone={toast.tone} />
            <span className="min-w-0 flex-1 leading-snug">{toast.message}</span>
          </span>
        </button>
      </div>
    ) : null;

  return (
    <ToastContext.Provider value={api}>
      {children}
      {mounted && overlay ? createPortal(overlay, document.body) : null}
    </ToastContext.Provider>
  );
}

function ToastIcon({ tone }: { tone: ToastTone }) {
  const common = {
    width: 20,
    height: 20,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2.4,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    className: "mt-0.5 shrink-0",
    "aria-hidden": true as const,
  };
  if (tone === "error") {
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 8v5" />
        <path d="M12 16h.01" />
      </svg>
    );
  }
  if (tone === "info") {
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 11v5" />
        <path d="M12 8h.01" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <circle cx="12" cy="12" r="9" />
      <path d="M8.5 12.5 11 15l4.5-5" />
    </svg>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("ToastProvider missing");
  return ctx;
}
