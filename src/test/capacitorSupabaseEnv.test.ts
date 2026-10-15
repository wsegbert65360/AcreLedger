import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { capacitorSupabaseEnvError } from "../../scripts/ci/capacitorSupabaseEnv";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

describe("capacitor Supabase env guard", () => {
  it("accepts a valid https URL and a non-empty anon key", () => {
    expect(
      capacitorSupabaseEnvError({
        VITE_SUPABASE_URL: "https://rtzqswpmhlbrbxjwyywl.supabase.co",
        VITE_SUPABASE_ANON_KEY: "dummy",
      }),
    ).toBeNull();
  });

  it("accepts one layer of surrounding quotes", () => {
    expect(
      capacitorSupabaseEnvError({
        VITE_SUPABASE_URL: '"https://example.supabase.co"',
        VITE_SUPABASE_ANON_KEY: "'publishable-key'",
      }),
    ).toBeNull();
  });

  it.each([
    ["", "key"],
    ["http://example.supabase.co", "key"],
    ["not a url", "key"],
    ["https://example.supabase.co", ""],
    ["https://example.supabase.co", "   "],
    ["https://example.supabase.co", '""'],
  ])("rejects url=%j key=%j", (url, key) => {
    expect(
      capacitorSupabaseEnvError({
        VITE_SUPABASE_URL: url,
        VITE_SUPABASE_ANON_KEY: key,
      }),
    ).toMatch(/valid https URL/);
  });

  it("gates the placeholder host on compile-time mode so Capacitor builds can drop it", () => {
    const source = readFileSync(resolve(root, "src/lib/supabase.ts"), "utf8");
    expect(source).toMatch(
      /import\.meta\.env\.MODE === 'capacitor' \? '' : 'https:\/\/placeholder-url\.supabase\.co'/,
    );
  });

  it("fails a capacitor Vite build from vite.config.ts when the guard returns an error", () => {
    const config = readFileSync(resolve(root, "vite.config.ts"), "utf8");
    expect(config).toContain('mode === "capacitor"');
    expect(config).toContain("capacitorSupabaseEnvError");
    expect(config).toContain("loadEnv");
    expect(config).toMatch(/throw new Error\(supabaseEnvError\)/);
  });
});
