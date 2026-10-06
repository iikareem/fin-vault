"use client";

import { useEffect } from "react";

const WARM = ["/", "/add", "/history"];

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
            void Promise.all(
              WARM.map((url) =>
                fetch(url, { credentials: "same-origin" }).catch(() => undefined),
              ),
            );
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
