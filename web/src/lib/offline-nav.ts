import { isLikelyOffline } from "./offline-queue";

const OFFLINE_ALLOWED = new Set(["/", "/add", "/travels"]);

export function isOfflineAllowedPath(href: string): boolean {
  try {
    const path = href.startsWith("http")
      ? new URL(href).pathname
      : href.split("?")[0] || "/";
    return OFFLINE_ALLOWED.has(path) || /^\/travels\/[^/]+$/.test(path);
  } catch {
    return false;
  }
}

/**
 * Soft Next.js Link navigations fail offline.
 * Home, Add, and cached travel pages are allowed offline; other routes are blocked.
 * Returns true if the click was handled (blocked or hard-nav).
 */
export function offlineAwareNavigate(
  href: string,
  event?: { preventDefault: () => void },
): boolean {
  if (!isLikelyOffline()) return false;
  event?.preventDefault();
  if (!isOfflineAllowedPath(href)) {
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("fb-offline-blocked", { detail: { href } }),
      );
    }
    return true;
  }
  if (typeof window !== "undefined") {
    window.location.assign(href);
  }
  return true;
}

/**
 * Use a real document navigation for cached routes. If connectivity is stale
 * (navigator.onLine still says true), the service worker can still fall back
 * to the cached HTML after the network request fails.
 */
export function cachedPageNavigate(
  href: string,
  event?: { preventDefault: () => void },
): boolean {
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
