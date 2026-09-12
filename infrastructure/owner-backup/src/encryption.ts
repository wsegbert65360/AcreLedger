import { createHash } from "node:crypto";
import { createReadStream, promises as fs } from "node:fs";
import path from "node:path";
import { defaultCommandRunner } from "./command.js";
import type { CommandRunner } from "./types.js";

export async function sha256File(filePath: string): Promise<string> {
  const hash = createHash("sha256");
  const stream = createReadStream(filePath);
  for await (const chunk of stream) {
    hash.update(chunk as Buffer);
  }
  return hash.digest("hex");
}

export async function md5File(filePath: string): Promise<string> {
  const hash = createHash("md5");
  const stream = createReadStream(filePath);
  for await (const chunk of stream) hash.update(chunk as Buffer);
  return hash.digest("hex");
}

export async function sha256Buffer(contents: Buffer | string): Promise<string> {
  return createHash("sha256").update(contents).digest("hex");
}

export function archiveFileName(startedAt: Date, manifestId: string): string {
  const stamp = startedAt.toISOString().replace(/\.\d{3}Z$/, "Z").replace(/:/g, "-");
  const shortId = manifestId.replaceAll("-", "").slice(0, 8);
  return `acreledger-full-${stamp}-${shortId}.tar.zst.age`;
}

export async function compressDirectory(options: {
  sourceDir: string;
  destFile: string;
  runner?: CommandRunner;
}): Promise<void> {
  const runner = options.runner ?? defaultCommandRunner;
  const result = await runner.run(
    "tar",
    ["-C", options.sourceDir, "-I", "zstd -19", "-cf", options.destFile, "."],
  );
  if (result.code !== 0) {
    throw new Error("Failed to compress backup directory.");
  }
}

export async function encryptFile(options: {
  sourceFile: string;
  destFile: string;
  recipient: string;
  runner?: CommandRunner;
}): Promise<void> {
  const runner = options.runner ?? defaultCommandRunner;
  const result = await runner.run("age", [
    "-r",
    options.recipient,
    "-o",
    options.destFile,
    options.sourceFile,
  ]);
  if (result.code !== 0) {
    throw new Error("age encryption failed.");
  }
  const handle = await fs.open(options.destFile, "r");
  const header = Buffer.alloc(21);
  try {
    await handle.read(header, 0, header.length, 0);
  } finally {
    await handle.close();
  }
  if (!header.toString("utf8").startsWith("age-encryption.org/v1")) {
    throw new Error("Encrypted archive is missing the age header; refusing to upload.");
  }
}

export async function decryptFile(options: {
  sourceFile: string;
  destFile: string;
  identityFile: string;
  runner?: CommandRunner;
}): Promise<void> {
  const runner = options.runner ?? defaultCommandRunner;
  const result = await runner.run("age", [
    "-d",
    "-i",
    options.identityFile,
    "-o",
    options.destFile,
    options.sourceFile,
  ]);
  if (result.code !== 0) {
    throw new Error("age decryption failed.");
  }
}

export async function extractArchive(options: {
  archiveFile: string;
  destDir: string;
  runner?: CommandRunner;
}): Promise<void> {
  const runner = options.runner ?? defaultCommandRunner;
  await fs.mkdir(options.destDir, { recursive: true });
  const result = await runner.run("tar", ["-C", options.destDir, "-I", "zstd", "-xf", options.archiveFile]);
  if (result.code !== 0) {
    throw new Error("Failed to extract backup archive.");
  }
}

export function plaintextPaths(workDir: string, archivePath: string): string[] {
  return [
    path.join(workDir, "plaintext"),
    archivePath.replace(/\.age$/, ""),
  ];
}
