const CACHE_NAME = 'je-diy-v.X.1.01';
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

// Interception des requêtes réseau
// Utilise "Network-First (avec repli sur cache et mise à jour dynamique)" pour les documents/scripts clés
// Utilise "Cache-First (avec repli sur réseau)" pour les ressources statiques et immuables (images, polices, bibliothèques tierces)
self.addEventListener('fetch', (event) => {
  // Ignorer les requêtes non-GET (ex: POST, PUT, DELETE, etc.)
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // Identifier si la ressource fait partie du noyau dynamique de l'application
  const isNetworkFirst = 
    event.request.mode === 'navigate' || 
    url.pathname.endsWith('/') ||
    url.pathname.endsWith('index.html') || 
    url.pathname.endsWith('manifest.json') ||
    url.pathname.endsWith('app.js') ||
    url.pathname.endsWith('tailwind.config.js') ||
    url.pathname.endsWith('.md');

  if (isNetworkFirst) {
    // Stratégie Network-First
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          // Si la requête réseau réussit, on met à jour le cache
          if (response.status === 200) {
            const responseCopy = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseCopy);
            });
          }
          return response;
        })
        .catch(() => {
          // En cas de panne réseau ou de mode hors-ligne, on utilise le cache
          return caches.match(event.request);
        })
    );
  } else {
    // Stratégie Cache-First pour les images, polices, et librairies statiques
    event.respondWith(
      caches.match(event.request).then((cachedResponse) => {
        if (cachedResponse) {
          return cachedResponse;
        }
        
        return fetch(event.request).then((networkResponse) => {
          // Si on doit charger depuis le réseau, on l'ajoute au cache pour les fois suivantes
          if (networkResponse.status === 200) {
            const responseCopy = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseCopy);
            });
          }
          return networkResponse;
        });
      })
    );
  }
});
