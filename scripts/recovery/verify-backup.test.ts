import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { REQUIRED_RESTORE_FILES } from "./restore-isolated.js";
import {
  BackupVerifyError,
  VERIFY_ERROR,
  verifyBackup,
  verifyExtractedBackup,
} from "./verify-backup.js";

const tmpDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tmpDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

function sha(contents: string): string {
  return createHash("sha256").update(contents).digest("hex");
}

async function writeExtractedBackup(options?: {
  omitFile?: string;
  omitManifest?: boolean;
  extraChecksumPath?: string;
  extraArtifactPath?: string;
  artifactShaOverride?: string;
  unreadable?: boolean;
}): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "acreledger-verify-extracted-"));
  tmpDirs.push(root);
  await fs.mkdir(path.join(root, "database"));
  const artifacts: Array<{ path: string; sha256: string; bytes: number }> = [];
  const checksumLines: string[] = [];
  for (const name of REQUIRED_RESTORE_FILES) {
    if (options?.omitFile === name) continue;
    const relative = `database/${name}`;
    const contents = `-- ${name}\n`;
    await fs.writeFile(path.join(root, relative), contents);
    const digest = sha(contents);
    artifacts.push({ path: relative, sha256: digest, bytes: contents.length });
    checksumLines.push(`${digest}  ${relative}`);
  }
  if (options?.extraChecksumPath) {
    const contents = "extra\n";
    await fs.mkdir(path.join(root, path.dirname(options.extraChecksumPath)), { recursive: true });
    await fs.writeFile(path.join(root, options.extraChecksumPath), contents);
    checksumLines.push(`${sha(contents)}  ${options.extraChecksumPath}`);
  }
  if (options?.extraArtifactPath) {
    artifacts.push({ path: options.extraArtifactPath, sha256: sha("extra-art"), bytes: 1 });
  }
  if (options?.artifactShaOverride && artifacts[0]) {
    artifacts[0] = { ...artifacts[0], sha256: options.artifactShaOverride };
  }
  await fs.writeFile(path.join(root, "checksums.sha256"), `${checksumLines.join("\n")}\n`);
  if (!options?.omitManifest) {
    await fs.writeFile(path.join(root, "manifest.json"), `${JSON.stringify({
      manifestId: "manifest-1",
      tableCounts: options?.unreadable ? { "public.farms": "unreadable" } : { "public.farms": 1 },
      artifacts,
    }, null, 2)}\n`);
  }
  return root;
}

describe("verify extracted backup", () => {
  it("accepts a complete extracted archive", async () => {
    const root = await writeExtractedBackup();
    await expect(verifyExtractedBackup(root)).resolves.toEqual({
      manifestId: "manifest-1",
      tableCount: 1,
    });
  });

  it("uses MISSING_SHA when the outer archive hash is omitted", async () => {
    await expect(verifyBackup({
      archivePath: "missing.age",
      identityFile: "id",
    })).rejects.toMatchObject({ errorCode: VERIFY_ERROR.MISSING_SHA });
  });

  it("uses MISSING_MANIFEST when manifest.json is absent", async () => {
    const root = await writeExtractedBackup({ omitManifest: true });
    await expect(verifyExtractedBackup(root)).rejects.toMatchObject({
      errorCode: VERIFY_ERROR.MISSING_MANIFEST,
    });
  });

  it("uses MISSING_RESTORE_FILE when a required dump is absent", async () => {
    const root = await writeExtractedBackup({ omitFile: "auth-data.sql" });
    await expect(verifyExtractedBackup(root)).rejects.toMatchObject({
      errorCode: VERIFY_ERROR.MISSING_RESTORE_FILE,
    });
  });

  it("uses ARTIFACT_LIST_MISMATCH when checksums and manifest artifacts disagree", async () => {
    const extraChecksum = await writeExtractedBackup({ extraChecksumPath: "database/ghost.sql" });
    await expect(verifyExtractedBackup(extraChecksum)).rejects.toMatchObject({
      errorCode: VERIFY_ERROR.ARTIFACT_LIST_MISMATCH,
    });
    const extraArtifact = await writeExtractedBackup({ extraArtifactPath: "database/ghost.sql" });
    await expect(verifyExtractedBackup(extraArtifact)).rejects.toMatchObject({
      errorCode: VERIFY_ERROR.ARTIFACT_LIST_MISMATCH,
    });
  });

  it("uses ARTIFACT_CHECKSUM_MISMATCH when the listed hashes disagree", async () => {
    const root = await writeExtractedBackup({ artifactShaOverride: "0".repeat(64) });
    await expect(verifyExtractedBackup(root)).rejects.toMatchObject({
      errorCode: VERIFY_ERROR.ARTIFACT_CHECKSUM_MISMATCH,
    });
  });

  it("uses UNREADABLE_TABLES when the manifest cannot count a table", async () => {
    const root = await writeExtractedBackup({ unreadable: true });
    await expect(verifyExtractedBackup(root)).rejects.toMatchObject({
      errorCode: VERIFY_ERROR.UNREADABLE_TABLES,
    });
  });

  it("keeps BackupVerifyError codes distinct", () => {
    const codes = Object.values(VERIFY_ERROR);
    expect(new Set(codes).size).toBe(codes.length);
    expect(new BackupVerifyError("x", VERIFY_ERROR.MISSING_SHA).errorCode).toBe("MISSING_SHA");
  });
});
