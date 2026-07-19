import { calculateAcreage } from '@/lib/gisService';
import type { Field } from '@/types/farm';

export const CURRENT_BACKUP_VERSION = 2;

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function positiveNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;
}

function cloneBackup(rawData: unknown): unknown {
  if (typeof structuredClone === 'function') return structuredClone(rawData);
  return JSON.parse(JSON.stringify(rawData));
}

/**
 * Converts known legacy backup shapes into the current app shape before strict
 * validation. It only repairs values that older AcreLedger versions emitted;
 * negative and otherwise invalid values remain untouched so validation fails.
 */
export function normalizeBackupForRestore(rawData: unknown): unknown {
  const cloned = cloneBackup(rawData);
  if (!isRecord(cloned)) return cloned;

  const tracts = Array.isArray(cloned.fsaTracts) ? cloned.fsaTracts : [];
  const featureAcres = new Map<string, number>();

  for (const tract of tracts) {
    if (!isRecord(tract) || !isRecord(tract.geojson) || !Array.isArray(tract.geojson.features)) continue;
    const tractKey = typeof tract.tractKey === 'string' ? tract.tractKey : '';

    for (const feature of tract.geojson.features) {
      if (!isRecord(feature) || !isRecord(feature.properties) || !isRecord(feature.geometry)) continue;
      const cluNumber = typeof feature.properties.cluNumber === 'string' ? feature.properties.cluNumber : '';
      let acres = positiveNumber(feature.properties.acres);

      if (feature.properties.acres === 0) {
        const geometry = feature.geometry as NonNullable<Field['boundary']>;
        const calculated = calculateAcreage(geometry);
        if (calculated > 0) {
          feature.properties.acres = calculated;
          acres = calculated;
        }
      }

      if (tractKey && cluNumber && acres) featureAcres.set(`${tractKey}:${cluNumber}`, acres);
    }
  }

  const assignments = Array.isArray(cloned.cluAssignments) ? cloned.cluAssignments : [];
  const assignedAcresByField = new Map<string, number>();

  for (const assignment of assignments) {
    if (!isRecord(assignment)) continue;
    if (assignment.landUse == null) assignment.landUse = 'cropland';

    if (assignment.acres === 0) {
      const tractKey = typeof assignment.tractKey === 'string' ? assignment.tractKey : '';
      const cluNumber = typeof assignment.cluNumber === 'string' ? assignment.cluNumber : '';
      const recovered = featureAcres.get(`${tractKey}:${cluNumber}`);
      if (recovered) assignment.acres = recovered;
    }

    const fieldId = typeof assignment.fieldId === 'string' ? assignment.fieldId : '';
    const acres = positiveNumber(assignment.acres);
    const active = assignment.deletedAt == null && assignment.deleted_at == null;
    if (fieldId && acres && active && assignment.landUse !== 'non_cropland') {
      assignedAcresByField.set(fieldId, (assignedAcresByField.get(fieldId) ?? 0) + acres);
    }
  }

  const fieldAcres = new Map<string, number>();
  const fields = Array.isArray(cloned.fields) ? cloned.fields : [];
  for (const field of fields) {
    if (!isRecord(field) || typeof field.id !== 'string') continue;
    const assigned = assignedAcresByField.get(field.id);
    const fallback = positiveNumber(field.acreage);
    if (assigned || fallback) fieldAcres.set(field.id, assigned ?? fallback!);
  }

  const repairRequiredActivityAcres = (key: 'plantRecords' | 'fertilizerApplications', acresKey: 'acreage' | 'acres') => {
    const records = Array.isArray(cloned[key]) ? cloned[key] : [];
    for (const record of records) {
      if (!isRecord(record) || record[acresKey] !== 0 || typeof record.fieldId !== 'string') continue;
      const recovered = fieldAcres.get(record.fieldId);
      if (recovered) record[acresKey] = recovered;
    }
  };

  repairRequiredActivityAcres('plantRecords', 'acreage');
  repairRequiredActivityAcres('fertilizerApplications', 'acres');

  const sprays = Array.isArray(cloned.sprayRecords) ? cloned.sprayRecords : [];
  for (const spray of sprays) {
    if (!isRecord(spray)) continue;
    if (spray.treatedAreaSize === 0) delete spray.treatedAreaSize;
    // These were emitted by early universal-spray backups but no longer map to
    // database columns; product-level rates are preserved in `products`.
    delete spray.applicationRate;
    delete spray.rateUnit;
  }

  return cloned;
}
