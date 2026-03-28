const CACHE_NAME = 'willpower-cache-v1';
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

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(ASSETS);
        })
    );
});

self.addEventListener('fetch', (event) => {
    event.respondWith(
        caches.match(event.request).then((response) => {
            return response || fetch(event.request);
        })
    );
});
