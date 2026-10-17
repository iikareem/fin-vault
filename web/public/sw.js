/* Fin Vault service worker — app shell + trip documents for offline use. */
const CACHE = "fin-vault-shell-v5";
const DOCUMENT_CACHE = "fin-vault-documents-v2";
const OFFLINE_URL = "/offline.html";
const APP_SHELL = ["/", "/add", "/travels"];
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
        await Promise.all(
          PRECACHE.map((url) => cache.add(url).catch(() => undefined)),
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
          keys
            .filter((key) => key !== CACHE && key !== DOCUMENT_CACHE)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

function isApiRequest(url) {
  return url.pathname.startsWith("/api/");
}

function isStaticAsset(url) {
  const path = url.pathname;
  return (
    path.startsWith("/_next/static/") ||
    path.endsWith(".js") ||
    path.endsWith(".css") ||
    path.endsWith(".woff") ||
    path.endsWith(".woff2") ||
    path.endsWith(".ttf") ||
    path.endsWith(".png") ||
    path.endsWith(".ico") ||
    path.endsWith(".svg") ||
    path.endsWith(".webp") ||
    path.endsWith(".jpg") ||
    path.endsWith(".jpeg") ||
    path === "/offline.html"
  );
}

function isNavigation(request) {
  return request.mode === "navigate";
}

function isRscRequest(request, url) {
  if (url.searchParams.has("_rsc")) return true;
  return request.headers.get("RSC") === "1";
}

function isOfflineDocumentPath(pathname) {
  return (
    APP_SHELL.includes(pathname) ||
    pathname === "/" ||
    /^\/travels\/[^/]+$/.test(pathname)
  );
}

async function matchDocument(pathname) {
  const docCache = await caches.open(DOCUMENT_CACHE);
  const shellCache = await caches.open(CACHE);
  return (
    (await docCache.match(pathname)) ||
    (await shellCache.match(pathname)) ||
    (await caches.match(pathname))
  );
}

async function putDocument(pathname, response) {
  if (!response || !response.ok) return;
  const cache = await caches.open(DOCUMENT_CACHE);
  await cache.put(pathname, response.clone());
  if (APP_SHELL.includes(pathname) || pathname === "/") {
    const shell = await caches.open(CACHE);
    await shell.put(pathname, response.clone());
  }
}

async function cacheDocument(path) {
  const url = new URL(path, self.location.origin);
  if (url.origin !== self.location.origin) return;
  const pathname = url.pathname;
  const response = await fetch(pathname, {
    credentials: "include",
    headers: { Accept: "text/html" },
    cache: "no-cache",
  });
  if (!response.ok) return;

  const html = await response.clone().text();
  const assets = [
    ...html.matchAll(/(?:src|href)="([^"]*\/_next\/static\/[^"]+)"/g),
  ].map((match) => new URL(match[1], url).href);

  const assetCache = await caches.open(CACHE);
  await Promise.all(
    [...new Set(assets)].map((asset) =>
      assetCache.add(asset).catch(() => undefined),
    ),
  );
  await putDocument(pathname, response);
}

self.addEventListener("message", (event) => {
  if (event.data?.type !== "CACHE_DOCUMENT" || !event.data.path) return;
  event.waitUntil(cacheDocument(event.data.path).catch(() => undefined));
});

async function networkFirstDocument(request) {
  const url = new URL(request.url);
  const pathname = url.pathname;

  try {
    const response = await fetch(request);
    if (response.ok) {
      await putDocument(pathname, response);
    }
    return response;
  } catch {
    const cached = await matchDocument(pathname);
    if (cached) return cached;

    // Trip detail miss → travels hub (still usable offline from IndexedDB).
    if (/^\/travels\/[^/]+$/.test(pathname)) {
      const list = await matchDocument("/travels");
      if (list) return list;
    }

    // Offline-allowed shell miss → home.
    if (isOfflineDocumentPath(pathname) && pathname !== "/") {
      const home = await matchDocument("/");
      if (home) return home;
    }

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
      caches.match(request).then(async (cached) => {
        if (cached) return cached;
        try {
          const response = await fetch(request);
          if (response.ok) {
            const cache = await caches.open(CACHE);
            await cache.put(request, response.clone());
          }
          return response;
        } catch {
          return (
            cached ||
            new Response("", {
              status: 503,
              statusText: "Offline",
            })
          );
        }
      }),
    );
    return;
  }

  if (isRscRequest(request, url)) {
    // Soft App Router navigations cannot reuse HTML cache. Fail fast offline
    // so the client can hard-navigate to a cached document.
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

  if (isNavigation(request) || isOfflineDocumentPath(url.pathname)) {
    event.respondWith(networkFirstDocument(request));
  }
});
