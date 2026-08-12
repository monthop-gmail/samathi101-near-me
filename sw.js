const CACHE_NAME = 'willpower-cache-v3';

// ไฟล์หลักของแอป ถ้าโหลดไม่ได้ถือว่าติดตั้งไม่สำเร็จ
const CORE_ASSETS = [
    './',
    './index.html',
    './index.css',
    './app.js',
    './branches.json',
    './config.json',
    './manifest.json',
    './icons/icon-192.png',
    './icons/icon-512.png'
];

// ไฟล์จาก CDN ภายนอก แคชได้ก็ดี ล่มก็ต้องไม่ทำให้ Service Worker ติดตั้งพัง
const OPTIONAL_ASSETS = [
    'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
    'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
    'https://fonts.googleapis.com/css2?family=Anuphan:wght@300;400;500;600&family=Sarabun:wght@300;400;500;600&display=swap'
];

// Install Event: Cache assets and force update
self.addEventListener('install', (event) => {
    self.skipWaiting(); // Force new SW to take over immediately
    event.waitUntil(
        caches.open(CACHE_NAME).then(async (cache) => {
            await cache.addAll(CORE_ASSETS);
            // แคชทีละไฟล์ ไฟล์ไหนพังก็ข้ามไป ไม่ล้มทั้งชุดเหมือน addAll
            await Promise.all(OPTIONAL_ASSETS.map(url =>
                cache.add(url).catch(err => console.warn('ข้ามการแคช', url, err))
            ));
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
    if (event.request.method !== 'GET') return;

    event.respondWith(
        fetch(event.request)
            .then((response) => {
                // Update cache with the new network response
                if (response && response.status === 200 && response.type === 'basic') {
                    const responseToCache = response.clone();
                    // เก็บโดยตัด query string ออก ไม่งั้น cachebuster แบบ ?v=<timestamp>
                    // จะสร้าง entry ใหม่ทุกครั้งที่เปิดแอป จนแคชบวมไม่มีที่สิ้นสุด
                    const cacheKey = new URL(event.request.url);
                    cacheKey.search = '';
                    caches.open(CACHE_NAME).then((cache) => {
                        cache.put(cacheKey.href, responseToCache);
                    });
                }
                return response;
            })
            .catch(() => {
                // ออฟไลน์: ต้องใช้ ignoreSearch เพราะถ้า URL มี query string
                // จะไม่ตรงกับที่แคชไว้ตอน install เลยหาไม่เจอตลอด
                return caches.match(event.request, { ignoreSearch: true }).then(cached => {
                    if (cached) return cached;
                    // เปิดแอปตอนออฟไลน์แล้วไม่มีหน้าในแคช ให้ตกไปที่หน้าหลัก
                    if (event.request.mode === 'navigate') return caches.match('./index.html');
                    return Response.error();
                });
            })
    );
});
