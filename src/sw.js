/*
  AcreLedger Precision Ag — Service Worker
  Version: 3.5.0
*/

import { cleanupOutdatedCaches } from 'workbox-precaching';

import { installRoutes } from './lib/swNavigation';

// Force the new service worker to take over immediately
self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(clients.claim());
});

// Navigation handler first, then the precache. No runtime HTML cache:
// offline navigations use the current precached /index.html only.
installRoutes(self.__WB_MANIFEST);
cleanupOutdatedCaches();
