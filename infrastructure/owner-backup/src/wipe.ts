import { createWriteStream, promises as fs } from "node:fs";
import { randomBytes } from "node:crypto";
import path from "node:path";

async function overwriteFile(filePath: string): Promise<void> {
  const stat = await fs.stat(filePath);
  const size = stat.size;
  if (size === 0) {
    await fs.unlink(filePath);
    return;
  }
  await new Promise<void>((resolve, reject) => {
    const stream = createWriteStream(filePath, { flags: "w" });
    let remaining = size;
    const writeChunk = (): void => {
      while (remaining > 0) {
        const chunkSize = Math.min(remaining, 64 * 1024);
        const chunk = randomBytes(chunkSize);
        remaining -= chunkSize;
        if (!stream.write(chunk)) {
          stream.once("drain", writeChunk);
          return;
        }
      }
      stream.end();
    };
    stream.on("finish", () => resolve());
    stream.on("error", reject);
    writeChunk();
  });
  await fs.unlink(filePath);
}

export async function wipePath(target: string): Promise<void> {
  let stat;
  try {
    stat = await fs.lstat(target);
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    if (err.code === "ENOENT") return;
    throw error;
  }

  if (stat.isDirectory()) {
    const entries = await fs.readdir(target);
    for (const entry of entries) {
      await wipePath(path.join(target, entry));
    }
    await fs.rmdir(target);
    return;
  }

  await overwriteFile(target);
}

export async function wipePaths(targets: string[]): Promise<void> {
  const errors: Error[] = [];
  for (const target of targets) {
    try {
      await wipePath(target);
    } catch (error) {
      errors.push(error instanceof Error ? error : new Error(String(error)));
    }
  }
  if (errors.length > 0) {
    throw new Error(`Failed to wipe ${errors.length} path(s)`);
  }
}
