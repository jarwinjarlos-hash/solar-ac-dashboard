const CACHE_NAME = 'solar-dcs-cache-v1';
const ASSETS = [
    'index.html',
    'app.js',
    'manifest.json',
    'https://cdn-icons-png.flaticon.com/512/3222/3222672.png'
];

// Install Service Worker and Cache Assets
self.addEventListener('install', (e) => {
    e.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(ASSETS);
        }).then(() => self.skipWaiting())
    );
});

// Activate Worker and Clear Old Caches
self.addEventListener('activate', (e) => {
    e.waitUntil(
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

// Network First, Falling Back to Cache Strategy
self.addEventListener('fetch', (e) => {
    e.respondWith(
        fetch(e.request)
            .then((response) => {
                // If valid network response, clone it into cache
                if (response && response.status === 200) {
                    const responseClone = response.clone();
                    caches.open(CACHE_NAME).then((cache) => {
                        cache.put(e.request, responseClone);
                    });
                }
                return response;
            })
            .catch(() => {
                // If network fails (offline), pull from cache
                return caches.match(e.request);
            })
    );
});
