import { describe, expect, it } from "vitest";
import { inventoryTenant } from "./inventory-tenant.js";

describe("inventory tenant", () => {
  it("refuses a non-TLS database URL before connecting", async () => {
    await expect(inventoryTenant({
      databaseUrl: "postgresql://postgres:secret@localhost:5432/postgres",
      farmId: "11111111-1111-4111-8111-111111111111",
    })).rejects.toThrow(/sslmode/);
  });
});
