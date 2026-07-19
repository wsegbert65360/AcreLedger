import { defineConfig } from "vite";
import { configDefaults } from "vitest/config";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { VitePWA } from 'vite-plugin-pwa';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  base: mode === "capacitor" ? "./" : "/",
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
    mode === "capacitor" && {
      name: "capacitor-local-assets",
      transformIndexHtml(html: string) {
        return html.replace(/\s+crossorigin(?=[\s>])/g, "");
      },
    },
    VitePWA({
      disable: mode === "capacitor",
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.js',
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'robots.txt', 'apple-touch-icon.png', 'favicon-32.png', 'favicon-16.png'],
      injectManifest: {
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
      },
      manifest: {
        name: 'AcreLedger',
        short_name: 'AcreLedger',
        description: 'Precision Agriculture Manager',
        theme_color: '#22c55e',
        background_color: '#000000',
        display: 'standalone',
        icons: [
          {
            src: 'icon-48.png?v=2.1.2',
            sizes: '48x48',
            type: 'image/png'
          },
          {
            src: 'icon-72.png?v=2.1.2',
            sizes: '72x72',
            type: 'image/png'
          },
          {
            src: 'icon-96.png?v=2.1.2',
            sizes: '96x96',
            type: 'image/png'
          },
          {
            src: 'icon-128.png?v=2.1.2',
            sizes: '128x128',
            type: 'image/png'
          },
          {
            src: 'icon-144.png?v=2.1.2',
            sizes: '144x144',
            type: 'image/png'
          },
          {
            src: 'icon-152.png?v=2.1.2',
            sizes: '152x152',
            type: 'image/png'
          },
          {
            src: 'icon-180.png?v=2.1.2',
            sizes: '180x180',
            type: 'image/png'
          },
          {
            src: 'icon-192.png?v=2.1.2',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'icon-256.png?v=2.1.2',
            sizes: '256x256',
            type: 'image/png'
          },
          {
            src: 'icon-384.png?v=2.1.2',
            sizes: '384x384',
            type: 'image/png'
          },
          {
            src: 'icon-512.png?v=2.1.2',
            sizes: '512x512',
            type: 'image/png'
          },
          {
            src: 'icon-512.png?v=2.1.2',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable'
          }
        ]
      }
    }),
    {
      name: "csp-strip-unsafe-script",
      transformIndexHtml(html: string) {
        if (mode === "development") return html;
        return html.replace(/script-src [^;]+;/, match => 
          match.replace(/'unsafe-inline'/g, "").replace(/'unsafe-eval'/g, "")
        );
      },
    }
  ].filter(Boolean),
  build: {
    target: mode === "capacitor" ? ["es2020", "safari15"] : undefined,
    cssTarget: mode === "capacitor" ? "safari15" : undefined,
    chunkSizeWarningLimit: 1000,
    sourcemap: false,
  },
  optimizeDeps: {
    entries: ["index.html"],
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    // Unit suite only: keep Vitest's default exclusions (node_modules, dist,
    // etc.) and additionally exclude integration tests, which require live
    // credentials/network and are run via `npm run test:integration`.
    exclude: [
      ...configDefaults.exclude,
      "**/*.integration.test.{ts,tsx}",
    ],
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "json-summary"],
      reportsDirectory: "./coverage",
      // Count untouched production files as 0% rather than omitting them, so
      // coverage reflects the whole production surface (not just what tests
      // imported). The `include` below is the authoritative scope.
      all: true,
      // Narrow, documented scope of PRODUCTION sources only. Tests, generated
      // data, type declarations, and entry-point boilerplate are excluded so
      // the score cannot be inflated by excluding inconvenient production files.
      include: [
        "src/components/**/*.{ts,tsx}",
        "src/context/**/*.{ts,tsx}",
        "src/hooks/**/*.{ts,tsx}",
        "src/lib/**/*.{ts,tsx}",
        "src/pages/**/*.{ts,tsx}",
        "src/services/**/*.{ts,tsx}",
        "src/store/**/*.{ts,tsx}",
        "src/utils/**/*.{ts,tsx}",
      ],
      exclude: [
        // Test files and test scaffolding are never production coverage targets.
        "src/**/__tests__/**",
        "src/**/*.test.{ts,tsx}",
        "src/**/*.integration.test.{ts,tsx}",
        "src/test/**",
        // Type declarations carry no executable logic.
        "src/**/*.d.ts",
        "src/types/**",
        // Generated/bundled FSA tract data is not authored logic.
        "src/data/**",
        // PWA entry-point boilerplate (service worker registration, root mount).
        "src/main.tsx",
        "src/sw.ts",
        // shadcn/ui primitives are vendored, not app logic.
        "src/components/ui/**",
      ],
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
