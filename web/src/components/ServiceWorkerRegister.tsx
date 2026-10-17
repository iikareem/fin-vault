"use client";

import { useEffect } from "react";

const WARM = ["/", "/add", "/travels"];
const DOCUMENT_CACHE = "fin-vault-documents-v2";
const ASSET_CACHE = "fin-vault-shell-v5";
const OFFLINE_PATHS_KEY = "fb_offline_paths";
const OFFLINE_TRIP_KEY = "fb_offline_trip";

function readRememberedPaths(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(OFFLINE_PATHS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((path): path is string => typeof path === "string")
      : [];
  } catch {
    return [];
  }
}

function rememberOfflinePath(pathname: string) {
  if (typeof window === "undefined") return;
  try {
    const next = Array.from(
      new Set([...readRememberedPaths(), pathname]),
    ).slice(-30);
    localStorage.setItem(OFFLINE_PATHS_KEY, JSON.stringify(next));
  } catch {
    /* quota / private mode */
  }
}

/** Keep the open trip path so offline UI can deep-link into it. */
export function rememberOfflineTrip(travelId: string) {
  if (typeof window === "undefined" || !travelId) return;
  const path = `/travels/${travelId}`;
  rememberOfflinePath(path);
  try {
    localStorage.setItem(
      OFFLINE_TRIP_KEY,
      JSON.stringify({ id: travelId, path, savedAt: Date.now() }),
    );
  } catch {
    /* ignore */
  }
}

export function loadOfflineTrip(): { id: string; path: string } | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(OFFLINE_TRIP_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { id?: string; path?: string };
    if (!parsed?.id || !parsed?.path) return null;
    return { id: parsed.id, path: parsed.path };
  } catch {
    return null;
  }
}

function askServiceWorkerToCache(pathname: string) {
  if (!("serviceWorker" in navigator)) return;
  void navigator.serviceWorker.ready.then((registration) => {
    registration.active?.postMessage({
      type: "CACHE_DOCUMENT",
      path: pathname,
    });
  });
}

/**
 * Store a route HTML + Next.js static assets so hard navigation works offline.
 * Writes from the page (avoids SW activation races) and also asks the SW.
 */
export async function cacheOfflinePage(path: string) {
  if (
    typeof window === "undefined" ||
    !("caches" in window) ||
    navigator.onLine === false
  ) {
    return;
  }

  const pathname = new URL(path, window.location.origin).pathname;
  rememberOfflinePath(pathname);
  if (/^\/travels\/[^/]+$/.test(pathname)) {
    rememberOfflineTrip(pathname.slice("/travels/".length));
  }

  try {
    const response = await fetch(pathname, {
      credentials: "same-origin",
      headers: { Accept: "text/html" },
      cache: "no-cache",
    });
    if (!response.ok) {
      askServiceWorkerToCache(pathname);
      return;
    }

    const documentCache = await caches.open(DOCUMENT_CACHE);
    const assetCache = await caches.open(ASSET_CACHE);
    const html = await response.clone().text();
    const assets = [
      ...html.matchAll(/(?:src|href)="([^"]*\/_next\/static\/[^"]+)"/g),
    ].map((match) => new URL(match[1]!, window.location.origin).href);

    await Promise.all(
      [...new Set(assets)].map(async (asset) => {
        try {
          const existing = await assetCache.match(asset);
          if (existing) return;
          const assetResponse = await fetch(asset, {
            credentials: "same-origin",
          });
          if (assetResponse.ok) {
            await assetCache.put(asset, assetResponse);
          }
        } catch {
          /* keep going — HTML alone still helps */
        }
      }),
    );

    await documentCache.put(pathname, response.clone());
    if (WARM.includes(pathname) || pathname === "/") {
      await assetCache.put(pathname, response.clone());
    }
  } catch {
    /* Keep any previously cached document when warming fails. */
  }

  askServiceWorkerToCache(pathname);
}

/** Registers the app-shell service worker (localhost + production). */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
      return;
    }
    const register = () => {
      navigator.serviceWorker
        .register("/sw.js")
        .then(() => {
          if (!navigator.onLine) return;
          const paths = Array.from(
            new Set([...WARM, ...readRememberedPaths()]),
          );
          paths.forEach((path) => void cacheOfflinePage(path));
        })
        .catch(() => {
          /* Ignore: private mode / unsupported browsers. */
        });
    };
    if (document.readyState === "complete") register();
    else window.addEventListener("load", register, { once: true });
  }, []);

  return null;
}
