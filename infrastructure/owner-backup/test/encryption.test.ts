import { describe, expect, it } from "vitest";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { archiveFileName, encryptFile } from "../src/encryption.js";
import type { CommandRunner } from "../src/types.js";

describe("encryption", () => {
  it("names archives with a unique manifest id, not only a date", () => {
    const name = archiveFileName(new Date("2026-09-10T07:00:00.000Z"), "abcdef12-3456-7890-abcd-ef1234567890");
    expect(name).toBe("acreledger-full-2026-09-10T07-00-00Z-abcdef12.tar.zst.age");
  });

  it("encrypts before upload and refuses a non-age output", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "acreledger-age-"));
    const source = path.join(dir, "plain.tar.zst");
    const dest = path.join(dir, "plain.tar.zst.age");
    await fs.writeFile(source, "plaintext-sql");
    const runner: CommandRunner = {
      async run() {
        await fs.writeFile(dest, "not-an-age-file");
        return { stdout: "", stderr: "", code: 0 };
      },
    };
    await expect(
      encryptFile({ sourceFile: source, destFile: dest, recipient: "age1test", runner }),
    ).rejects.toThrow(/age header/);
  });

  it("accepts an age header", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "acreledger-age-ok-"));
    const source = path.join(dir, "plain.tar.zst");
    const dest = path.join(dir, "plain.tar.zst.age");
    await fs.writeFile(source, "plaintext-sql");
    const runner: CommandRunner = {
      async run() {
        await fs.writeFile(dest, "age-encryption.org/v1\n-> X25519 abc\n");
        return { stdout: "", stderr: "", code: 0 };
      },
    };
    await encryptFile({ sourceFile: source, destFile: dest, recipient: "age1test", runner });
    const header = await fs.readFile(dest, "utf8");
    expect(header.startsWith("age-encryption.org/v1")).toBe(true);
  });
});
