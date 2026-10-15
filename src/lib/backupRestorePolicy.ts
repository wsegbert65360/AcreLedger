export type FarmRole = 'owner' | 'admin' | 'worker';

/** Shown before every restore. Deleted rows in the live book come back. */
export const RESTORE_RESURRECT_WARNING =
  'Records deleted after this backup was made will come back. Newer edits to those same records are replaced by the backup. Records that are not in this file stay in the book.';

/** Shown when the file is the automatic pre-rollover snapshot. */
export const PRE_SEASON_RESET_WARNING =
  'This pre-season snapshot undoes the season rollover. Everything entered since then gets rolled back: records added after the snapshot are removed, records deleted after it come back, and newer edits are replaced. If you leave the season checkbox on, the active season returns to the snapshot year.';

export const RESTORE_ROLE_DENIED =
  'Only the farm owner or an admin can restore a backup.';

/**
 * Owner and admin may restore. A worker may not.
 * Null means the role column is not loaded yet (or this database does not have
 * it yet). The server still rejects a worker once the migration is applied.
 */
export function canRestoreFarmBackup(role: string | null | undefined): boolean {
  if (role == null || role === '') return true;
  return role === 'owner' || role === 'admin';
}

export function readFarmRole(value: unknown): FarmRole | null {
  if (value === 'owner' || value === 'admin' || value === 'worker') return value;
  return null;
}

export function isPreSeasonResetBackup(
  fileName: string,
  backup: { rolloverDate?: string | null },
): boolean {
  if (/^Pre_Season_Reset_/i.test(fileName)) return true;
  return typeof backup.rolloverDate === 'string' && backup.rolloverDate.trim() !== '';
}

/** App backup keys that map to farm tables the pre-season undo may roll back. */
export const BACKUP_KEY_TO_TABLE = {
  fields: 'fields',
  bins: 'bins',
  plantRecords: 'plant_records',
  sprayRecords: 'spray_records',
  harvestRecords: 'harvest_records',
  hayHarvestRecords: 'hay_harvest_records',
  customSprayRecords: 'custom_spray_records',
  fertilizerApplications: 'fertilizer_applications',
  tillageRecords: 'tillage_records',
  grainMovements: 'grain_movements',
  savedSeeds: 'saved_seeds',
  fertilizerRecipes: 'fertilizer_recipes',
  sprayRecipes: 'spray_recipes',
  fsaTracts: 'fsa_tract_imports',
  cluAssignments: 'field_clu_assignments',
  workRequests: 'work_requests',
  equipment: 'equipment',
  maintenanceSchedules: 'maintenance_schedules',
  maintenanceLogs: 'maintenance_logs',
} as const;

export type BackupTableName = (typeof BACKUP_KEY_TO_TABLE)[keyof typeof BACKUP_KEY_TO_TABLE];

/** Tables whose arrays were actually present in the file. Missing keys are left alone. */
export function preSeasonRollbackTables(raw: unknown): BackupTableName[] {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return [];
  const record = raw as Record<string, unknown>;
  const tables: BackupTableName[] = [];
  for (const [key, table] of Object.entries(BACKUP_KEY_TO_TABLE)) {
    if (Object.prototype.hasOwnProperty.call(record, key) && Array.isArray(record[key])) {
      tables.push(table);
    }
  }
  return tables;
}
