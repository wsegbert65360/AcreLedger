import "@fontsource/inter/latin-400.css";
import "@fontsource/inter/latin-500.css";
import "@fontsource/inter/latin-600.css";
import "@fontsource/inter/latin-700.css";
import "@fontsource/inter/latin-800.css";
import "@fontsource/inter/latin-900.css";
import "@fontsource/jetbrains-mono/latin-400.css";
import "@fontsource/jetbrains-mono/latin-500.css";
import "@fontsource/jetbrains-mono/latin-600.css";
import "@fontsource/jetbrains-mono/latin-700.css";

import { createRoot } from "react-dom/client";

import "leaflet/dist/leaflet.css";

import App from "./App.tsx";
import "./index.css";

import ErrorBoundary from "./components/ErrorBoundary.tsx";
import { installGlobalErrorHandlers } from "./utils/errorReporting.ts";
import { createReloadOnce } from "./lib/swReload.ts";
import { registerSW } from 'virtual:pwa-register';

installGlobalErrorHandlers();

if (import.meta.env.DEV) {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker
      .getRegistrations()
      .then((registrations) => {
        registrations.forEach((registration) => void registration.unregister());
      })
      .catch((error) => {
        console.warn('Unable to clear local service workers:', error);
      });
  }

  if ('caches' in window) {
    caches
      .keys()
      .then((cacheNames) => Promise.all(cacheNames.map((cacheName) => caches.delete(cacheName))))
      .catch((error) => {
        console.warn('Unable to clear local caches:', error);
      });
  }
} else {
  const reloadOnce = createReloadOnce();

  window.addEventListener('vite:preloadError', (event) => {
    // Keep the active overlay mounted until the existing safe reload guard
    // allows navigation, rather than throwing the chunk error into the boundary.
    event.preventDefault();
    reloadOnce();
  });

  registerSW({
    onNeedReload: reloadOnce,
    onOfflineReady() {
      console.log('App ready for offline use');
    },
    onRegisteredSW(_swUrl, registration) {
      if (!registration) return;
      // iOS checks for service-worker updates only ~once per day on its own,
      // so poll ourselves whenever the app is foregrounded/focused, comes back
      // online, or every 30 minutes while visible.
      const checkForUpdate = () => {
        if (document.visibilityState === 'visible') {
          void registration.update().catch(() => {});
        }
      };
      document.addEventListener('visibilitychange', checkForUpdate);
      window.addEventListener('focus', checkForUpdate);
      // Route through checkForUpdate so a backgrounded tab regaining connectivity
      // doesn't trigger an update check (consistent with the other triggers).
      window.addEventListener('online', checkForUpdate);
      window.setInterval(checkForUpdate, 30 * 60 * 1000);
    },
  });

  // sw.js calls skipWaiting(), so a new worker activates immediately and may
  // never sit in the "waiting" state. Reload when control flips to the new
  // worker. onNeedReload covers the plugin's activated event; both paths use
  // the same guard.
  if ('serviceWorker' in navigator) {
    // Only an UPDATE flips the controller mid-session. On a first-ever visit
    // the new worker claims the previously-uncontrolled page via clients.claim(),
    // which also fires controllerchange — guard on the controller we started
    // with so we don't reload a brand-new user on first load.
    const hadControllerAtLoad = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!hadControllerAtLoad) return;
      reloadOnce();
    });
  }
}

createRoot(document.getElementById("root")!).render(
    <ErrorBoundary>
        <App />
    </ErrorBoundary>
);
