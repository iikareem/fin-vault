/* Fin Vault service worker — app shell cache for offline use. */
const CACHE = "fin-vault-shell-v3";
const OFFLINE_URL = "/offline.html";
const APP_SHELL = ["/", "/add"];
const PRECACHE = [
  OFFLINE_URL,
  "/icon-192.png",
  "/icon-512.png",
  "/apple-icon.png",
  "/icon.png",
  ...APP_SHELL,
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then(async (cache) => {
        // Cache each URL independently so one failure does not abort install.
        await Promise.all(
          PRECACHE.map((url) =>
            cache.add(url).catch(() => undefined),
          ),
        );
      })
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

function isApiRequest(url) {
  return url.pathname.startsWith("/api/");
}

function isStaticAsset(url) {
  return (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.endsWith(".png") ||
    url.pathname.endsWith(".ico") ||
    url.pathname.endsWith(".svg") ||
    url.pathname.endsWith(".webp") ||
    url.pathname === "/offline.html"
  );
}

function isNavigation(request) {
  return request.mode === "navigate";
}

function isRscRequest(request, url) {
  if (url.searchParams.has("_rsc")) return true;
  const dest = request.headers.get("RSC");
  return dest === "1";
}

async function networkFirstDocument(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const copy = response.clone();
      const cache = await caches.open(CACHE);
      await cache.put(request, copy);
      // Also store by pathname for offline hard navigations.
      try {
        const path = new URL(request.url).pathname;
        if (APP_SHELL.includes(path) || path === "/") {
          await cache.put(path, response.clone());
        }
      } catch {
        /* ignore */
      }
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    if (cached) return cached;
    const url = new URL(request.url);
    const byPath = await caches.match(url.pathname);
    if (byPath) return byPath;
    return (
      (await caches.match(OFFLINE_URL)) ||
      new Response("Offline", {
        status: 503,
        headers: { "Content-Type": "text/plain" },
      })
    );
  }
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  let url;
  try {
    url = new URL(request.url);
  } catch {
    return;
  }
  if (url.origin !== self.location.origin) return;
  if (isApiRequest(url)) return;

  if (isStaticAsset(url)) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        });
      }),
    );
    return;
  }

  // Soft App Router navigations are not mode=navigate. Offline they fail;
  // clients should hard-navigate. Still try cache for same-origin document-ish GETs.
  if (isNavigation(request) || isRscRequest(request, url)) {
    if (isRscRequest(request, url)) {
      // Never invent RSC payloads from HTML cache — let the client hard-nav.
      event.respondWith(
        fetch(request).catch(
          () =>
            new Response(null, {
              status: 503,
              statusText: "Offline",
            }),
        ),
      );
      return;
    }
    event.respondWith(networkFirstDocument(request));
  }
});
