const CACHE_NAME = 'dart-coach-v2';
const ASSETS = [
  './',
  './index.html',
  './css/base.css',
  './css/layouts.css',
  './css/components.css',
  './css/game.css',
  './js/app.js',
  './manifest.json'
];

self.addEventListener('install', (e) => {
  self.skipWaiting(); // Zwingt den neuen SW, sofort aktiv zu werden
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
});

self.addEventListener('activate', (e) => {
  // Alte Caches löschen, damit V2 sauber läuft
  e.waitUntil(
    caches.keys().then((keyList) => {
      return Promise.all(keyList.map((key) => {
        if (key !== CACHE_NAME) return caches.delete(key);
      }));
    })
  );
  return self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);

  // -----------------------------------------------------------
  // REGEL 1: Lokales Netzwerk (Hue) & Firebase ignorieren
  // -----------------------------------------------------------
  // Der Service Worker soll sich NICHT in lokale Hardware-Calls einmischen.
  // Das verhindert "Failed to convert value to Response" Fehler bei Hue.
  if (url.hostname.startsWith('192.168.') || 
      url.hostname.includes('firebase') || 
      url.hostname.includes('googleapis')) {
      return; // "return" ohne respondWith lässt den Browser den Standard-Netzwerk-Call machen.
  }

  // -----------------------------------------------------------
  // REGEL 2: Eigene App-Dateien cachen (Network First)
  // -----------------------------------------------------------
  e.respondWith(
    fetch(e.request)
      .catch(() => {
        return caches.match(e.request).then((response) => {
            // Wenn nichts im Cache ist, gib eine leere 404 zurück, statt abzustürzen
            if (!response) {
                return new Response('Offline - Resource not found', { status: 404, statusText: 'Not Found' });
            }
            return response;
        });
      })
  );
});