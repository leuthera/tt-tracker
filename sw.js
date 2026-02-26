'use strict';

const CACHE_NAME = 'tt-tracker-v5';
const APP_SHELL = [
  '/',
  '/manifest.json',
  '/icon.svg',
  '/css/styles.css',
  '/js/app.js',
  '/js/i18n.js',
  '/js/state.js',
  '/js/helpers.js',
  '/js/stats.js',
  '/js/ui.js',
  '/js/export.js',
  '/js/render.js',
  '/js/users.js'
];

// ─── IndexedDB Queue Helpers ────────────────────────────────────────────────

const DB_NAME = 'tt-offline-queue';
const STORE_NAME = 'queue';

function openQueueDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function addToQueue(entry) {
  const db = await openQueueDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(entry);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function getAllQueued() {
  const db = await openQueueDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function removeFromQueue(id) {
  const db = await openQueueDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// ─── Notify Client ──────────────────────────────────────────────────────────

async function notifyClients(message) {
  const clients = await self.clients.matchAll({ type: 'window' });
  for (const client of clients) {
    client.postMessage(message);
  }
}

// ─── Handle Mutating Requests (POST/PUT/DELETE) While Offline ───────────────

async function handleMutatingRequest(request) {
  try {
    const response = await fetch(request.clone());
    return response;
  } catch (err) {
    // Network failed — queue for later sync
    const body = await request.clone().text();
    const entry = {
      id: 'q_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
      url: request.url,
      method: request.method,
      headers: Object.fromEntries(request.headers.entries()),
      body: body,
      timestamp: Date.now()
    };

    await addToQueue(entry);
    await notifyClients({ type: 'QUEUED_OFFLINE', entry });

    // Return a synthetic success response so the app can continue
    const syntheticData = { _offline: true, _queueId: entry.id };
    return new Response(JSON.stringify(syntheticData), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

// ─── Sync Queue ─────────────────────────────────────────────────────────────

async function syncQueue() {
  const entries = await getAllQueued();
  const results = { synced: 0, failed: 0, errors: [] };

  for (const entry of entries) {
    try {
      const response = await fetch(entry.url, {
        method: entry.method,
        headers: entry.headers,
        body: entry.body || undefined
      });
      if (response.ok) {
        await removeFromQueue(entry.id);
        results.synced++;
      } else {
        const data = await response.json().catch(() => ({}));
        results.failed++;
        results.errors.push({ id: entry.id, status: response.status, error: data.error || 'Request failed' });
        // Remove from queue on client errors (4xx) — retrying won't help
        if (response.status >= 400 && response.status < 500) {
          await removeFromQueue(entry.id);
        }
      }
    } catch (err) {
      // Still offline — keep in queue
      results.failed++;
      results.errors.push({ id: entry.id, error: 'Network error' });
    }
  }

  await notifyClients({ type: 'SYNC_COMPLETE', results });
}

// ─── Install ────────────────────────────────────────────────────────────────

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

// ─── Activate — clean up old caches ─────────────────────────────────────────

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

// ─── Fetch Handler ──────────────────────────────────────────────────────────

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Mutating API calls (POST/PUT/DELETE) — handle offline queueing
  if (url.pathname.startsWith('/api/') && request.method !== 'GET') {
    event.respondWith(handleMutatingRequest(request));
    return;
  }

  // GET API calls — network-first with cache fallback
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          return response;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  // Static assets — cache-first (ignoreSearch so ?v=hash cache-busters match)
  event.respondWith(
    caches.match(request, { ignoreSearch: true }).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        const clone = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        return response;
      });
    })
  );
});

// ─── Message Handler ────────────────────────────────────────────────────────

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SYNC_QUEUE') {
    event.waitUntil(syncQueue());
  }
});
