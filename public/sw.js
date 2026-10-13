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

// Background Web Push Notification handler (when app is closed or in background)
self.addEventListener('push', (event) => {
  let data = {};
  if (event.data) {
    try {
      data = event.data.json();
    } catch (e) {
      data = { body: event.data.text() };
    }
  }

  const title = data.title || 'Mattergram';
  const body = data.body || 'New message';
  const icon = data.icon || '/icon-192.png';
  const badge = data.badge || '/icon-192.png';
  const tag = data.tag || (data.channelId ? `channel-${data.channelId}` : 'mattergram-notification');
  const targetUrl = data.url || (data.channelId ? `/c/${data.channelId}` : '/');

  const options = {
    body,
    icon,
    badge,
    tag,
    renotify: true,
    data: {
      url: targetUrl,
      channelId: data.channelId,
      timestamp: Date.now()
    },
    vibrate: [200, 100, 200]
  };

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      // If user is currently active and focused on this exact chat, avoid popping redundant OS banners
      const isActivelyViewing = clients.some(
        (c) => c.focused && c.url && c.url.includes(targetUrl)
      );
      if (isActivelyViewing) {
        return;
      }
      return self.registration.showNotification(title, options);
    })
  );
});

// Notification click handler (opens or focuses app when user taps notification)
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const targetUrl = event.notification.data?.url || '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Focus existing window if available
      for (const client of clientList) {
        if ('focus' in client) {
          if (client.url && client.url.includes(self.location.origin)) {
            client.focus();
            if ('navigate' in client && targetUrl !== '/') {
              return client.navigate(targetUrl);
            }
            return;
          }
        }
      }
      // If app was completely closed, open a new window
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })
  );
});
