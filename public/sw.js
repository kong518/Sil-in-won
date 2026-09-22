const CACHE_NAME = 'suwon-rehab-waitinglist-v2';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/manifest.json',
  '/app-icon.png',
  '/icon_candidate_1_1788831922776.jpg',
  '/icon_candidate_2_1788831936494.jpg',
  '/icon_candidate_3_1788831949258.jpg',
  '/icon_candidate_4_1788831961001.jpg'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
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

self.addEventListener('fetch', (event) => {
  // Only handle GET requests and exclude database network calls
  if (
    event.request.method !== 'GET' || 
    event.request.url.includes('firestore.googleapis.com') || 
    event.request.url.includes('identitytoolkit.googleapis.com') ||
    event.request.url.includes('apis.google.com') ||
    event.request.url.includes('accounts.google.com')
  ) {
    return;
  }
  
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        // Fetch fresh copy in background and update cache
        fetch(event.request).then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, networkResponse));
          }
        }).catch(() => {/* Ignore network failures in background */});
        
        return cachedResponse;
      }
      
      return fetch(event.request).catch(() => {
        if (event.request.mode === 'navigate') {
          return caches.match('/');
        }
      });
    })
  );
});
