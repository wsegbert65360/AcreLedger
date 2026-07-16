import { describe, expect, it } from 'vitest';
import { CURRENT_BACKUP_VERSION, normalizeBackupForRestore } from '@/lib/backupCompatibility';
import { backupSchema } from '@/lib/backupSchema';

describe('normalizeBackupForRestore', () => {
  it('repairs legacy zero activity acreage from CLU acreage without mutating the input', () => {
    const legacy = {
      fields: [{ id: 'field-1', name: 'North', acreage: 80, farm_id: 'old-farm', deleted_at: null }],
      cluAssignments: [{
        id: 'assignment-1', farmId: 'old-farm', fieldId: 'field-1', tractKey: '1-1', cluNumber: '10',
        acres: 42.5, assignedAt: '2026-01-01T00:00:00.000Z', deletedAt: null,
      }],
      plantRecords: [{ id: 'plant-1', fieldId: 'field-1', acreage: 0, seasonYear: 2025, farm_id: 'old-farm' }],
      fertilizerApplications: [{ id: 'fert-1', fieldId: 'field-1', acres: 0, seasonYear: 2025, farm_id: 'old-farm' }],
      sprayRecords: [{
        id: 'spray-1', fieldId: 'field-1', treatedAreaSize: 0, applicationRate: '22', rateUnit: 'oz/ac',
        seasonYear: 2025, farm_id: 'old-farm',
      }],
    };

    const normalized = normalizeBackupForRestore(legacy) as any;

    expect(legacy.plantRecords[0].acreage).toBe(0);
    expect(normalized.cluAssignments[0].landUse).toBe('cropland');
    expect(normalized.plantRecords[0].acreage).toBe(42.5);
    expect(normalized.fertilizerApplications[0].acres).toBe(42.5);
    expect(normalized.sprayRecords[0].treatedAreaSize).toBeUndefined();
    expect(normalized.sprayRecords[0].applicationRate).toBeUndefined();
    expect(() => backupSchema.parse(normalized)).not.toThrow();
  });

  it('recovers a zero CLU assignment from the matching tract feature', () => {
    const normalized = normalizeBackupForRestore({
      fsaTracts: [{
        id: 'tract-1', farmId: 'farm-1', tractKey: '1-1', filename: 'tract.json', featureCount: 1,
        importedAt: '2026-01-01T00:00:00.000Z', deletedAt: null,
        geojson: {
          type: 'FeatureCollection',
          features: [{
            type: 'Feature',
            geometry: { type: 'Polygon', coordinates: [[[-93, 41], [-92.99, 41], [-92.99, 41.01], [-93, 41]]] },
            properties: { cluNumber: '10', acres: 12.75 },
          }],
        },
      }],
      cluAssignments: [{
        id: 'assignment-1', farmId: 'farm-1', fieldId: 'field-1', tractKey: '1-1', cluNumber: '10',
        acres: 0, landUse: 'cropland', assignedAt: '2026-01-01T00:00:00.000Z', deletedAt: null,
      }],
    }) as any;

    expect(normalized.cluAssignments[0].acres).toBe(12.75);
    expect(() => backupSchema.parse(normalized)).not.toThrow();
  });

  it('accepts the current backup version', () => {
    expect(backupSchema.parse({ backupVersion: CURRENT_BACKUP_VERSION }).backupVersion).toBe(2);
  });
});
