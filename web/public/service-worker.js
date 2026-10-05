// EventPass service worker, served at /service-worker.js. The legacy ticket app registered this same
// URL at the site root, so browsers that installed it pick this file up on their next visit. Activation
// then deletes the legacy cache, so no stale ticket shell is served from it.
const CACHE = "eventpass-v1";
const SHELL = "/index.html";
// Pages that stay on the server (fundraising, OBS overlay, ticket verifier). They are never answered
// from the React shell.
const SERVER_PAGES = /^\/(fundraising\.html|obs-overlay\.html|ticket-page\.html|t\/|ticket\/)/;

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.add(new Request(SHELL, { cache: "reload" })))
      // An offline install still takes over. Without this the legacy worker would keep the site.
      .catch(() => undefined)
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  // API responses are live data. They are never cached and never served from a stale copy.
  if (url.pathname.startsWith("/api/")) return;

  if (request.mode === "navigate") {
    if (SERVER_PAGES.test(url.pathname)) return;
    event.respondWith(networkThenShell(request));
    return;
  }

  // Build output under /assets/ is content-hashed, so a cached copy can never be stale.
  if (url.pathname.startsWith("/assets/")) {
    event.respondWith(cacheThenNetwork(request));
  }
});

async function networkThenShell(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE);
      await cache.put(SHELL, response.clone());
    }
    return response;
  } catch {
    const shell = await caches.match(SHELL);
    return shell ?? Response.error();
  }
}

async function cacheThenNetwork(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  const response = await fetch(request);
  if (response.ok && response.type === "basic") {
    const cache = await caches.open(CACHE);
    await cache.put(request, response.clone());
  }
  return response;
}
