import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildDumpSpecs } from "../src/databaseExport.js";
import {
  buildPrivilegeDumpArgs,
  exportPrivileges,
  privilegeDumpSchemas,
  PRIVILEGES_FILE,
} from "../src/privileges.js";
import type { CommandRunner } from "../src/types.js";

describe("database dump specs", () => {
  it("uses the Phase 0 CLI 2.107.0 restore-oriented dumps", () => {
    const specs = buildDumpSpecs(["public", "ai_assistant_private", "weather_proxy_private", "usage_private"]);
    const byFile = Object.fromEntries(specs.map((spec) => [spec.file, spec]));
    expect(byFile["roles.sql"]?.args).toEqual(["--role-only"]);
    expect(byFile["data.sql"]?.args).toContain("--use-copy");
    expect(byFile["data.sql"]?.args).toContain("--data-only");
    expect(byFile["data.sql"]?.args).toContain("public,ai_assistant_private,weather_proxy_private,usage_private");
    expect(byFile["auth-data.sql"]?.args).toEqual(["--use-copy", "--data-only", "--schema", "auth"]);
    expect(byFile["storage-metadata.sql"]?.args).toContain("storage");
    expect(byFile["storage-metadata.sql"]?.args).toContain("storage.buckets_vectors");
    expect(byFile["storage-metadata.sql"]?.args).toContain("-x");
    expect(specs.some((spec) => spec.file === PRIVILEGES_FILE)).toBe(false);
  });

  it("captures object privileges with pg_dump --schema-only --no-owner and without privilege suppression", () => {
    const schemas = privilegeDumpSchemas(["public", "ai_assistant_private"]);
    expect(schemas).toEqual(["public", "ai_assistant_private", "auth", "storage", "supabase_migrations"]);
    const args = buildPrivilegeDumpArgs(schemas);
    expect(args).toContain("--schema-only");
    expect(args).toContain("--no-owner");
    expect(args).not.toContain("--no-privileges");
    expect(args).not.toContain("--no-acl");
    expect(args).not.toContain("-x");
    expect(args.filter((arg) => arg === "--schema")).toHaveLength(schemas.length);
  });

  it("writes privileges.sql from a schema-only dump without CREATE statements", async () => {
    const databaseDir = await fs.mkdtemp(path.join(os.tmpdir(), "acreledger-privileges-export-"));
    const runner: CommandRunner = {
      async run(command, args, options) {
        expect(command).toBe("pg_dump");
        expect(args).toContain("--schema-only");
        expect(args).toContain("--no-owner");
        expect(args).not.toContain("--no-privileges");
        expect(args).not.toContain("-x");
        expect(args.join(" ")).not.toContain("secret");
        expect(options?.env?.PGPASSWORD).toBe("secret");
        const dest = args[args.indexOf("-f") + 1];
        await fs.writeFile(
          dest,
          `CREATE TABLE public.farms (id uuid);
GRANT SELECT,
    INSERT,
    UPDATE ON TABLE public.farms TO authenticated;
REVOKE ALL ON TABLE public.farms FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT SELECT ON TABLES TO authenticated;
`,
        );
        return { stdout: "", stderr: "", code: 0 };
      },
    };

    const dest = await exportPrivileges({
      databaseUrl: "postgresql://postgres:secret@localhost:5432/postgres?sslmode=require",
      databaseDir,
      schemas: ["public"],
      runner,
    });
    expect(path.basename(dest)).toBe(PRIVILEGES_FILE);
    const sql = await fs.readFile(dest, "utf8");
    expect(sql).toContain("GRANT SELECT");
    expect(sql).toContain("REVOKE ALL ON TABLE public.farms FROM PUBLIC");
    expect(sql).toContain("ALTER DEFAULT PRIVILEGES");
    expect(sql).not.toContain("CREATE TABLE");
  });
});
