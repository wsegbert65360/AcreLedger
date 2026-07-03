import { createRoot } from "react-dom/client";

import "leaflet/dist/leaflet.css";

import App from "./App.tsx";
import "./index.css";

import ErrorBoundary from "./components/ErrorBoundary.tsx";
import { registerSW } from 'virtual:pwa-register';

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
  let reloading = false;
  let deferred = false;
  // Upper bound on how long a pending update waits for open dialogs/forms.
  // After this many deferrals the update is force-applied even if an overlay is
  // still open — better to lose a long-idle draft than to never update a stuck
  // tab. At 30 s per deferral this is ~5 minutes.
  let deferCount = 0;
  const MAX_DEFERS = 10;
  const reloadOnce = () => {
    if (reloading || deferred) return;
    // Don't reload while the user is mid-entry in a modal/drawer/sheet — a
    // silent reload would lose unsaved work. Radix overlays expose
    // [data-state="open"] while mounted; retry shortly after they close so the
    // pending update still applies. Once we've hit the defer cap, stop waiting
    // so a long-lived overlay can't block the update indefinitely.
    const overlayOpen = !!document.querySelector('[data-state="open"], [role="dialog"], [role="alertdialog"]');
    if (overlayOpen && deferCount < MAX_DEFERS) {
      deferred = true;
      deferCount += 1;
      window.setTimeout(() => {
        deferred = false;
        reloadOnce();
      }, 30_000);
      return;
    }
    reloading = true;
    window.location.reload();
  };

  registerSW({
    onNeedRefresh() {
      // A new service worker is waiting to activate — reload to apply it.
      reloadOnce();
    },
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
  // never reach the "waiting" state onNeedRefresh watches for. Reload when
  // control actually flips to the new worker instead.
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
