"use client";

import { ReactNode, useEffect } from "react";

type BottomSheetProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  hint?: string;
  children: ReactNode;
  footer?: ReactNode;
  /** When true, backdrop click and Escape do not close (e.g. while saving). */
  lockDismiss?: boolean;
};

export function BottomSheet({
  open,
  onClose,
  title,
  hint,
  children,
  footer,
  lockDismiss = false,
}: BottomSheetProps) {
  useEffect(() => {
    if (!open || lockDismiss) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, lockDismiss, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/45 p-3 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="bottom-sheet-title"
      onClick={() => {
        if (!lockDismiss) onClose();
      }}
    >
      <div
        className="surface flex max-h-[min(90dvh,720px)] w-full max-w-md flex-col overflow-hidden rounded-[1.75rem] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="shrink-0 border-b border-[var(--surface-border)] px-4 pb-3.5 pt-2">
          <div
            className="mx-auto mb-3 h-1 w-10 rounded-full bg-stone-300/90 dark:bg-stone-600 sm:hidden"
            aria-hidden
          />
          <p id="bottom-sheet-title" className="text-base font-semibold">
            {title}
          </p>
          {hint ? (
            <p className="mt-0.5 text-xs leading-snug text-[var(--muted)]">
              {hint}
            </p>
          ) : null}
        </div>
        <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
          {children}
        </div>
        {footer ? (
          <div className="shrink-0 border-t border-[var(--surface-border)] px-4 py-3">
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  );
}
