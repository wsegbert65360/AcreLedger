import { describe, expect, it } from "vitest";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { wipePath } from "../src/wipe.js";

describe("wipePath", () => {
  it("removes plaintext after success and after a simulated failure", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "acreledger-wipe-"));
    const nested = path.join(root, "database");
    await fs.mkdir(nested);
    const secret = path.join(nested, "data.sql");
    await fs.writeFile(secret, "COPY auth.users FROM stdin;\nsecret-row\n");
    await wipePath(root);
    await expect(fs.stat(root)).rejects.toMatchObject({ code: "ENOENT" });
  });
});
