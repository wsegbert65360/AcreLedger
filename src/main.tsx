import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

import { registerSW } from 'virtual:pwa-register';
import ErrorBoundary from "./components/ErrorBoundary.tsx";

// Handle PWA automatic updates
registerSW({
  onNeedRefresh() {
    console.log('New content available, refreshing...');
    window.location.reload();
  },
  onOfflineReady() {
    console.log('App ready for offline use');
  },
});

createRoot(document.getElementById("root")!).render(
    <ErrorBoundary>
        <App />
    </ErrorBoundary>
);
