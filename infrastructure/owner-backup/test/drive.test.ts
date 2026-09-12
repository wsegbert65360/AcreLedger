import { describe, expect, it } from "vitest";
import { DriveAuthError } from "../src/drive.js";

describe("Drive auth errors", () => {
  it("classifies a revoked refresh token as AUTH_REVOKED", () => {
    const error = new DriveAuthError("Google refresh token is revoked or expired.");
    expect(error.code).toBe("AUTH_REVOKED");
  });
});
