// Prisms Live Coach — service worker
//
// Bump CACHE_NAME on every deploy that changes any precached file. The old
// cache is deleted on activate; localStorage (active draft + visit history)
// is a completely separate storage area the service worker never touches,
// so bumping this version can never delete a coach's saved visits.
const CACHE_NAME = 'prisms-live-coach-v1';

// Everything the Live Coach Tool needs to run with zero network access.
// Deliberately does NOT include index.html (the email generator) or any
// other page in this repo — only what this tool itself depends on.
const PRECACHE_URLS = [
  './live-coach-tool.html',
  './manifest.webmanifest',
  './assets/vendor/jspdf.umd.min.js',
  './assets/fonts/roboto.woff2',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png',
  './assets/prisms-logo.png'
];

// Files matched here use cache-first (fast, and correct since none of them
// change without also changing their filename/CACHE_NAME).
const STATIC_ASSET_PATTERN = /(assets\/vendor\/|assets\/fonts\/|assets\/icons\/|assets\/prisms-logo\.png|manifest\.webmanifest)/;

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(PRECACHE_URLS))
  );
  // No skipWaiting() on purpose — an in-progress visit should never have its
  // service worker swapped out from under it. The new version takes over
  // the next time the app is fully closed and reopened.
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(names =>
      Promise.all(
        names
          .filter(name => name.startsWith('prisms-live-coach-') && name !== CACHE_NAME)
          .map(name => caches.delete(name))
      )
    )
  );
});

// Deliberately does NOT match on request.mode === 'navigate' alone — that
// would also catch navigations to index.html (the separate email generator
// page) since it shares this origin/scope, which we must not cache.
function isAppShellRequest(url) {
  return url.pathname.endsWith('/live-coach-tool.html');
}

async function networkFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const fresh = await fetch(request);
    if (fresh && fresh.ok) cache.put(request, fresh.clone());
    return fresh;
  } catch (err) {
    const cached = await cache.match(request) || await cache.match('./live-coach-tool.html');
    if (cached) return cached;
    throw err;
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  if (cached) return cached;
  const fresh = await fetch(request);
  if (fresh && fresh.ok) cache.put(request, fresh.clone());
  return fresh;
}

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Only ever handle same-origin requests inside this repo's own path —
  // everything else (other origins, other pages in this repo like
  // index.html) passes straight through untouched.
  if (url.origin !== self.location.origin) return;

  if (isAppShellRequest(url)) {
    event.respondWith(networkFirst(event.request));
  } else if (STATIC_ASSET_PATTERN.test(url.pathname)) {
    event.respondWith(cacheFirst(event.request));
  }
  // Anything else (index.html, or any other path) is left completely
  // untouched — no event.respondWith() means the browser just does its
  // normal network fetch, uncached.
});
