import { isLikelyOffline } from "./offline-queue";

/** Soft Next.js Link navigations fail offline; use a full document load instead. */
export function offlineAwareNavigate(
  href: string,
  event?: { preventDefault: () => void },
) {
  if (!isLikelyOffline()) return false;
  event?.preventDefault();
  if (typeof window !== "undefined") {
    window.location.assign(href);
  }
  return true;
}

/** Full reload replace — use when soft router.replace would fail offline. */
export function offlineAwareReplace(href: string) {
  if (typeof window === "undefined") return;
  window.location.replace(href);
}
