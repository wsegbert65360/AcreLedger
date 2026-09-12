import { describe, expect, it } from "vitest";
import {
  assertFarmScopedWrite,
  extractSql,
  TENANT_REGISTRY,
  tenantBundleTables,
} from "./tenant-registry.js";

const KNOWN_FARM_OWNED = [
  "public.farms",
  "public.profiles",
  "public.fields",
  "public.bins",
  "public.plant_records",
  "public.spray_records",
  "public.custom_spray_records",
  "public.harvest_records",
  "public.hay_harvest_records",
  "public.fertilizer_applications",
  "public.tillage_records",
  "public.grain_movements",
  "public.saved_seeds",
  "public.fertilizer_recipes",
  "public.spray_recipes",
  "public.fsa_tract_imports",
  "public.field_clu_assignments",
  "public.work_requests",
  "public.farm_subscriptions",
  "public.farm_rainfall_daily",
  "public.field_rainfall_hourly",
  "public.field_rainfall_coverage",
  "public.account_deletion_requests",
  "ai_assistant_private.rate_limits",
  "ai_assistant_private.turns",
  "weather_proxy_private.rate_limits",
];

describe("tenant registry", () => {
  it("covers every current farm-owned and operational table", () => {
    const keys = new Set(TENANT_REGISTRY.map((entry) => `${entry.schema}.${entry.table}`));
    for (const key of KNOWN_FARM_OWNED) {
      expect(keys.has(key), `${key} missing from registry`).toBe(true);
    }
    expect(keys.has("public.billing_webhook_events")).toBe(true);
    const billing = TENANT_REGISTRY.find((entry) => entry.table === "billing_webhook_events");
    expect(billing?.ownership).toBe("global");
    expect(billing?.includeInTenantBundle).toBe(false);
  });

  it("extract SQL is always farm or user scoped", () => {
    for (const entry of tenantBundleTables()) {
      const spec = extractSql(entry);
      expect(spec.sql.toLowerCase()).toMatch(/where/);
      expect(spec.sql).toMatch(/\$1/);
    }
  });

  it("requires both farm and user ownership when a table has both columns", () => {
    const profiles = TENANT_REGISTRY.find((entry) => entry.schema === "public" && entry.table === "profiles");
    expect(profiles).toBeDefined();
    expect(extractSql(profiles!).sql).toContain(" AND ");
    expect(extractSql(profiles!).sql).not.toContain(" OR ");
  });

  it("refuses unscoped writes and hard deletes", () => {
    expect(() => assertFarmScopedWrite("DELETE FROM public.fields")).toThrow(/Hard DELETE/);
    expect(() => assertFarmScopedWrite("UPDATE public.fields SET name = 'x'")).toThrow(/unscoped/);
    expect(() =>
      assertFarmScopedWrite("UPDATE public.fields SET deleted_at = now() WHERE farm_id = $1"),
    ).not.toThrow();
  });
});
