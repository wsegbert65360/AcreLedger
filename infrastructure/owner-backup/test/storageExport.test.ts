import { describe, expect, it } from "vitest";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { exportStorageObjects, type StorageClient } from "../src/storageExport.js";
import type { BackupConfig } from "../src/config.js";

const config = {
  databaseUrl: "postgresql://postgres:secret@localhost:5432/postgres?sslmode=require",
  sslRejectUnauthorized: false,
} as BackupConfig;

describe("storage export", () => {
  it("handles an empty Storage project", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "acreledger-storage-empty-"));
    const client: StorageClient = {
      async listBuckets() {
        return [];
      },
      async listObjects() {
        return [];
      },
      async download() {
        throw new Error("should not download");
      },
    };
    const result = await exportStorageObjects({
      config,
      storageDir: dir,
      client,
      metadataCounts: { buckets: 0, objects: 0 },
    });
    expect(result.objectCount).toBe(0);
    expect(result.bucketCount).toBe(0);
  });

  it("downloads nested keys and empty objects", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "acreledger-storage-"));
    const client: StorageClient = {
      async listBuckets() {
        return ["attachments"];
      },
      async listObjects() {
        return [
          { key: "farm-a/nested/ticket.png", size: 4, etag: "etag" },
          { key: "empty.txt", size: 0 },
        ];
      },
      async download(_bucket, key, destPath) {
        await fs.mkdir(path.dirname(destPath), { recursive: true });
        await fs.writeFile(destPath, key === "empty.txt" ? "" : "data");
        return { sha256: "a".repeat(64), bytes: key === "empty.txt" ? 0 : 4, contentType: "text/plain" };
      },
    };

    const result = await exportStorageObjects({
      config,
      storageDir: dir,
      client,
      metadataCounts: { buckets: 1, objects: 2 },
    });
    expect(result.objectCount).toBe(2);
    expect(result.objects.map((item) => item.key)).toEqual(["farm-a/nested/ticket.png", "empty.txt"]);
    await expect(fs.stat(path.join(dir, result.objects[0].archivePath))).resolves.toBeTruthy();
  });

  it("never maps traversal-like object keys outside the objects directory", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "acreledger-storage-traversal-"));
    let destination = "";
    const client: StorageClient = {
      async listBuckets() { return ["attachments"]; },
      async listObjects() { return [{ key: "../../database/schema.sql", size: 1 }]; },
      async download(_bucket, _key, destPath) {
        destination = destPath;
        await fs.mkdir(path.dirname(destPath), { recursive: true });
        await fs.writeFile(destPath, "x");
        return { sha256: "b".repeat(64), bytes: 1 };
      },
    };
    const result = await exportStorageObjects({
      config,
      storageDir: dir,
      client,
      metadataCounts: { buckets: 1, objects: 1 },
    });
    expect(path.resolve(destination).startsWith(`${path.resolve(dir, "objects")}${path.sep}`)).toBe(true);
    expect(result.objects[0].archivePath).not.toContain("..");
  });
});
