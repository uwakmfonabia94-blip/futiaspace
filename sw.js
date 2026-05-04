const CACHE_NAME = 'futiaspace-cache-v1';
const urlsToCache = [
  '/',
  '/index.html',
  '/css/style.css',
  '/js/app.js',
  '/js/router.js',
  '/js/supabase.js',
  '/js/lib/utils.js',
  '/js/lib/activity.js',
  '/js/ui/shell.js',
  '/js/ui/toast.js',
  '/js/ui/modal.js',
  '/js/ui/imageViewer.js',
  '/js/ui/compose.js',
  '/js/pages/landing.js',
  '/js/pages/login.js',
  '/js/pages/signup.js',
  '/js/pages/directory.js',
  '/js/pages/feedSection.js',
  '/js/pages/profile.js',
  '/js/pages/notifications.js',
  '/js/pages/settings.js',
  '/js/pages/marketplace.js',
  '/js/pages/search.js',
  '/js/pages/chatList.js',
  '/js/pages/chatDetail.js',
  '/js/pages/static.js',
  '/logo.svg',
  '/icon-192.png',
  '/icon-512.png',
  '/manifest.json'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(urlsToCache);
    })
  );
});

self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((response) => {
      return response || fetch(event.request);
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.filter(name => name !== CACHE_NAME).map(name => caches.delete(name))
      );
    })
  );
});