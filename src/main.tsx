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
  // Handle PWA automatic updates in production builds.
  registerSW({
    onNeedRefresh() {
      console.log('New content available, refreshing...');
      window.location.reload();
    },
    onOfflineReady() {
      console.log('App ready for offline use');
    },
  });
}

createRoot(document.getElementById("root")!).render(
    <ErrorBoundary>
        <App />
    </ErrorBoundary>
);
