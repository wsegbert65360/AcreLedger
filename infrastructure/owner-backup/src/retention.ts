import { APPLICATION_ID, DAILY_RETENTION, MONTHLY_RETENTION, type DriveFileRecord } from "./types.js";

export function chicagoDate(now: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function chicagoMonth(now: Date): string {
  return chicagoDate(now).slice(0, 7);
}

export function isOwnedBackup(file: DriveFileRecord, folderId: string): boolean {
  return (
    file.appProperties?.application === APPLICATION_ID &&
    Boolean(file.appProperties?.manifest_id) &&
    Boolean(file.appProperties?.archive_sha256) &&
    file.appProperties?.verification_status === "success" &&
    (file.parents ?? []).includes(folderId) &&
    (file.name.endsWith(".tar.zst.age") || file.appProperties?.kind === "archive")
  );
}

export function isAbandonedUnverifiedArchive(file: DriveFileRecord, folderId: string): boolean {
  return (
    file.appProperties?.application === APPLICATION_ID &&
    Boolean(file.appProperties?.manifest_id) &&
    Boolean(file.appProperties?.archive_sha256) &&
    file.appProperties?.verification_status !== "success" &&
    (file.parents ?? []).includes(folderId) &&
    file.name.endsWith(".tar.zst.age")
  );
}

export function chooseRetentionTier(
  now: Date,
  existing: DriveFileRecord[],
  folderId: string,
): "daily" | "monthly" {
  const month = chicagoMonth(now);
  const hasMonthly = existing.some(
    (file) =>
      isOwnedBackup(file, folderId) &&
      file.appProperties?.retention_tier === "monthly" &&
      (file.appProperties.backup_time_utc ?? "").startsWith(month),
  );
  return hasMonthly ? "daily" : "monthly";
}

export function filesToDelete(options: {
  files: DriveFileRecord[];
  folderId: string;
  dailyLimit?: number;
  monthlyLimit?: number;
}): { keep: DriveFileRecord[]; delete: DriveFileRecord[]; warnings: string[] } {
  const dailyLimit = options.dailyLimit ?? DAILY_RETENTION;
  const monthlyLimit = options.monthlyLimit ?? MONTHLY_RETENTION;
  const warnings: string[] = [];
  const owned = options.files.filter((file) => isOwnedBackup(file, options.folderId));
  const abandoned = options.files.filter((file) => isAbandonedUnverifiedArchive(file, options.folderId));
  const malformed = options.files.filter(
    (file) =>
      file.appProperties?.application === APPLICATION_ID &&
      (file.parents ?? []).includes(options.folderId) &&
      !owned.includes(file) &&
      !abandoned.includes(file) &&
      file.name.endsWith(".tar.zst.age"),
  );
  if (malformed.length > 0) {
    warnings.push("Malformed backup metadata was left untouched.");
  }

  const byTime = (file: DriveFileRecord): string =>
    file.appProperties?.backup_time_utc || file.createdTime || "";

  const newestFirst = [...owned].sort((a, b) => byTime(b).localeCompare(byTime(a)));
  const lastKnownGood = newestFirst[0];
  const daily = newestFirst.filter((file) => file.appProperties?.retention_tier === "daily");
  const monthly = newestFirst.filter((file) => file.appProperties?.retention_tier === "monthly");

  const deleteSet = new Set<string>();
  for (const file of abandoned) deleteSet.add(file.id);
  for (const file of daily.slice(dailyLimit)) deleteSet.add(file.id);
  for (const file of monthly.slice(monthlyLimit)) deleteSet.add(file.id);
  if (lastKnownGood) deleteSet.delete(lastKnownGood.id);

  return {
    keep: newestFirst.filter((file) => !deleteSet.has(file.id)),
    delete: options.files.filter((file) => deleteSet.has(file.id)),
    warnings,
  };
}
