import { describe, expect, it } from "vitest";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { runBackup, type BackupDependencies } from "../src/backup.js";
import type { BackupConfig } from "../src/config.js";
import type { DriveClient } from "../src/drive.js";
import { DriveAuthError } from "../src/drive.js";
import type { DriveFileRecord } from "../src/types.js";
import { APPLICATION_ID } from "../src/types.js";
import { md5File } from "../src/encryption.js";

function config(workDir: string): BackupConfig {
  return {
    databaseUrl: "postgresql://postgres:secret@localhost:5432/postgres?sslmode=require",
    ageRecipient: "age1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq",
    googleClientId: "id",
    googleClientSecret: "secret",
    googleRefreshToken: "refresh",
    driveFolderId: "folder",
    s3Region: "auto",
    workerVersion: "test",
    projectRefHash: "hashhashhashhash",
    workDir,
    supabaseCliVersion: "2.107.0",
    sslRejectUnauthorized: true,
    chicagoTimeZone: "America/Chicago",
  };
}

function driveMock(options: {
  files?: DriveFileRecord[];
  failUpload?: boolean;
  revoked?: boolean;
  uploaded?: Array<{ name: string; filePath?: string }>;
}): DriveClient {
  let files = options.files ?? [];
  return {
    async getAccessToken() {
      if (options.revoked) throw new DriveAuthError("Google refresh token is revoked or expired.");
      return "token";
    },
    async listBackupFiles() {
      if (options.revoked) throw new DriveAuthError("Google refresh token is revoked or expired.");
      return files;
    },
    async findByAppProperty(key, value) {
      return files.filter((file) => file.appProperties?.[key] === value);
    },
    async uploadResumable({ filePath, name, appProperties }) {
      if (options.failUpload) throw new Error("Drive upload failed");
      const header = await fs.readFile(filePath);
      if (!header.subarray(0, 21).toString("utf8").startsWith("age-encryption.org/v1")) {
        throw new Error("Refusing to upload plaintext");
      }
      const stat = await fs.stat(filePath);
      options.uploaded?.push({ name, filePath });
      const record: DriveFileRecord = {
        id: "archive-1",
        name,
        size: String(stat.size),
        md5Checksum: await md5File(filePath),
        parents: ["folder"],
        appProperties,
      };
      files = [...files, record];
      return record;
    },
    async uploadJson({ name, appProperties }) {
      const record: DriveFileRecord = { id: name, name, appProperties, parents: ["folder"] };
      files = [...files.filter((file) => file.name !== name), record];
      return record;
    },
    async getFile(id) {
      const found = files.find((file) => file.id === id);
      if (!found) throw new Error("missing");
      return found;
    },
    async updateAppProperties(id, appProperties) {
      const found = files.find((file) => file.id === id);
      if (!found) throw new Error("missing");
      found.appProperties = appProperties;
      return found;
    },
    async deleteFile(id) {
      files = files.filter((file) => file.id !== id);
    },
    async downloadFile() {},
  };
}

describe("runBackup", () => {
  it("encrypts before Drive upload, wipes plaintext, and reports success only after verification", async () => {
    const workDir = await fs.mkdtemp(path.join(os.tmpdir(), "acreledger-backup-"));
    const uploaded: Array<{ name: string; filePath?: string }> = [];
    const deps: BackupDependencies = {
      config: config(workDir),
      drive: driveMock({ uploaded }),
      async exportDatabase({ databaseDir }) {
        await fs.mkdir(databaseDir, { recursive: true });
        await fs.writeFile(path.join(databaseDir, "data.sql"), "COPY public.farms FROM stdin;\n");
        return {
          postgresVersion: "17.0",
          pgDumpVersion: "pg_dump 17.0",
          supabaseCliVersion: "2.107.0",
          schemas: ["public"],
          tableCounts: [{ schema: "public", table: "farms", rowCount: 1, softDeletedCount: 0 }],
          dumpNotes: [],
          artifactPaths: [path.join(databaseDir, "data.sql")],
        };
      },
      async exportStorage({ storageDir }) {
        await fs.mkdir(storageDir, { recursive: true });
        await fs.writeFile(path.join(storageDir, "objects-manifest.json"), "{\"objects\":[]}\n");
        return {
          bucketCount: 0,
          objectCount: 0,
          totalBytes: 0,
          objects: [],
          artifactPaths: [path.join(storageDir, "objects-manifest.json")],
        };
      },
      async compressDirectory({ destFile }) {
        await fs.writeFile(destFile, "compressed");
      },
      async encryptFile({ destFile }) {
        await fs.writeFile(destFile, "age-encryption.org/v1\n-> X25519 test\n");
      },
      now: () => new Date("2026-09-10T07:00:00.000Z"),
    };

    const result = await runBackup(deps);
    expect(result.status).toBe("success");
    expect(uploaded).toHaveLength(1);
    expect(uploaded[0].name.endsWith(".tar.zst.age")).toBe(true);
    await expect(fs.stat(path.join(workDir, "plaintext"))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("does not report success when upload is incomplete", async () => {
    const workDir = await fs.mkdtemp(path.join(os.tmpdir(), "acreledger-backup-fail-"));
    const result = await runBackup({
      config: config(workDir),
      drive: driveMock({ failUpload: true }),
      async exportDatabase({ databaseDir }) {
        await fs.mkdir(databaseDir, { recursive: true });
        await fs.writeFile(path.join(databaseDir, "data.sql"), "data");
        return {
          postgresVersion: "17.0",
          pgDumpVersion: "pg_dump 17.0",
          supabaseCliVersion: "2.107.0",
          schemas: ["public"],
          tableCounts: [{ schema: "public", table: "farms", rowCount: 1, softDeletedCount: 0 }],
          dumpNotes: [],
          artifactPaths: [],
        };
      },
      async exportStorage() {
        return { bucketCount: 0, objectCount: 0, totalBytes: 0, objects: [], artifactPaths: [] };
      },
      async compressDirectory({ destFile }) {
        await fs.writeFile(destFile, "compressed");
      },
      async encryptFile({ destFile }) {
        await fs.writeFile(destFile, "age-encryption.org/v1\n");
      },
      now: () => new Date("2026-09-10T07:00:00.000Z"),
    });
    expect(result.status).toBe("failed");
    expect(result.errorCode).toBe("UPLOAD_FAILED");
    await expect(fs.stat(path.join(workDir, "plaintext"))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("produces a reconnect-required failure when the refresh token is revoked", async () => {
    const workDir = await fs.mkdtemp(path.join(os.tmpdir(), "acreledger-backup-revoked-"));
    const result = await runBackup({
      config: config(workDir),
      drive: driveMock({ revoked: true }),
      async exportDatabase() {
        throw new Error("should not dump");
      },
      async exportStorage() {
        throw new Error("should not export storage");
      },
      async compressDirectory() {},
      async encryptFile() {},
      now: () => new Date("2026-09-10T07:00:00.000Z"),
    });
    expect(result.status).toBe("failed");
    expect(result.errorCode).toBe("AUTH_REVOKED");
  });

  it("detects a failed table export", async () => {
    const workDir = await fs.mkdtemp(path.join(os.tmpdir(), "acreledger-backup-table-"));
    const result = await runBackup({
      config: config(workDir),
      drive: driveMock({}),
      async exportDatabase() {
        throw new Error("Failed to count 1 table(s); refusing incomplete backup.");
      },
      async exportStorage() {
        throw new Error("should not export storage");
      },
      async compressDirectory() {},
      async encryptFile() {},
      now: () => new Date("2026-09-10T07:00:00.000Z"),
    });
    expect(result.status).toBe("failed");
    expect(result.errorCode).toBe("TABLE_EXPORT_FAILED");
  });
});
