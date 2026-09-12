import { describe, expect, it } from "vitest";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildManifest, verifyChecksums, writeChecksums } from "../src/manifest.js";

describe("manifest checksums", () => {
  it("rejects corrupted artifacts", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "acreledger-manifest-"));
    await fs.writeFile(path.join(root, "roles.sql"), "CREATE ROLE test;");
    await writeChecksums(root);
    await fs.writeFile(path.join(root, "roles.sql"), "tampered");
    await expect(verifyChecksums(root)).rejects.toThrow(/Checksum mismatch/);
  });

  it("omits credentials from the manifest shape", () => {
    const manifest = buildManifest({
      manifestId: "11111111-1111-4111-8111-111111111111",
      projectRefHash: "abcd",
      startedAt: new Date("2026-09-10T07:00:00Z"),
      completedAt: new Date("2026-09-10T07:05:00Z"),
      postgresVersion: "17.0",
      supabaseCliVersion: "2.107.0",
      pgDumpVersion: "pg_dump 17.0",
      backupWorkerVersion: "abc",
      schemas: ["public"],
      tableCounts: [{ schema: "public", table: "farms", rowCount: 2, softDeletedCount: 0 }],
      storage: { bucketCount: 0, objectCount: 0, totalBytes: 0 },
      artifacts: [],
      retentionTier: "daily",
      recipientFingerprint: "ffff",
      dumpNotes: [],
    });
    const json = JSON.stringify(manifest);
    expect(json).not.toMatch(/password/i);
    expect(json).not.toMatch(/refresh/i);
    expect(json).not.toMatch(/@/);
    expect(manifest.encryption.scheme).toBe("age");
  });
});
