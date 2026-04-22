/**
 * FutiaSpace — sw.js
 * Fixed: network-first for HTML, skipWaiting on install,
 *        prevents blank screen and 30-min stale PWA.
 */

// ── Bump this on every deploy ─────────────────────────────────
const CACHE_VERSION  = 'futiaspace-v2.0'; // ← changed from v1.0
const SHELL_CACHE    = `${CACHE_VERSION}-shell`;
const RUNTIME_CACHE  = `${CACHE_VERSION}-runtime`;
const ALL_CACHES     = [SHELL_CACHE, RUNTIME_CACHE];

const SHELL_ASSETS = [
  '/manifest.json',
  '/logo.svg',
  '/icon-192.png',
  '/icon-512.png',
  '/css/base.css',
  '/css/components.css',
  '/css/pages.css',
  '/js/supabase.js',
  '/js/utils.js',
  '/js/router.js',
  '/js/auth.js',
  '/js/directory.js',
  '/js/profile.js',
  '/js/poke.js',
  '/js/notifications.js',
  '/js/onesignal.js',
  '/js/pwa.js',
  // NOTE: index.html intentionally excluded — fetched fresh every time
];

const CDN_ORIGINS      = ['cdn.jsdelivr.net', 'unpkg.com', 'fonts.googleapis.com', 'fonts.gstatic.com'];
const SUPABASE_ORIGIN  = 'supabase.co';
const ONESIGNAL_ORIGIN = 'onesignal.com';


// ════════════════════════════════════════════════════════════════
// INSTALL
// ════════════════════════════════════════════════════════════════
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      .then(cache => cache.addAll(SHELL_ASSETS))
      .catch(err => console.error('[SW] Pre-cache failed:', err))
  );

  // ✅ FIX 1: Activate immediately — don't wait for tabs to close.
  // This fixes the 30-minute stale PWA problem.
  // pwa.js update toast still works — controllerchange fires and reloads.
  self.skipWaiting();
});


// ════════════════════════════════════════════════════════════════
// ACTIVATE
// ════════════════════════════════════════════════════════════════
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(key => !ALL_CACHES.includes(key))
          .map(key => {
            console.log('[SW] Deleting old cache:', key);
            return caches.delete(key);
          })
      ))
      .then(() => self.clients.claim())
  );
});


// ════════════════════════════════════════════════════════════════
// FETCH
// ════════════════════════════════════════════════════════════════
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method !== 'GET') return;

  // Skip OneSignal entirely — it manages its own SW
  if (url.hostname.includes(ONESIGNAL_ORIGIN)) return;

  // Supabase API — network-first
  if (url.hostname.includes(SUPABASE_ORIGIN)) {
    event.respondWith(_networkFirst(request, RUNTIME_CACHE));
    return;
  }

  // CDN scripts — cache-first (rarely change)
  if (CDN_ORIGINS.some(origin => url.hostname.includes(origin))) {
    event.respondWith(_cacheFirst(request, RUNTIME_CACHE));
    return;
  }

  // Same origin
  if (url.origin === self.location.origin) {

    // ✅ FIX 2: index.html always network-first — prevents blank screen on refresh
    if (url.pathname === '/' || url.pathname === '/index.html') {
      event.respondWith(_networkFirst(request, SHELL_CACHE));
      return;
    }

    // All other app shell files — cache-first
    event.respondWith(_cacheFirst(request, SHELL_CACHE));
    return;
  }
});


// ════════════════════════════════════════════════════════════════
// CACHE STRATEGIES
// ════════════════════════════════════════════════════════════════

async function _cacheFirst(request, cacheName) {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return _offlineFallback(request);
  }
}

async function _networkFirst(request, cacheName) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    if (cached) return cached;
    return _offlineFallback(request);
  }
}

function _offlineFallback(request) {
  if (request.mode === 'navigate') {
    return caches.match('/index.html');
  }
  return new Response('Offline', {
    status : 503,
    headers: { 'Content-Type': 'text/plain' },
  });
}


// ════════════════════════════════════════════════════════════════
// MESSAGE HANDLER
// ════════════════════════════════════════════════════════════════
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});