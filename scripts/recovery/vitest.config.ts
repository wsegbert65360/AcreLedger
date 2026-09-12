import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["*.test.ts", "lib/*.test.ts"],
    exclude: ["**/*.integration.test.ts"],
  },
});
