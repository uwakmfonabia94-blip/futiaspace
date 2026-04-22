/**
 * FutiaSpace — sw.js
 * Service Worker — handles caching, offline support, and update detection.
 *
 * Strategy:
 *  • App shell (HTML, CSS, JS, icons, fonts): Cache-first
 *    → served from cache instantly; background revalidation on next visit
 *  • Supabase API / CDN calls: Network-first with cache fallback
 *    → always tries live data; falls back to cache if offline
 *  • External CDN scripts (Supabase, Lucide, OneSignal): Cache-first
 *
 * Update detection:
 *  • Bump CACHE_VERSION on every deploy
 *  • Old caches are deleted in the activate phase
 *  • pwa.js shows an update toast when a new SW is waiting
 *  • Clicking the toast sends SKIP_WAITING → new SW takes over → page reloads
 *
 * IMPORTANT: vercel.json sets Cache-Control: no-cache on sw.js itself
 *  so browsers always fetch the latest version on every page load.
 */

// ════════════════════════════════════════════════════════════════
// VERSION  — bump this string on every deploy to invalidate old cache
// ════════════════════════════════════════════════════════════════
const CACHE_VERSION = 'futiaspace-v1.0';

// Cache name for app shell assets
const SHELL_CACHE  = `${CACHE_VERSION}-shell`;
// Cache name for runtime / API responses
const RUNTIME_CACHE = `${CACHE_VERSION}-runtime`;

// All known caches — any cache NOT in this list is deleted on activate
const ALL_CACHES   = [SHELL_CACHE, RUNTIME_CACHE];


// ════════════════════════════════════════════════════════════════
// ASSETS TO PRE-CACHE  (app shell)
// ════════════════════════════════════════════════════════════════
const SHELL_ASSETS = [
  '/',
  '/index.html',
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
];

// CDN scripts to cache at runtime on first load
const CDN_ORIGINS = [
  'cdn.jsdelivr.net',
  'unpkg.com',
  'fonts.googleapis.com',
  'fonts.gstatic.com',
];

// Supabase API domain — use network-first
const SUPABASE_ORIGIN = 'supabase.co';


// ════════════════════════════════════════════════════════════════
// INSTALL  — pre-cache the app shell
// ════════════════════════════════════════════════════════════════
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      .then(cache => cache.addAll(SHELL_ASSETS))
      .then(() => {
        // Don't wait for existing tabs to close before activating
        // (pwa.js handles the reload via SKIP_WAITING message)
        // We do NOT call skipWaiting() here automatically —
        // we only do it when the user explicitly taps the update toast
      })
      .catch(err => {
        console.error('[SW] Pre-cache failed:', err);
        // Don't block install even if some assets fail
      })
  );
});


// ════════════════════════════════════════════════════════════════
// ACTIVATE  — clean up old caches
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
      .then(() => self.clients.claim()) // take control of all open tabs
  );
});


// ════════════════════════════════════════════════════════════════
// FETCH  — routing strategy per request type
// ════════════════════════════════════════════════════════════════
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Only handle GET requests — skip POST, PUT etc.
  if (request.method !== 'GET') return;

  // ── Supabase API — Network-first ─────────────────────────────
  if (url.hostname.includes(SUPABASE_ORIGIN)) {
    event.respondWith(_networkFirst(request, RUNTIME_CACHE));
    return;
  }

  // ── CDN scripts — Cache-first ────────────────────────────────
  if (CDN_ORIGINS.some(origin => url.hostname.includes(origin))) {
    event.respondWith(_cacheFirst(request, RUNTIME_CACHE));
    return;
  }

  // ── App shell (same origin) — Cache-first ────────────────────
  if (url.origin === self.location.origin) {
    event.respondWith(_cacheFirst(request, SHELL_CACHE));
    return;
  }

  // ── All other requests — Network-only ────────────────────────
  // (OneSignal worker, external resources etc.)
});


// ════════════════════════════════════════════════════════════════
// CACHE STRATEGIES
// ════════════════════════════════════════════════════════════════

/**
 * Cache-first: serve from cache if available, otherwise fetch and cache.
 * Best for: app shell, fonts, CDN scripts — assets that change infrequently.
 */
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
    // Fully offline and not in cache
    return _offlineFallback(request);
  }
}

/**
 * Network-first: always try the network; fall back to cache if offline.
 * Best for: Supabase API calls — we always want fresh data when online.
 */
async function _networkFirst(request, cacheName) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    // Offline — try cache
    const cached = await caches.match(request);
    if (cached) return cached;
    return _offlineFallback(request);
  }
}

/**
 * Offline fallback: return the cached index.html for navigate requests
 * so the SPA router can show the offline toast.
 * For non-navigate requests, return a basic 503 response.
 */
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
// MESSAGE HANDLER  — receives SKIP_WAITING from pwa.js
// ════════════════════════════════════════════════════════════════
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});