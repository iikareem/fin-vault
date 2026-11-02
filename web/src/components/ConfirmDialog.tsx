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
import { BottomSheet } from "./BottomSheet";
import { useI18n } from "./I18nProvider";

export type ConfirmTone = "danger" | "default";

export type ConfirmOptions = {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: ConfirmTone;
};

type ConfirmApi = {
  /** Asks the user to confirm. Resolves true if they confirm, false if they cancel. */
  confirm: (options: ConfirmOptions) => Promise<boolean>;
};

type Pending = ConfirmOptions & {
  resolve: (value: boolean) => void;
};

const ConfirmContext = createContext<ConfirmApi | null>(null);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const [pending, setPending] = useState<Pending | null>(null);
  const pendingRef = useRef<Pending | null>(null);

  useEffect(() => {
    pendingRef.current = pending;
  }, [pending]);

  const close = useCallback((value: boolean) => {
    const current = pendingRef.current;
    if (!current) return;
    pendingRef.current = null;
    setPending(null);
    current.resolve(value);
  }, []);

  const confirm = useCallback((options: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      const prev = pendingRef.current;
      if (prev) prev.resolve(false);
      const next: Pending = { ...options, resolve };
      pendingRef.current = next;
      setPending(next);
    });
  }, []);

  const api = useMemo<ConfirmApi>(() => ({ confirm }), [confirm]);

  const tone = pending?.tone ?? "default";
  const confirmClass =
    tone === "danger"
      ? "bg-red-800 text-white hover:bg-red-700"
      : "bg-[var(--cta-bg)] text-[var(--cta-fg)]";

  return (
    <ConfirmContext.Provider value={api}>
      {children}
      <BottomSheet
        open={Boolean(pending)}
        onClose={() => close(false)}
        title={pending?.title ?? ""}
        footer={
          pending ? (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => close(false)}
                className="min-h-12 flex-1 rounded-2xl bg-[var(--panel-soft)] px-4 text-base font-semibold text-[var(--muted)]"
              >
                {pending.cancelLabel ?? t("cancel")}
              </button>
              <button
                type="button"
                onClick={() => close(true)}
                className={`min-h-12 flex-1 rounded-2xl px-4 text-base font-semibold shadow-sm transition ${confirmClass}`}
              >
                {pending.confirmLabel ?? t("confirm")}
              </button>
            </div>
          ) : null
        }
      >
        <p className="whitespace-pre-line text-sm leading-relaxed text-[var(--muted)]">
          {pending?.message || t("confirmDefaultHint")}
        </p>
      </BottomSheet>
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error("ConfirmProvider missing");
  return ctx;
}
