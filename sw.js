const CACHE_NAME = 'pinjamalat-v34';
const ASSETS = [
    './',
    './index.html',
    './style-v3.css?v=34',
    './app-v3.js?v=34',
    './db.js?v=34',
    './manifest.json',
    'https://unpkg.com/@phosphor-icons/web',
    'https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap',
    'https://unpkg.com/localforage@1.10.0/dist/localforage.min.js',
    'https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js',
    'https://cdn.jsdelivr.net/npm/jsbarcode@3.11.6/dist/JsBarcode.all.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js',
    'https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js'
];

self.addEventListener('install', (e) => {
    self.skipWaiting();
    e.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(ASSETS);
        })
    );
});

self.addEventListener('activate', (e) => {
    e.waitUntil(clients.claim());
    e.waitUntil(
        caches.keys().then((keyList) => {
            return Promise.all(
                keyList.map((key) => {
                    if (key !== CACHE_NAME) {
                        return caches.delete(key);
                    }
                })
            );
        })
    );
});

self.addEventListener('fetch', (e) => {
    // Only intercept basic GET requests
    if (e.request.method !== 'GET') return;
    
    // Only cache valid http/https URLs (skip chrome-extension, file:, data:, etc)
    if (!e.request.url.startsWith('http://') && !e.request.url.startsWith('https://')) return;
    
    // Ignore external APIs that we handle via db sync logic
    if (e.request.url.includes('script.google.com') || e.request.url.includes('docs.google.com')) return;

    e.respondWith(
        caches.match(e.request).then((response) => {
            // Priority: Network first, fallback to Cache
            return fetch(e.request).then((fetchResponse) => {
                return caches.open(CACHE_NAME).then((cache) => {
                    cache.put(e.request, fetchResponse.clone());
                    return fetchResponse;
                });
            }).catch(() => {
                return response;
            });
        })
    );
});
