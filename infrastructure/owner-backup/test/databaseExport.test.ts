import { describe, expect, it } from "vitest";
import { buildDumpSpecs } from "../src/databaseExport.js";

describe("database dump specs", () => {
  it("uses the Phase 0 CLI 2.107.0 restore-oriented dumps", () => {
    const specs = buildDumpSpecs(["public", "ai_assistant_private", "weather_proxy_private"]);
    const byFile = Object.fromEntries(specs.map((spec) => [spec.file, spec]));
    expect(byFile["roles.sql"]?.args).toEqual(["--role-only"]);
    expect(byFile["data.sql"]?.args).toContain("--use-copy");
    expect(byFile["data.sql"]?.args).toContain("--data-only");
    expect(byFile["data.sql"]?.args).toContain("public,ai_assistant_private,weather_proxy_private");
    expect(byFile["auth-data.sql"]?.args).toEqual(["--use-copy", "--data-only", "--schema", "auth"]);
    expect(byFile["storage-metadata.sql"]?.args).toContain("storage");
    expect(byFile["storage-metadata.sql"]?.args).toContain("storage.buckets_vectors");
  });
});
