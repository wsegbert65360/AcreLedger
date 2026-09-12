import { describe, expect, it } from "vitest";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { ISOLATED_PROJECT_GUARDS, ISOLATED_RESTORE_ORDER, RECOVERY_SIDE_EFFECT_DISABLE_SQL, REQUIRED_RESTORE_FILES, restoreIsolated } from "./restore-isolated.js";
import type { CommandRunner } from "../../infrastructure/owner-backup/src/types.js";

describe("isolated restore", () => {
  it("uses the documented restore order and refuses a non-TLS URL", async () => {
    expect(ISOLATED_RESTORE_ORDER[0]).toBe("roles.sql");
    expect(ISOLATED_RESTORE_ORDER).toContain("auth-data.sql");
    expect(ISOLATED_PROJECT_GUARDS.some((line) => line.includes("production"))).toBe(true);
    await expect(
      restoreIsolated({
        databaseUrl: "postgresql://postgres:secret@localhost:5432/postgres",
        plaintextDir: "/tmp/x",
      }),
    ).rejects.toThrow(/sslmode/);
  });

  it("invokes psql with replica mode before data files", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "acreledger-restore-"));
    await fs.mkdir(path.join(root, "database"));
    for (const name of ISOLATED_RESTORE_ORDER) await fs.writeFile(path.join(root, "database", name), "-- test\n");
    const runner: CommandRunner = {
      async run(_command, args) {
        expect(args).toContain("SET session_replication_role = replica");
        for (const name of ISOLATED_RESTORE_ORDER) expect(args.some((item) => item.endsWith(name))).toBe(true);
        expect(args).toContain(RECOVERY_SIDE_EFFECT_DISABLE_SQL);
        expect(RECOVERY_SIDE_EFFECT_DISABLE_SQL).toContain("cron.unschedule");
        expect(RECOVERY_SIDE_EFFECT_DISABLE_SQL).toContain("DISABLE TRIGGER");
        expect(RECOVERY_SIDE_EFFECT_DISABLE_SQL).toContain("ALTER PUBLICATION supabase_realtime DROP TABLE");
        expect(args.findIndex((item) => item.endsWith("migrations-schema.sql"))).toBeLessThan(args.indexOf(RECOVERY_SIDE_EFFECT_DISABLE_SQL));
        expect(args.findIndex((item) => item.endsWith("data.sql"))).toBeGreaterThan(args.indexOf(RECOVERY_SIDE_EFFECT_DISABLE_SQL));
        return { stdout: "", stderr: "", code: 0 };
      },
    };
    await restoreIsolated({
      databaseUrl: "postgresql://postgres:secret@localhost:5432/postgres?sslmode=require",
      plaintextDir: root,
      runner,
    });
  });

  it("fails when a required dump is absent but skips optional dumps", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "acreledger-restore-required-"));
    await fs.mkdir(path.join(root, "database"));
    for (const name of REQUIRED_RESTORE_FILES) {
      if (name !== "auth-data.sql") await fs.writeFile(path.join(root, "database", name), "-- test\n");
    }
    await expect(restoreIsolated({
      databaseUrl: "postgresql://postgres:secret@localhost:5432/postgres?sslmode=require",
      plaintextDir: root,
    })).rejects.toThrow(/auth-data\.sql/);
  });
});
