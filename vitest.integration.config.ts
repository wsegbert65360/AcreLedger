import { defineConfig } from "vitest/config";
import { configDefaults } from "vitest/config";
import { loadEnv } from "vite";
import path from "path";

// Integration suite: only files named `*.integration.test.*`, which require
// live credentials/network (e.g. bot auth, real Rain API). Run via
// `npm run test:integration`. Shares the main aliases and jsdom setup.
//
// Vite exposes only VITE_* values to import.meta.env. Load the non-public bot
// credentials explicitly for this Node-only integration-test process without
// making them browser-visible application variables.
const testEnv = loadEnv("test", __dirname, "");
for (const key of ["TEST_BOT_EMAIL", "TEST_BOT_PASSWORD"] as const) {
  if (!process.env[key] && testEnv[key]) process.env[key] = testEnv[key];
}

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    // Only run integration tests; keep Vitest's other default exclusions
    // (node_modules, dist, etc.) so stray files don't sneak in.
    include: [
      "**/*.integration.test.{ts,tsx}",
    ],
    exclude: [
      ...configDefaults.exclude,
    ],
  },
});
