import { describe, expect, it } from "vitest";
import { APPLICATION_ID, type DriveFileRecord } from "../src/types.js";
import { chooseRetentionTier, filesToDelete, isAbandonedUnverifiedArchive, isOwnedBackup } from "../src/retention.js";

const FOLDER = "folder-1";

function file(overrides: Partial<DriveFileRecord> & { id: string; name: string }): DriveFileRecord {
  return {
    parents: [FOLDER],
    appProperties: {
      application: APPLICATION_ID,
      manifest_id: overrides.id,
      archive_sha256: "abc",
      verification_status: "success",
      retention_tier: "daily",
      backup_time_utc: "2026-09-10T07:00:00.000Z",
    },
    ...overrides,
  };
}

describe("retention", () => {
  it("marks the first successful backup in a Chicago month as monthly", () => {
    expect(chooseRetentionTier(new Date("2026-09-10T07:00:00Z"), [], FOLDER)).toBe("monthly");
    const existing = [
      file({
        id: "m1",
        name: "acreledger-full-2026-09-01T07-00-00Z-aaaaaaaa.tar.zst.age",
        appProperties: {
          application: APPLICATION_ID,
          manifest_id: "m1",
          archive_sha256: "abc",
          verification_status: "success",
          retention_tier: "monthly",
          backup_time_utc: "2026-09-01T07:00:00.000Z",
        },
      }),
    ];
    expect(chooseRetentionTier(new Date("2026-09-10T07:00:00Z"), existing, FOLDER)).toBe("daily");
  });

  it("retains 30 daily and 12 monthly archives and never deletes the last known-good", () => {
    const files: DriveFileRecord[] = [];
    for (let i = 0; i < 40; i += 1) {
      files.push(
        file({
          id: `d${i}`,
          name: `daily-${i}.tar.zst.age`,
          appProperties: {
            application: APPLICATION_ID,
            manifest_id: `d${i}`,
            archive_sha256: "abc",
            verification_status: "success",
            retention_tier: "daily",
            backup_time_utc: `2026-08-${String(31 - (i % 28)).padStart(2, "0")}T07:00:00.000Z`,
          },
        }),
      );
    }
    for (let i = 0; i < 15; i += 1) {
      files.push(
        file({
          id: `m${i}`,
          name: `monthly-${i}.tar.zst.age`,
          appProperties: {
            application: APPLICATION_ID,
            manifest_id: `m${i}`,
            archive_sha256: "abc",
            verification_status: "success",
            retention_tier: "monthly",
            backup_time_utc: `2025-${String(12 - (i % 12)).padStart(2, "0")}-01T07:00:00.000Z`,
          },
        }),
      );
    }
    const unrelated = file({
      id: "other",
      name: "not-ours.txt",
      appProperties: { application: "something-else" },
    });
    files.push(unrelated);

    const plan = filesToDelete({ files, folderId: FOLDER });
    expect(plan.delete).toHaveLength(10 + 3);
    expect(plan.keep[0]?.id).toBeDefined();
    expect(plan.delete.some((item) => item.id === plan.keep[0]?.id)).toBe(false);
    expect(plan.delete.some((item) => item.id === "other")).toBe(false);
  });

  it("does not treat unrelated Drive files as backups", () => {
    expect(
      isOwnedBackup(
        {
          id: "x",
          name: "family-photo.jpg",
          parents: [FOLDER],
          appProperties: {},
        },
        FOLDER,
      ),
    ).toBe(false);
  });

  it("deletes an app-owned unverified archive left by an interrupted run", () => {
    const abandoned = file({
      id: "pending",
      name: "acreledger-full-pending.tar.zst.age",
      appProperties: {
        application: APPLICATION_ID,
        kind: "archive",
        manifest_id: "pending",
        archive_sha256: "def",
        retention_tier: "daily",
        backup_time_utc: "2026-09-11T07:00:00.000Z",
      },
    });
    const unrelated = file({
      id: "unrelated-pending",
      name: "unrelated-pending.tar.zst.age",
      appProperties: { application: "something-else" },
    });

    expect(isAbandonedUnverifiedArchive(abandoned, FOLDER)).toBe(true);
    const plan = filesToDelete({ files: [abandoned, unrelated], folderId: FOLDER });
    expect(plan.delete.map((item) => item.id)).toEqual(["pending"]);
    expect(plan.warnings).toEqual([]);
  });
});
