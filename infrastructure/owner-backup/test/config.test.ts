import { describe, expect, it } from "vitest";
import { assertTlsDatabaseUrl, ConfigError, loadConfig } from "../src/config.js";

const validEnv = {
  OWNER_BACKUP_DATABASE_URL: "postgresql://postgres:secret@db.example.supabase.co:5432/postgres?sslmode=require",
  OWNER_BACKUP_AGE_RECIPIENT: "age1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq",
  OWNER_BACKUP_GOOGLE_OAUTH_CLIENT_ID: "client-id",
  OWNER_BACKUP_GOOGLE_OAUTH_CLIENT_SECRET: "client-secret",
  OWNER_BACKUP_GOOGLE_REFRESH_TOKEN: "refresh-token",
  OWNER_BACKUP_DRIVE_FOLDER_ID: "folder-id",
};

describe("loadConfig", () => {
  it("refuses to start when required secrets are missing", () => {
    expect(() => loadConfig({})).toThrow(ConfigError);
    expect(() => loadConfig({})).toThrow(/Missing required configuration/);
  });

  it("refuses a non-TLS database URL", () => {
    expect(() =>
      loadConfig({
        ...validEnv,
        OWNER_BACKUP_DATABASE_URL: "postgresql://postgres:secret@db.example.supabase.co:5432/postgres",
      }),
    ).toThrow(/sslmode/);
  });

  it("refuses sslmode=disable", () => {
    expect(() =>
      assertTlsDatabaseUrl("postgresql://postgres:secret@localhost:5432/postgres?sslmode=disable"),
    ).toThrow(ConfigError);
  });

  it("refuses disabled TLS certificate verification", () => {
    expect(() => loadConfig({ ...validEnv, OWNER_BACKUP_SSL_REJECT_UNAUTHORIZED: "false" })).toThrow(
      /certificate verification/,
    );
  });

  it("refuses the transaction pooler port", () => {
    expect(() =>
      assertTlsDatabaseUrl("postgresql://postgres:secret@pooler.supabase.com:6543/postgres?sslmode=require"),
    ).toThrow(/6543/);
  });

  it("loads a valid TLS session-pooler or direct URL", () => {
    const config = loadConfig(validEnv);
    expect(config.driveFolderId).toBe("folder-id");
    expect(config.chicagoTimeZone).toBe("America/Chicago");
  });
});
