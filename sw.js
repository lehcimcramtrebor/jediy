const CACHE_NAME = 'je-diy-v9.24';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './manifest.json',
  './icon.svg',
  './yoda.png',
  './jediy.png',
  './Audit_Electric.md',
  './Audit_Liquide.md',
  './app.js',
  './tailwind.config.js',
  './assets/js/tailwind.js',
  './assets/js/html2canvas.min.js',
  './assets/js/html2pdf.bundle.min.js',
  './assets/css/inter.css',
  './assets/fonts/inter-v20-latin-regular.woff2',
  './assets/fonts/inter-v20-latin-500.woff2',
  './assets/fonts/inter-v20-latin-600.woff2',
  './assets/fonts/inter-v20-latin-700.woff2',
  './assets/fonts/inter-v20-latin-800.woff2',
  './assets/fonts/inter-v20-latin-900.woff2'
];

// Installation du service worker et mise en cache des fichiers
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
  self.skipWaiting();
});

// Activation et nettoyage des anciens caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((name) => {
          if (name !== CACHE_NAME) {
            return caches.delete(name);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Interception des requêtes réseau (Mode "Cache First, fallback to Network")
self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((response) => {
      // Retourne la version en cache si elle existe, sinon fait la requête réseau
      return response || fetch(event.request);
    })
  );
});
