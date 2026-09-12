import { createHash, randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { sha256File } from "./encryption.js";
import {
  MANIFEST_VERSION,
  type BackupManifest,
  type RetentionTier,
  type TableCount,
} from "./types.js";

export function newManifestId(): string {
  return randomUUID();
}

export function tableCountMap(rows: TableCount[]): Record<string, number | "unreadable"> {
  const map: Record<string, number | "unreadable"> = {};
  for (const row of rows) {
    map[`${row.schema}.${row.table}`] = row.rowCount === null ? "unreadable" : row.rowCount;
  }
  return map;
}

export async function checksumTree(rootDir: string): Promise<Array<{ path: string; sha256: string; bytes: number }>> {
  const artifacts: Array<{ path: string; sha256: string; bytes: number }> = [];

  async function walk(current: string): Promise<void> {
    const entries = await fs.readdir(current, { withFileTypes: true });
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
        continue;
      }
      if (entry.name === "checksums.sha256" || entry.name === "manifest.json") continue;
      const sha256 = await sha256File(full);
      const stat = await fs.stat(full);
      artifacts.push({
        path: path.relative(rootDir, full).replaceAll("\\", "/"),
        sha256,
        bytes: stat.size,
      });
    }
  }

  await walk(rootDir);
  return artifacts;
}

export function renderChecksumFile(artifacts: Array<{ path: string; sha256: string }>): string {
  return `${artifacts.map((item) => `${item.sha256}  ${item.path}`).join("\n")}\n`;
}

export async function writeChecksums(rootDir: string): Promise<Array<{ path: string; sha256: string; bytes: number }>> {
  const artifacts = await checksumTree(rootDir);
  await fs.writeFile(path.join(rootDir, "checksums.sha256"), renderChecksumFile(artifacts), "utf8");
  return artifacts;
}

export async function verifyChecksums(rootDir: string): Promise<void> {
  const checksumPath = path.join(rootDir, "checksums.sha256");
  const raw = await fs.readFile(checksumPath, "utf8");
  const lines = raw.split(/\r?\n/).filter(Boolean);
  for (const line of lines) {
    const match = line.match(/^([a-f0-9]{64})  (.+)$/);
    if (!match) throw new Error("Malformed checksums.sha256");
    const expected = match[1];
    const relative = match[2];
    const actual = await sha256File(path.join(rootDir, relative));
    if (actual !== expected) {
      throw new Error(`Checksum mismatch for ${relative}`);
    }
  }
}

export function buildManifest(input: {
  manifestId: string;
  projectRefHash: string;
  startedAt: Date;
  completedAt: Date;
  postgresVersion: string;
  supabaseCliVersion: string;
  pgDumpVersion: string;
  backupWorkerVersion: string;
  schemas: string[];
  tableCounts: TableCount[];
  storage: { bucketCount: number; objectCount: number; totalBytes: number };
  artifacts: Array<{ path: string; sha256: string; bytes: number }>;
  retentionTier: RetentionTier;
  recipientFingerprint: string;
  dumpNotes: string[];
}): BackupManifest {
  const failedTables = input.tableCounts
    .filter((row) => row.rowCount === null)
    .map((row) => ({
      schema: row.schema,
      table: row.table,
      errorCode: "TABLE_EXPORT_FAILED",
    }));

  return {
    manifestVersion: MANIFEST_VERSION,
    manifestId: input.manifestId,
    projectRefHash: input.projectRefHash,
    startedAt: input.startedAt.toISOString(),
    completedAt: input.completedAt.toISOString(),
    postgresVersion: input.postgresVersion,
    supabaseCliVersion: input.supabaseCliVersion,
    pgDumpVersion: input.pgDumpVersion,
    backupWorkerVersion: input.backupWorkerVersion,
    schemas: input.schemas,
    tableCounts: tableCountMap(input.tableCounts),
    failedTables,
    storage: input.storage,
    artifacts: input.artifacts,
    retentionTier: input.retentionTier,
    encryption: {
      scheme: "age",
      recipientFingerprint: input.recipientFingerprint,
    },
    dumpNotes: input.dumpNotes,
  };
}

export function statusManifestSha(contents: string): string {
  return createHash("sha256").update(contents).digest("hex");
}
