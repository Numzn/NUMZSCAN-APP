const CACHE_NAME = 'offline-qr-v2';

// Get the base path from the service worker location
let basePath = self.location.pathname.replace('/service-worker.js', '');
if (!basePath || basePath === '/') {
  basePath = '';
}

// Normalize paths - remove trailing slashes and ensure single slashes
function normalizePath(path) {
  return (basePath + '/' + path).replace(/\/+/g, '/');
}

const ASSETS = [
  normalizePath('index.html'),
  normalizePath('style.css'),
  normalizePath('script.js'),
  normalizePath('manifest.json'),
  normalizePath('icon-192.png'),
  normalizePath('icon-512.png'),
  normalizePath('qrcode.min.js'),
  normalizePath('html5-qrcode.min.js')
];

// Install event - cache assets
self.addEventListener('install', (evt) => {
  console.log('[SW] Installing service worker...');
  evt.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('[SW] Caching assets');
        return cache.addAll(ASSETS.map(url => new Request(url, { cache: 'reload' })));
      })
      .then(() => {
        console.log('[SW] Assets cached');
        return self.skipWaiting();
      })
      .catch(err => {
        console.error('[SW] Cache addAll failed:', err);
        // Continue even if some assets fail
        return self.skipWaiting();
      })
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', (evt) => {
  console.log('[SW] Activating service worker...');
  evt.waitUntil(
    caches.keys()
      .then(keys => {
        return Promise.all(
          keys.map(key => {
            if (key !== CACHE_NAME) {
              console.log('[SW] Deleting old cache:', key);
              return caches.delete(key);
            }
          })
        );
      })
      .then(() => {
        console.log('[SW] Service worker activated');
        return self.clients.claim();
      })
  );
});

// Fetch event - serve from cache, fallback to network
self.addEventListener('fetch', (evt) => {
  // Skip non-GET requests
  if (evt.request.method !== 'GET') return;
  
  // Skip chrome-extension and other protocols
  if (!evt.request.url.startsWith('http')) return;
  
  evt.respondWith(
    caches.match(evt.request)
      .then(cached => {
        // Return cached version if available
        if (cached) {
          return cached;
        }
        
        // Try network
        return fetch(evt.request)
          .then(response => {
            // Don't cache non-successful responses
            if (!response || response.status !== 200 || response.type !== 'basic') {
              return response;
            }
            
            // Clone the response
            const responseToCache = response.clone();
            
            // Cache successful responses
            caches.open(CACHE_NAME)
              .then(cache => {
                cache.put(evt.request, responseToCache);
              });
            
            return response;
          })
          .catch(() => {
            // Network failed - if navigation, return index.html
            if (evt.request.mode === 'navigate') {
              return caches.match(normalizePath('index.html')) || caches.match('./index.html') || caches.match('/index.html');
            }
            // Otherwise return a basic error response
            return new Response('Offline', { status: 503, statusText: 'Service Unavailable' });
          });
      })
  );
});
