"use client";

import { useEffect } from "react";

const WARM = ["/", "/add", "/travels"];

/** Ask the service worker to keep an authenticated page available offline. */
export function cacheOfflinePage(path: string) {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
  void navigator.serviceWorker.ready.then((registration) => {
    registration.active?.postMessage({ type: "CACHE_DOCUMENT", path });
  });
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
            WARM.forEach(cacheOfflinePage);
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
