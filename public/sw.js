/* Service worker made by make-sw.mjs (ui/offline-pwa-shell-template). Do not edit by hand: change the settings and rebuild.
   Rule: online, every same-origin GET goes to the network. Offline (or when the network is slow), the copy saved at install
   is served, and any page address gets the saved shell. Nothing is ever saved from a later response, so the saved files are
   always one consistent version. Other websites, non-GET requests and the worker itself are never touched. */
'use strict';
const PREFIX = "transport-hub";
const CACHE = "transport-hub-6bad025a04";
const PRECACHE = ["app.css","app.js","icon-180.png","icon-192.png","icon-512.png","icon-maskable-512.png","index.html","manifest.webmanifest","pwa-config.js","pwa.js"];
const SHELL = "index.html";
const NAV_TIMEOUT = 4000;
const PUSH = false;
const PUSH_TITLE = "Notification";
const PUSH_ICON = "";

const abs = (p) => new URL(p, self.location.href).href;
const SHELL_URL = abs(SHELL);

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(PRECACHE.map((p) => new Request(abs(p), { cache: 'reload' })))));
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (key.startsWith(PREFIX + '-') && key !== CACHE) await caches.delete(key);
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => { if (event.data === 'skipWaiting') self.skipWaiting(); });

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== new URL(self.location.href).origin) return;
  if (url.href === self.location.href) return;
  if (req.headers.has('range')) return;
  event.respondWith(answer(req));
});

async function answer(req) {
  const net = fetch(req);
  net.catch(() => {});
  let timer;
  const slow = new Promise((_, no) => { timer = setTimeout(() => no(new Error('slow')), NAV_TIMEOUT); });
  try {
    return await Promise.race([net, slow]);
  } catch (err) {
    const cache = await caches.open(CACHE);
    const hit = await cache.match(req.mode === 'navigate' ? SHELL_URL : req.url);
    return hit || net;
  } finally {
    clearTimeout(timer);
  }
}

/* Phone alerts (only when push: true). The server sends {title, body, tag, url}; a repeated tag replaces the earlier alert
   instead of stacking. Tapping an alert focuses the open app, or opens url (same website only). */
if (PUSH) {
  self.addEventListener('push', (event) => {
    let d = {};
    try { d = event.data ? event.data.json() : {}; } catch (err) { d = { body: event.data ? event.data.text() : '' }; }
    const opts = { body: d.body ? String(d.body) : '', data: { url: d.url ? String(d.url) : './' } };
    if (d.tag) opts.tag = String(d.tag);
    if (PUSH_ICON) { opts.icon = abs(PUSH_ICON); opts.badge = abs(PUSH_ICON); }
    event.waitUntil(self.registration.showNotification(String(d.title || PUSH_TITLE), opts));
  });
  self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    let target = new URL('./', self.location.href).href;
    try {
      const u = new URL((event.notification.data && event.notification.data.url) || './', self.location.href);
      if (u.origin === self.location.origin) target = u.href;
    } catch (err) { /* keep the app home */ }
    event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const c of list) { if (c.url.startsWith(self.registration.scope) && 'focus' in c) return c.focus(); }
      return self.clients.openWindow(target);
    }));
  });
}
