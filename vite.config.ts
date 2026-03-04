import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { VitePWA } from 'vite-plugin-pwa';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [
    react(),
    mode === "development" && componentTagger(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'robots.txt', 'apple-touch-icon.png', 'favicon-32.png', 'favicon-16.png'],
      manifest: {
        name: 'AcreLedger',
        short_name: 'AcreLedger',
        description: 'Precision Agriculture Manager',
        theme_color: '#22c55e',
        background_color: '#000000',
        display: 'standalone',
        icons: [
          {
            src: 'icon-48.png',
            sizes: '48x48',
            type: 'image/png'
          },
          {
            src: 'icon-72.png',
            sizes: '72x72',
            type: 'image/png'
          },
          {
            src: 'icon-96.png',
            sizes: '96x96',
            type: 'image/png'
          },
          {
            src: 'icon-128.png',
            sizes: '128x128',
            type: 'image/png'
          },
          {
            src: 'icon-144.png',
            sizes: '144x144',
            type: 'image/png'
          },
          {
            src: 'icon-152.png',
            sizes: '152x152',
            type: 'image/png'
          },
          {
            src: 'icon-180.png',
            sizes: '180x180',
            type: 'image/png'
          },
          {
            src: 'icon-192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'icon-256.png',
            sizes: '256x256',
            type: 'image/png'
          },
          {
            src: 'icon-384.png',
            sizes: '384x384',
            type: 'image/png'
          },
          {
            src: 'icon-512.png',
            sizes: '512x512',
            type: 'image/png'
          },
          {
            src: 'icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable'
          }
        ]
      }
    })
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
