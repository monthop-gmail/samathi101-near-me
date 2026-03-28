const CACHE_NAME = 'willpower-cache-v2';
const ASSETS = [
    './',
    './index.html',
    './index.css',
    './app.js',
    './branches.json',
    './icons/icon-192.png',
    './icons/icon-512.png',
    'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
    'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
    'https://fonts.googleapis.com/css2?family=Anuphan:wght@300;400;500;600&family=Sarabun:wght@300;400;500;600&display=swap'
];

// Install Event: Cache assets and force update
self.addEventListener('install', (event) => {
    self.skipWaiting(); // Force new SW to take over immediately
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(ASSETS);
        })
    );
});

// Activate Event: Clean up old caches
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheName !== CACHE_NAME) {
                        return caches.delete(cacheName);
                    }
                })
            );
        }).then(() => self.clients.claim()) // Claim clients immediately
    );
});

// Fetch Event: Network First, fallback to cache
self.addEventListener('fetch', (event) => {
    event.respondWith(
        fetch(event.request)
            .then((response) => {
                // Update cache with the new network response
                if (response && response.status === 200 && response.type === 'basic') {
                    const responseToCache = response.clone();
                    caches.open(CACHE_NAME).then((cache) => {
                        cache.put(event.request, responseToCache);
                    });
                }
                return response;
            })
            .catch(() => {
                // If network fails (offline), load from cache
                return caches.match(event.request);
            })
    );
});
