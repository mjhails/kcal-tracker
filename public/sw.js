// Simple offline support: cache whatever the app successfully loads, and serve
// from that cache if the network is unavailable. No build step needed — this
// just works alongside whatever files Vite outputs each time you deploy.

const CACHE_NAME = "kcal-tracker-v1";

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});

// Daily reminder notifications, sent by Scripts/send-reminders via web-push.
self.addEventListener("push", (event) => {
  let data = { title: "Kcal Tracker", body: "Don't forget to log today's food." };
  try {
    if (event.data) data = event.data.json();
  } catch (e) {
    // Not JSON — fall back to the default message above.
  }
  const icon = new URL("icon-192.png", self.registration.scope).href;
  event.waitUntil(self.registration.showNotification(data.title, { body: data.body, icon, badge: icon }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(clients.openWindow(self.registration.scope));
});