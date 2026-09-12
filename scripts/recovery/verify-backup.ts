import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { decryptFile, extractArchive, sha256File } from "../../infrastructure/owner-backup/src/encryption.js";
import { verifyChecksums } from "../../infrastructure/owner-backup/src/manifest.js";
import { wipePath } from "../../infrastructure/owner-backup/src/wipe.js";

export interface VerifyOptions {
  archivePath: string;
  expectedSha256?: string;
  identityFile: string;
  workDir?: string;
}

export async function verifyBackup(options: VerifyOptions): Promise<{ manifestId: string; tableCount: number }> {
  const actualSha = await sha256File(options.archivePath);
  if (options.expectedSha256 && actualSha !== options.expectedSha256) {
    throw new Error("Encrypted archive checksum does not match.");
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
    await verifyChecksums(extracted);
    const manifest = JSON.parse(await fs.readFile(path.join(extracted, "manifest.json"), "utf8")) as {
      manifestId: string;
      tableCounts: Record<string, number | "unreadable">;
    };
    const unreadable = Object.values(manifest.tableCounts).filter((value) => value === "unreadable");
    if (unreadable.length > 0) {
      throw new Error("Manifest contains unreadable tables.");
    }
    return {
      manifestId: manifest.manifestId,
      tableCount: Object.keys(manifest.tableCounts).length,
    };
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
      console.error(JSON.stringify({ status: "failed", errorCode: "CHECKSUM_MISMATCH", detail: String(error) }));
      process.exitCode = 1;
    });
}
