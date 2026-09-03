/**
 * sw.js - Safety Assistant Service Worker
 * Provides offline caching, network-first strategy, and background sync support.
 */

const CACHE_NAME = 'safety-assistant-v47';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './manifest.json',
  './css/app.css',
  './js/db.js',
  './js/sync.js',
  './js/inventory.js',
  './js/swaps.js',
  './js/crew-import.js',
  './js/item-stats.js',
  './js/sms-dialog.js',
  './js/employee-profile.js',
  './js/safety-emails.js',
  './js/cpr-roster.js',
  './js/certs-config.js',
  './js/certs-import.js',
  './js/time-breakdown.js',
  './js/sheets.js',
  './js/history.js',
  './js/previous-employees.js',
  './js/tasks.js',
  './js/trip-planner.js',
  './js/lookup.js',
  './js/procurement.js',
  './js/aging.js',
  './js/scanner.js',
  './js/gps.js',
  './js/drug-testing.js'
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE).catch((err) => {
        console.warn('PWA Cache addAll warning:', err);
      });
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  if (!event.request.url.startsWith('http://') && !event.request.url.startsWith('https://')) return;

  // IMPORTANT: Only handle requests to the SAME origin (local static assets like app.css, js, html).
  // Cross-origin network requests (such as Google Apps Script syncUrl, script.google.com, Google Drive)
  // MUST NOT be intercepted by the Service Worker.
  if (!event.request.url.startsWith(self.location.origin)) {
    return;
  }

  // Network-first strategy for scripts, HTML, and CSS so code updates apply immediately
  event.respondWith(
    fetch(event.request).then((networkResponse) => {
      if (networkResponse && networkResponse.status === 200) {
        const clonedResponse = networkResponse.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, clonedResponse);
        });
      }
      return networkResponse;
    }).catch(() => {
      return caches.match(event.request).then((cachedResponse) => {
        if (cachedResponse) return cachedResponse;
        if (event.request.headers.get('accept') && event.request.headers.get('accept').includes('text/html')) {
          return caches.match('./index.html').then((indexFallback) => {
            return indexFallback || new Response('Offline', { status: 503, statusText: 'Offline' });
          });
        }
        return new Response(JSON.stringify({ error: 'Offline' }), {
          status: 503,
          statusText: 'Service Unavailable',
          headers: { 'Content-Type': 'application/json' }
        });
      });
    })
  );
});
