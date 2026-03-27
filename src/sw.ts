/// <reference lib="webworker" />
import { cleanupOutdatedCaches, precacheAndRoute } from "workbox-precaching";
import { registerRoute } from "workbox-routing";
import { CacheFirst, StaleWhileRevalidate } from "workbox-strategies";
import { ExpirationPlugin } from "workbox-expiration";

declare let self: ServiceWorkerGlobalScope;

// Workbox precache manifest injected at build time — handles versioned /assets/* chunks
precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

// ─── Runtime caching: JS/CSS assets (cache-first, 1 year) ────────────────────
registerRoute(
  ({ url }) => url.pathname.startsWith("/assets/"),
  new CacheFirst({
    cacheName: "assets-cache-v1",
    plugins: [
      new ExpirationPlugin({
        maxAgeSeconds: 365 * 24 * 60 * 60,
        maxEntries: 100,
      }),
    ],
  })
);

// ─── Runtime caching: Google Fonts stylesheets (stale-while-revalidate) ──────
registerRoute(
  ({ url }) => url.origin === "https://fonts.googleapis.com",
  new StaleWhileRevalidate({
    cacheName: "google-fonts-stylesheets-v1",
    plugins: [
      new ExpirationPlugin({ maxAgeSeconds: 60 * 60 * 24 * 30, maxEntries: 10 }),
    ],
  })
);

// ─── Runtime caching: Google Fonts files (cache-first, 1 year) ───────────────
registerRoute(
  ({ url }) => url.origin === "https://fonts.gstatic.com",
  new CacheFirst({
    cacheName: "google-fonts-webfonts-v1",
    plugins: [
      new ExpirationPlugin({
        maxAgeSeconds: 365 * 24 * 60 * 60,
        maxEntries: 20,
      }),
    ],
  })
);

// ─── Push notification handler ───────────────────────────────────────────────
self.addEventListener("push", (event: PushEvent) => {
  if (!event.data) return;

  let payload: { title?: string; body?: string; url?: string; icon?: string } = {};
  try {
    payload = event.data.json();
  } catch {
    payload = { title: "New Announcement", body: event.data.text() };
  }

  const title = payload.title || "BatchHub";
  const options: NotificationOptions = {
    body: payload.body || "",
    icon: payload.icon || "/icons/pwa-192x192.png",
    badge: "/icons/pwa-192x192.png",
    data: { url: payload.url || "/" },
    requireInteraction: false,
    tag: "batchhub-announcement",
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// ─── Notification click handler ──────────────────────────────────────────────
self.addEventListener("notificationclick", (event: NotificationEvent) => {
  event.notification.close();

  const targetUrl: string = (event.notification.data?.url as string) || "/";

  event.waitUntil(
    (self.clients as Clients).matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ("focus" in client) {
          (client as WindowClient).navigate(targetUrl);
          return (client as WindowClient).focus();
        }
      }
      return self.clients.openWindow(targetUrl);
    })
  );
});