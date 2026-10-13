import type { Equipment, MaintenanceLog, MaintenanceSchedule } from '@/types/equipment';
import type {
  Bin, CustomSprayRecord, FertilizerApplication, FertilizerRecipe, Field, GrainMovement,
  HarvestRecord, HayHarvestRecord, PlantRecord, SavedSeed, SprayRecipe, SprayRecord,
  TillageRecord, WorkRequest,
} from '@/types/farm';
import type { FieldCluAssignment, FsaTractImport } from '@/types/fsaTract';
import {
  mapBinToDb, mapCustomSprayToDb, mapEquipmentToDb, mapFertilizerRecipeToDb, mapFertilizerToDb,
  mapFieldCluAssignmentToDb, mapFieldToDb, mapFsaTractToDb, mapGrainToDb, mapHarvestToDb,
  mapHayToDb, mapMaintenanceLogToDb, mapMaintenanceScheduleToDb, mapPlantToDb, mapRecipeToDb,
  mapSeedToDb, mapSprayToDb, mapTillageToDb, mapWorkRequestToDb,
} from '@/lib/mappers';

const IDENTITY_KEYS = new Set(['id', 'farm_id']);

const SOURCE_KEY_ALIASES: Record<string, string[]> = {
  farm_id: ['farm_id', 'farmId'],
  deleted_at: ['deleted_at', 'deletedAt'],
  field_id: ['fieldId', 'field_id'],
  bin_id: ['binId', 'bin_id'],
  equipment_id: ['equipmentId', 'equipment_id'],
  schedule_id: ['scheduleId', 'schedule_id'],
  harvest_record_id: ['harvestRecordId', 'harvest_record_id'],
  tract_key: ['tractKey', 'tract_key'],
  clu_number: ['cluNumber', 'clu_number'],
  feature_count: ['featureCount'],
  imported_at: ['importedAt'],
  assigned_at: ['assignedAt'],
  land_use: ['landUse'],
  created_at: ['createdAt', 'created_at', 'timestamp'],
  updated_at: ['updatedAt', 'updated_at'],
  operational_acreage: ['boundaryAcreage', 'operational_acreage'],
  pic: ['pic', 'propertyIdentifiers'],
  fsa_farm_number: ['fsaFarmNumber', 'fsa_farm_number', 'propertyIdentifiers'],
  fsa_tract_number: ['fsaTractNumber', 'fsa_tract_number', 'propertyIdentifiers'],
  fsa_field_number: ['fsaFieldNumber', 'fsa_field_number', 'propertyIdentifiers'],
};

function snakeToCamel(snake: string): string {
  return snake.replace(/_([a-z0-9])/g, (_, char: string) => char.toUpperCase());
}

function sourceKeysFor(dbKey: string): string[] {
  return SOURCE_KEY_ALIASES[dbKey] ?? [snakeToCamel(dbKey), dbKey];
}

function sourceValue(source: Record<string, unknown>, dbKey: string): unknown {
  for (const key of sourceKeysFor(dbKey)) {
    if (source[key] !== undefined) return source[key];
  }
  return undefined;
}

/**
 * After a regular write mapper fills optional columns with null/defaults, drop
 * keys whose source property was undefined so restore SQL preserves existing
 * DB values. Timestamp is never replaced with now(). deleted_at stays explicit.
 */
export function omitUnspecifiedRestoreKeys(
  mapped: Record<string, unknown>,
  source: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [dbKey, value] of Object.entries(mapped)) {
    if (IDENTITY_KEYS.has(dbKey)) {
      out[dbKey] = value;
      continue;
    }
    if (dbKey === 'deleted_at') {
      const deleted = sourceValue(source, 'deleted_at');
      out.deleted_at = deleted === undefined ? null : deleted;
      continue;
    }
    if (dbKey === 'timestamp') {
      if (source.timestamp === undefined) continue;
      out.timestamp = value;
      continue;
    }
    if (sourceValue(source, dbKey) === undefined) continue;
    out[dbKey] = value;
  }
  return out;
}

function wrapRestoreMapper<T>(
  mapper: (row: T) => Record<string, unknown> | object,
): (row: T) => Record<string, unknown> {
  return (row) => omitUnspecifiedRestoreKeys(
    mapper(row) as Record<string, unknown>,
    row as unknown as Record<string, unknown>,
  );
}

export const mapFieldToDbForRestore = wrapRestoreMapper(mapFieldToDb);
export const mapBinToDbForRestore = wrapRestoreMapper(mapBinToDb);
export const mapPlantToDbForRestore = wrapRestoreMapper(mapPlantToDb);
export const mapSprayToDbForRestore = wrapRestoreMapper(mapSprayToDb);
export const mapHarvestToDbForRestore = wrapRestoreMapper(mapHarvestToDb);
export const mapHayToDbForRestore = wrapRestoreMapper(mapHayToDb);
export const mapCustomSprayToDbForRestore = wrapRestoreMapper(mapCustomSprayToDb);
export const mapFertilizerToDbForRestore = wrapRestoreMapper(mapFertilizerToDb);
export const mapTillageToDbForRestore = wrapRestoreMapper(mapTillageToDb);
export const mapGrainToDbForRestore = wrapRestoreMapper(mapGrainToDb);
export const mapSeedToDbForRestore = wrapRestoreMapper(mapSeedToDb);
export const mapFertilizerRecipeToDbForRestore = wrapRestoreMapper(mapFertilizerRecipeToDb);
export const mapRecipeToDbForRestore = wrapRestoreMapper(mapRecipeToDb);
export const mapFsaTractToDbForRestore = wrapRestoreMapper(mapFsaTractToDb);
export const mapFieldCluAssignmentToDbForRestore = wrapRestoreMapper(mapFieldCluAssignmentToDb);
export const mapWorkRequestToDbForRestore = wrapRestoreMapper(mapWorkRequestToDb);
export const mapEquipmentToDbForRestore = wrapRestoreMapper(mapEquipmentToDb);
export const mapMaintenanceScheduleToDbForRestore = wrapRestoreMapper(mapMaintenanceScheduleToDb);
export const mapMaintenanceLogToDbForRestore = wrapRestoreMapper(mapMaintenanceLogToDb);

export type RestoreField = Field;
export type RestoreSpray = SprayRecord;
export type RestorePlant = PlantRecord;
export type RestoreHarvest = HarvestRecord;
export type RestoreHay = HayHarvestRecord;
export type RestoreCustomSpray = CustomSprayRecord;
export type RestoreFertilizer = FertilizerApplication;
export type RestoreTillage = TillageRecord;
export type RestoreGrain = GrainMovement;
export type RestoreSeed = SavedSeed;
export type RestoreFertilizerRecipe = FertilizerRecipe;
export type RestoreSprayRecipe = SprayRecipe;
export type RestoreBin = Bin;
export type RestoreWorkRequest = WorkRequest;
export type RestoreEquipment = Equipment;
export type RestoreSchedule = MaintenanceSchedule;
export type RestoreLog = MaintenanceLog;
export type RestoreTract = FsaTractImport;
export type RestoreAssignment = FieldCluAssignment;
