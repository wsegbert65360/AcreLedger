import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { decryptFile, extractArchive, sha256File } from "../../infrastructure/owner-backup/src/encryption.js";
import { verifyChecksums } from "../../infrastructure/owner-backup/src/manifest.js";
import { wipePath } from "../../infrastructure/owner-backup/src/wipe.js";
import { REQUIRED_RESTORE_FILES } from "./restore-isolated.js";

export const VERIFY_ERROR = {
  MISSING_SHA: "MISSING_SHA",
  ARCHIVE_SHA_MISMATCH: "ARCHIVE_SHA_MISMATCH",
  MISSING_MANIFEST: "MISSING_MANIFEST",
  MISSING_CHECKSUMS: "MISSING_CHECKSUMS",
  MISSING_RESTORE_FILE: "MISSING_RESTORE_FILE",
  MALFORMED_CHECKSUMS: "MALFORMED_CHECKSUMS",
  CHECKSUM_MISMATCH: "CHECKSUM_MISMATCH",
  ARTIFACT_LIST_MISMATCH: "ARTIFACT_LIST_MISMATCH",
  ARTIFACT_CHECKSUM_MISMATCH: "ARTIFACT_CHECKSUM_MISMATCH",
  UNREADABLE_TABLES: "UNREADABLE_TABLES",
} as const;

export type VerifyErrorCode = (typeof VERIFY_ERROR)[keyof typeof VERIFY_ERROR];

export class BackupVerifyError extends Error {
  readonly errorCode: VerifyErrorCode;
  constructor(message: string, errorCode: VerifyErrorCode) {
    super(message);
    this.name = "BackupVerifyError";
    this.errorCode = errorCode;
  }
}

export interface VerifyOptions {
  archivePath: string;
  expectedSha256?: string;
  identityFile: string;
  workDir?: string;
}

function parseChecksumFile(raw: string): Map<string, string> {
  const map = new Map<string, string>();
  const lines = raw.split(/\r?\n/).filter(Boolean);
  for (const line of lines) {
    const match = line.match(/^([a-f0-9]{64})  (.+)$/);
    if (!match) throw new BackupVerifyError("Malformed checksums.sha256", VERIFY_ERROR.MALFORMED_CHECKSUMS);
    map.set(match[2], match[1]);
  }
  return map;
}

async function pathExists(file: string): Promise<boolean> {
  return fs.access(file).then(() => true, () => false);
}

/** Cross-check extracted plaintext: required files, checksums, and manifest.artifacts both ways. */
export async function verifyExtractedBackup(extracted: string): Promise<{ manifestId: string; tableCount: number }> {
  const manifestPath = path.join(extracted, "manifest.json");
  const checksumPath = path.join(extracted, "checksums.sha256");
  if (!(await pathExists(manifestPath))) {
    throw new BackupVerifyError("Required restore file is missing: manifest.json", VERIFY_ERROR.MISSING_MANIFEST);
  }
  if (!(await pathExists(checksumPath))) {
    throw new BackupVerifyError("Required restore file is missing: checksums.sha256", VERIFY_ERROR.MISSING_CHECKSUMS);
  }

  const databaseDir = path.join(extracted, "database");
  for (const name of REQUIRED_RESTORE_FILES) {
    if (!(await pathExists(path.join(databaseDir, name)))) {
      throw new BackupVerifyError(`Required restore file is missing: ${name}`, VERIFY_ERROR.MISSING_RESTORE_FILE);
    }
  }

  try {
    await verifyChecksums(extracted);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/malformed checksums/i.test(message)) {
      throw new BackupVerifyError(message, VERIFY_ERROR.MALFORMED_CHECKSUMS);
    }
    throw new BackupVerifyError(message, VERIFY_ERROR.CHECKSUM_MISMATCH);
  }

  const checksums = parseChecksumFile(await fs.readFile(checksumPath, "utf8"));
  const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8")) as {
    manifestId?: string;
    tableCounts?: Record<string, number | "unreadable">;
    artifacts?: Array<{ path: string; sha256: string }>;
  };
  if (!Array.isArray(manifest.artifacts)) {
    throw new BackupVerifyError("Manifest is missing artifacts.", VERIFY_ERROR.ARTIFACT_LIST_MISMATCH);
  }

  const artifacts = new Map(manifest.artifacts.map((item) => [item.path.replaceAll("\\", "/"), item.sha256]));
  for (const [relative, sha] of checksums) {
    const artifactSha = artifacts.get(relative);
    if (artifactSha == null) {
      throw new BackupVerifyError(
        `checksums.sha256 lists ${relative} which is absent from manifest.artifacts`,
        VERIFY_ERROR.ARTIFACT_LIST_MISMATCH,
      );
    }
    if (artifactSha !== sha) {
      throw new BackupVerifyError(
        `manifest.artifacts sha256 does not match checksums.sha256 for ${relative}`,
        VERIFY_ERROR.ARTIFACT_CHECKSUM_MISMATCH,
      );
    }
  }
  for (const [relative, sha] of artifacts) {
    const checksumSha = checksums.get(relative);
    if (checksumSha == null) {
      throw new BackupVerifyError(
        `manifest.artifacts lists ${relative} which is absent from checksums.sha256`,
        VERIFY_ERROR.ARTIFACT_LIST_MISMATCH,
      );
    }
    if (checksumSha !== sha) {
      throw new BackupVerifyError(
        `manifest.artifacts sha256 does not match checksums.sha256 for ${relative}`,
        VERIFY_ERROR.ARTIFACT_CHECKSUM_MISMATCH,
      );
    }
  }

  const tableCounts = manifest.tableCounts ?? {};
  const unreadable = Object.values(tableCounts).filter((value) => value === "unreadable");
  if (unreadable.length > 0) {
    throw new BackupVerifyError("Manifest contains unreadable tables.", VERIFY_ERROR.UNREADABLE_TABLES);
  }
  return {
    manifestId: manifest.manifestId ?? "",
    tableCount: Object.keys(tableCounts).length,
  };
}

export async function verifyBackup(options: VerifyOptions): Promise<{ manifestId: string; tableCount: number }> {
  if (!options.expectedSha256) {
    throw new BackupVerifyError("Outer archive SHA-256 is required (--sha256).", VERIFY_ERROR.MISSING_SHA);
  }
  const actualSha = await sha256File(options.archivePath);
  if (actualSha !== options.expectedSha256) {
    throw new BackupVerifyError("Encrypted archive checksum does not match.", VERIFY_ERROR.ARCHIVE_SHA_MISMATCH);
  }
  const workDir = options.workDir ?? await fs.mkdtemp(path.join(os.tmpdir(), "acreledger-verify-"));
  const decrypted = path.join(workDir, "archive.tar.zst");
  const extracted = path.join(workDir, "plaintext");
  try {
    await decryptFile({
      sourceFile: options.archivePath,
      destFile: decrypted,
      identityFile: options.identityFile,
    });
    await extractArchive({ archiveFile: decrypted, destDir: extracted });
    return await verifyExtractedBackup(extracted);
  } finally {
    await wipePath(workDir);
  }
}

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  verifyBackup({
    archivePath: arg("--archive") ?? "",
    expectedSha256: arg("--sha256"),
    identityFile: arg("--identity") ?? "",
  })
    .then((result) => {
      console.log(JSON.stringify({ status: "ok", ...result }));
    })
    .catch((error) => {
      const errorCode = error instanceof BackupVerifyError ? error.errorCode : "VERIFY_FAILED";
      console.error(JSON.stringify({ status: "failed", errorCode, detail: String(error) }));
      process.exitCode = 1;
    });
}
