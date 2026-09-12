import { describe, expect, it } from "vitest";
import { sanitizeForLog } from "../src/logging.js";

describe("sanitizeForLog", () => {
  it("redacts connection strings, tokens, and emails", () => {
    const raw = [
      "postgresql://postgres:super-secret@db.example.supabase.co:5432/postgres",
      "Authorization: Bearer ya29.abc",
      "refresh_token=1//secret",
      "owner@example.com",
    ].join(" ");
    const sanitized = sanitizeForLog(raw);
    expect(sanitized).not.toContain("super-secret");
    expect(sanitized).not.toContain("ya29.abc");
    expect(sanitized).not.toContain("1//secret");
    expect(sanitized).not.toContain("owner@example.com");
    expect(sanitized).toContain("[redacted]");
    expect(sanitized).toContain("[redacted-email]");
  });
});
