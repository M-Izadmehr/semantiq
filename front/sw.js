// sw.js - Simple aggressive caching for embeddings
const CACHE_PREFIX = 'semantiquest-embeddings';
const EMBEDDINGS_FILE = 'embeddings_quantized.json';
const CURRENT_VERSION = 'v1.0.0'; // ← Change this to invalidate cache

// Derived cache name
const CACHE_NAME = `${CACHE_PREFIX}-${CURRENT_VERSION}`;

// Install: Take control immediately
self.addEventListener('install', event => {
    console.log('SW: Installing...');
    event.waitUntil(self.skipWaiting());
});

// Activate: Clean up old caches and take control
self.addEventListener('activate', event => {
    console.log('SW: Activating...');

    event.waitUntil(
        Promise.all([
            cleanupOldCaches(),
            self.clients.claim()
        ])
    );
});

// Clean up old version caches
async function cleanupOldCaches() {
    const cacheNames = await caches.keys();
    const oldCaches = cacheNames.filter(name =>
        name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME
    );

    if (oldCaches.length > 0) {
        console.log('SW: Cleaning up old caches:', oldCaches);
        return Promise.all(oldCaches.map(name => caches.delete(name)));
    }
}

// Fetch: Cache-first for embeddings only
self.addEventListener('fetch', event => {
    const url = new URL(event.request.url);

    if (url.pathname.endsWith(EMBEDDINGS_FILE)) {
        event.respondWith(handleEmbeddingsRequest(event.request));
    }
});

// Handle embeddings requests with aggressive caching
async function handleEmbeddingsRequest(request) {
    try {
        const cache = await caches.open(CACHE_NAME);
        const cachedResponse = await cache.match(request);

        if (cachedResponse) {
            console.log(`SW: Serving embeddings from cache (${CURRENT_VERSION})`);
            return cachedResponse;
        }

        // Cache miss - fetch and cache
        console.log(`SW: Cache miss, fetching embeddings for ${CURRENT_VERSION}...`);
        const response = await fetch(request);

        if (response.ok) {
            await cache.put(request, response.clone());
            console.log(`SW: Embeddings cached for ${CURRENT_VERSION}`);
        }

        return response;

    } catch (error) {
        console.error('SW: Error handling embeddings request:', error);

        // Fallback: try to serve from any existing cache
        const cacheNames = await caches.keys();
        const embeddingsCaches = cacheNames.filter(name => name.startsWith(CACHE_PREFIX));

        for (const cacheName of embeddingsCaches) {
            const cache = await caches.open(cacheName);
            const cachedResponse = await cache.match(request);

            if (cachedResponse) {
                console.log('SW: Serving from fallback cache due to error');
                return cachedResponse;
            }
        }

        throw error;
    }
}

// Handle cache management messages
self.addEventListener('message', event => {
    const { action } = event.data || {};

    if (action === 'CLEAR_EMBEDDINGS_CACHE') {
        console.log('SW: Clearing embeddings cache...');

        event.waitUntil(
            clearAllEmbeddingsCaches()
                .then(() => {
                    console.log('SW: All embeddings caches cleared');
                    event.ports[0]?.postMessage({ success: true });
                })
                .catch(error => {
                    console.error('SW: Failed to clear caches:', error);
                    event.ports[0]?.postMessage({ success: false, error: error.message });
                })
        );
    }
});

// Clear all embedding caches
async function clearAllEmbeddingsCaches() {
    const cacheNames = await caches.keys();
    const embeddingsCaches = cacheNames.filter(name => name.startsWith(CACHE_PREFIX));

    return Promise.all(embeddingsCaches.map(name => caches.delete(name)));
}