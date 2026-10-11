// Mattergram PWA Service Worker
const CACHE_NAME = 'mattergram-v1';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  // Only handle GET requests and skip API / WebSocket / proxy requests
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (
    url.pathname.startsWith('/api/') ||
    url.pathname.startsWith('/mattermost-proxy/') ||
    url.pathname.startsWith('/ws')
  ) {
    return;
  }

  // Network first with offline fallback for static assets
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});
