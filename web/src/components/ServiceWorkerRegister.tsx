"use client";

import { useEffect } from "react";

const WARM = ["/", "/add", "/travels"];
const DOCUMENT_CACHE = "fin-vault-documents-v1";

/** Store a route and its Next.js assets directly so worker activation races cannot lose it. */
export async function cacheOfflinePage(path: string) {
  if (
    typeof window === "undefined" ||
    !("caches" in window) ||
    navigator.onLine === false
  ) {
    return;
  }
  try {
    const response = await fetch(path, {
      credentials: "same-origin",
      headers: { Accept: "text/html" },
    });
    if (!response.ok) return;

    const cache = await caches.open(DOCUMENT_CACHE);
    const html = await response.clone().text();
    const assets = [
      ...html.matchAll(/(?:src|href)="([^"]*\/_next\/static\/[^"]+)"/g),
    ].map((match) => new URL(match[1]!, window.location.origin).href);
    await Promise.all(
      [...new Set(assets)].map(async (asset) => {
        const cached = await caches.match(asset);
        if (cached) return;
        const assetResponse = await fetch(asset, {
          credentials: "same-origin",
        });
        if (assetResponse.ok) await cache.put(asset, assetResponse);
      }),
    );
    await cache.put(new URL(path, window.location.origin).pathname, response);
  } catch {
    /* Keep any previously cached document when warming fails. */
  }
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
          // Warm document cache while online so offline hard-nav works.
          if (navigator.onLine) {
            WARM.forEach((path) => void cacheOfflinePage(path));
          }
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
