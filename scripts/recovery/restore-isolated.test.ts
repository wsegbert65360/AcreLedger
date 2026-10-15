import { describe, expect, it } from "vitest";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  ISOLATED_PROJECT_GUARDS,
  ISOLATED_RESTORE_ORDER,
  PRODUCTION_SUPABASE_REF,
  RECOVERY_SIDE_EFFECT_DISABLE_SQL,
  REQUIRED_RESTORE_FILES,
  compareRestoredTableCounts,
  restoreIsolated,
} from "./restore-isolated.js";
import type { CommandRunner } from "../../infrastructure/owner-backup/src/types.js";

const ISOLATED_REF = "abcdefghijklmnopqrab";
const TLS_URL = "postgresql://postgres:secret@localhost:5432/postgres?sslmode=require";

async function writePlaintext(tableCounts: Record<string, number | "unreadable"> = { "public.farms": 1 }): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "acreledger-restore-"));
  await fs.mkdir(path.join(root, "database"));
  for (const name of ISOLATED_RESTORE_ORDER) await fs.writeFile(path.join(root, "database", name), "-- test\n");
  await fs.writeFile(path.join(root, "manifest.json"), `${JSON.stringify({
    manifestId: "test",
    tableCounts,
    artifacts: [],
  })}\n`);
  return root;
}

function matchingReader(tableCounts: Record<string, number>): {
  count: (schema: string, table: string) => Promise<number>;
  calls: string[];
} {
  const calls: string[] = [];
  return {
    calls,
    async count(schema, table) {
      const key = `${schema}.${table}`;
      calls.push(key);
      return tableCounts[key] ?? 0;
    },
  };
}

describe("isolated restore", () => {
  it("uses the documented restore order and refuses a non-TLS URL", async () => {
    expect(ISOLATED_RESTORE_ORDER[0]).toBe("roles.sql");
    expect(ISOLATED_RESTORE_ORDER).toContain("auth-data.sql");
    expect(ISOLATED_PROJECT_GUARDS.some((line) => line.includes("production"))).toBe(true);
    await expect(
      restoreIsolated({
        databaseUrl: "postgresql://postgres:secret@localhost:5432/postgres",
        plaintextDir: "/tmp/x",
        confirmIsolatedRef: ISOLATED_REF,
      }),
    ).rejects.toThrow(/sslmode/);
  });

  it("requires --confirm-isolated-ref and refuses the production ref", async () => {
    await expect(restoreIsolated({
      databaseUrl: TLS_URL,
      plaintextDir: "/tmp/x",
      confirmIsolatedRef: "",
    })).rejects.toThrow(/confirm-isolated-ref/);
    await expect(restoreIsolated({
      databaseUrl: TLS_URL,
      plaintextDir: "/tmp/x",
      confirmIsolatedRef: PRODUCTION_SUPABASE_REF,
    })).rejects.toThrow(/production Supabase ref/);
    await expect(restoreIsolated({
      databaseUrl: `postgresql://postgres:secret@db.${PRODUCTION_SUPABASE_REF}.supabase.co:5432/postgres?sslmode=require`,
      plaintextDir: "/tmp/x",
      confirmIsolatedRef: ISOLATED_REF,
    })).rejects.toThrow(/production Supabase ref/);
  });

  it("invokes psql with replica mode before data files", async () => {
    const root = await writePlaintext();
    const runner: CommandRunner = {
      async run(_command, args, options) {
        expect(args).toContain("SET session_replication_role = replica");
        expect(args).not.toContain("--dbname");
        expect(args.join(" ")).not.toContain("secret");
        expect(options?.env?.PGPASSWORD).toBe("secret");
        expect(options?.env?.PGHOST).toBe("localhost");
        expect(options?.env?.PGDATABASE).toBe("postgres");
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
      databaseUrl: TLS_URL,
      plaintextDir: root,
      confirmIsolatedRef: ISOLATED_REF,
      runner,
      tableCountReader: matchingReader({ "public.farms": 1 }),
    });
  });

  it("fails when a required dump is absent but skips optional dumps", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "acreledger-restore-required-"));
    await fs.mkdir(path.join(root, "database"));
    for (const name of REQUIRED_RESTORE_FILES) {
      if (name !== "auth-data.sql") await fs.writeFile(path.join(root, "database", name), "-- test\n");
    }
    await expect(restoreIsolated({
      databaseUrl: TLS_URL,
      plaintextDir: root,
      confirmIsolatedRef: ISOLATED_REF,
    })).rejects.toThrow(/auth-data\.sql/);
  });

  it("fails when restored counts do not match the manifest", async () => {
    const root = await writePlaintext({ "public.farms": 2, "public.profiles": 3 });
    const runner: CommandRunner = {
      async run() {
        return { stdout: "", stderr: "", code: 0 };
      },
    };
    await expect(restoreIsolated({
      databaseUrl: TLS_URL,
      plaintextDir: root,
      confirmIsolatedRef: ISOLATED_REF,
      runner,
      tableCountReader: matchingReader({ "public.farms": 2, "public.profiles": 1 }),
    })).rejects.toThrow(/Restored count mismatch for public\.profiles/);
  });

  it("compareRestoredTableCounts rejects unreadable and mismatched keys", () => {
    expect(() => compareRestoredTableCounts({ "public.farms": 1 }, { "public.farms": "unreadable" }))
      .toThrow(/unreadable/);
    expect(() => compareRestoredTableCounts({ "public.farms": 1 }, { "public.farms": 2 }))
      .toThrow(/mismatch/);
    expect(() => compareRestoredTableCounts({ "public.farms": 4 }, { "public.farms": 4 }))
      .not.toThrow();
  });
});
