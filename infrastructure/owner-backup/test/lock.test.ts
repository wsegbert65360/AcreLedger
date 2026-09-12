import { describe, expect, it } from "vitest";
import { acquireRunLock } from "../src/lock.js";
import type { DriveClient } from "../src/drive.js";
import { APPLICATION_ID, type DriveFileRecord } from "../src/types.js";

function mockDrive(files: DriveFileRecord[]): DriveClient & { uploaded: unknown[] } {
  const uploaded: unknown[] = [];
  return {
    uploaded,
    async getAccessToken() {
      return "token";
    },
    async listBackupFiles() {
      return files;
    },
    async findByAppProperty() {
      return [];
    },
    async uploadResumable() {
      throw new Error("not used");
    },
    async uploadJson(options) {
      uploaded.push(options.body);
      return { id: "ledger", name: options.name };
    },
    async getFile() {
      throw new Error("not used");
    },
    async updateAppProperties() {
      throw new Error("not used");
    },
    async deleteFile() {},
    async downloadFile() {},
  };
}

describe("run lock", () => {
  it("prevents overlapping runs for the same Chicago date", async () => {
    const drive = mockDrive([
      {
        id: "ledger",
        name: "acreledger-backup-ledger.json",
        appProperties: {
          application: APPLICATION_ID,
          run_date_chicago: "2026-09-10",
          status: "running",
          started_at: "2026-09-10T07:00:00.000Z",
          manifest_id: "existing",
        },
      },
    ]);
    const result = await acquireRunLock({
      drive,
      now: new Date("2026-09-10T08:00:00.000Z"),
      manifestId: "new-id",
    });
    expect(result.action).toBe("in-progress");
  });

  it("skips only when ledger, status, and verified archive agree", async () => {
    const drive = mockDrive([
      {
        id: "ledger",
        name: "acreledger-backup-ledger.json",
        appProperties: {
          application: APPLICATION_ID,
          run_date_chicago: "2026-09-10",
          status: "success",
          started_at: "2026-09-10T07:00:00.000Z",
          manifest_id: "already",
        },
      },
      {
        id: "status",
        name: "acreledger-backup-status.json",
        appProperties: {
          application: APPLICATION_ID,
          run_date_chicago: "2026-09-10",
          status: "success",
          manifest_id: "already",
          archive_sha256: "abc",
        },
      },
      {
        id: "arch",
        name: "acreledger-full-2026-09-10T07-00-00Z-abcd.tar.zst.age",
        appProperties: {
          application: APPLICATION_ID,
          run_date_chicago: "2026-09-10",
          retention_tier: "monthly",
          manifest_id: "already",
          backup_time_utc: "2026-09-10T07:00:00.000Z",
          archive_sha256: "abc",
          verification_status: "success",
        },
      },
    ]);
    const result = await acquireRunLock({
      drive,
      now: new Date("2026-09-10T12:00:00.000Z"),
      manifestId: "new-id",
    });
    expect(result.action).toBe("duplicate-success");
  });

  it("does not skip for an unverified same-day archive", async () => {
    const drive = mockDrive([{
      id: "arch",
      name: "bad.tar.zst.age",
      appProperties: {
        application: APPLICATION_ID,
        run_date_chicago: "2026-09-10",
        retention_tier: "daily",
        manifest_id: "bad",
        archive_sha256: "badsha",
      },
    }]);
    const result = await acquireRunLock({ drive, now: new Date("2026-09-10T12:00:00Z"), manifestId: "new" });
    expect(result.action).toBe("acquired");
  });
});
