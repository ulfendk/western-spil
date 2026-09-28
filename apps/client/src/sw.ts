/// <reference lib="webworker" />
import {
  cleanupOutdatedCaches,
  createHandlerBoundToURL,
  precacheAndRoute,
} from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';
import { CacheFirst, NetworkFirst } from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';
import { clientsClaim } from 'workbox-core';

declare const self: ServiceWorkerGlobalScope;

// Control the page on first install too, so later updates wait for a safe point.
clientsClaim();
cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);

// Offline SPA shell; never intercept API, matchmaking or narration routes.
registerRoute(
  new NavigationRoute(createHandlerBoundToURL('/index.html'), {
    denylist: [/^\/api\//, /^\/matchmake\//, /^\/narration\//],
  }),
);

// Narration audio is content-hashed, so it's safe to cache forever.
registerRoute(
  ({ url }) => url.pathname.startsWith('/narration/') && url.pathname.endsWith('.mp3'),
  new CacheFirst({ cacheName: 'narration', plugins: [new ExpirationPlugin({ maxEntries: 1000 })] }),
);
registerRoute(
  ({ url }) => url.pathname === '/narration/manifest.json',
  new NetworkFirst({ cacheName: 'narration-manifest', networkTimeoutSeconds: 3 }),
);
registerRoute(
  ({ url }) => url.pathname === '/api/tts',
  new CacheFirst({ cacheName: 'tts', plugins: [new ExpirationPlugin({ maxEntries: 300 })] }),
);

// The page decides when it's safe to switch versions (see src/pwa/updater.ts).
self.addEventListener('message', (event) => {
  if ((event.data as { type?: string } | null)?.type === 'SKIP_WAITING') void self.skipWaiting();
});
