import { describe, expect, it } from "vitest";
import type { Client } from "pg";
import { tenantBundleChecksum, type TenantBundle } from "./extract-tenant.js";
import { attachInvitedProfile, remapBundleUser } from "./recreate-auth-user.js";

const FARM = "11111111-1111-4111-8111-111111111111";
const OLD = "22222222-2222-4222-8222-222222222222";
const NEW = "33333333-3333-4333-8333-333333333333";

function bundle(): TenantBundle {
  const value: TenantBundle = {
    bundleVersion: 1,
    sourceBackupId: "backup",
    sourceRecoveredAt: "2026-09-11T00:00:00Z",
    farmId: FARM,
    profileIds: [OLD],
    tables: {
      "public.profiles": [{ id: OLD, farm_id: FARM, display_name: "Owner" }],
      "ai_assistant_private.turns": [{ id: "44444444-4444-4444-8444-444444444444", user_id: OLD, farm_id: FARM }],
      "public.fields": [{ id: "55555555-5555-4555-8555-555555555555", farm_id: FARM, notes: OLD }],
    },
    counts: {},
    storage: { included: [], manualReview: [] },
    checksums: {},
  };
  value.checksums["bundle.json"] = tenantBundleChecksum(value);
  return value;
}

describe("deleted Auth user recovery", () => {
  it("remaps only registered user columns and re-signs the bundle", () => {
    const result = remapBundleUser(bundle(), OLD, NEW);
    expect(result.profileIds).toEqual([NEW]);
    expect((result.tables["public.profiles"][0] as { id: string }).id).toBe(NEW);
    expect((result.tables["ai_assistant_private.turns"][0] as { user_id: string }).user_id).toBe(NEW);
    expect((result.tables["public.fields"][0] as { notes: string }).notes).toBe(OLD);
    expect(result.checksums["bundle.json"]).toBe(tenantBundleChecksum(result));
  });

  it("atomically remounts a surviving profile onto the invited Auth ID", async () => {
    const statements: string[] = [];
    const client = {
      async query(sql: string) {
        statements.push(sql);
        if (sql.includes("WHERE id = $1 FOR UPDATE") && statements.filter((item) => item.includes("WHERE id = $1 FOR UPDATE")).length === 1) {
          return { rowCount: 1, rows: [{ farm_id: FARM }] };
        }
        if (sql.includes("WHERE id = $1 FOR UPDATE")) return { rowCount: 1, rows: [{ farm_id: FARM }] };
        if (sql.startsWith("DELETE FROM public.profiles")) return { rowCount: 1, rows: [] };
        if (sql.startsWith("UPDATE public.profiles SET id")) return { rowCount: 1, rows: [] };
        return { rowCount: null, rows: [] };
      },
    } as unknown as Client;

    await attachInvitedProfile(client, OLD, NEW, FARM);

    const removeGenerated = statements.findIndex((sql) => sql.startsWith("DELETE FROM public.profiles"));
    const remountSurvivor = statements.findIndex((sql) => sql.startsWith("UPDATE public.profiles SET id"));
    expect(removeGenerated).toBeGreaterThan(-1);
    expect(remountSurvivor).toBeGreaterThan(removeGenerated);
    expect(statements.at(-1)).toBe("COMMIT");
  });
});
