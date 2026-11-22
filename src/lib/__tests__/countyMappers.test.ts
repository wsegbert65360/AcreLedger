import { describe, expect, it } from 'vitest';
import { mapCountyAssignmentFromDb, mapCountyAssignmentToDb } from '../mappers';
import { row } from '../county/__tests__/fixtures';

describe('county assignment mappers', () => {
  it('round-trips a row through the DB shape', () => {
    const original = row({ id: 'r1', countyFips: '29083', mappedAcres: 12.34, proportion: 0.5 });
    const db = mapCountyAssignmentToDb(original);
    expect(db).toMatchObject({ farm_id: 'farm-a', county_fips: '29083', subject_type: 'field', mapped_acres: 12.34 });
    expect(mapCountyAssignmentFromDb(db)).toEqual(original);
  });

  it('maps numeric strings from Postgres and absent optionals to null', () => {
    const mapped = mapCountyAssignmentFromDb({
      id: 'r1', farm_id: 'f', subject_type: 'clu', subject_key: '1:2', method: 'unresolved',
      review_status: 'needs_review', calculated_at: '2026-01-01T00:00:00Z',
      mapped_acres: '4.5000' as unknown as number,
    });
    expect(mapped).toMatchObject({ mappedAcres: 4.5, countyFips: null, manualAcres: null, deletedAt: null, fieldId: null });
  });

  it('rejects a malformed FIPS or an out-of-range proportion', () => {
    expect(() => mapCountyAssignmentToDb(row({ countyFips: '83' }))).toThrow();
    expect(() => mapCountyAssignmentToDb(row({ proportion: 1.5 }))).toThrow();
  });

  it('requires identifiers', () => {
    expect(() => mapCountyAssignmentToDb(row({ farmId: '' }))).toThrow();
  });
});

describe('county assignments in the JSON backup', () => {
  it('round-trips a manual split through backup JSON and the restore mapper', async () => {
    const { backupSchema } = await import('../backupSchema');
    const manual = row({ id: 'm1', countyFips: '29015', countyName: 'Benton', method: 'manual', manualAcres: 45, reviewStatus: 'reviewed' });
    const parsed = backupSchema.parse(JSON.parse(JSON.stringify({ countyAssignments: [manual] })));
    expect(parsed.countyAssignments).toEqual([manual]);
    expect(mapCountyAssignmentToDb({ ...parsed.countyAssignments![0], farmId: 'restoring-farm' } as typeof manual))
      .toMatchObject({ id: 'm1', farm_id: 'restoring-farm', method: 'manual', manual_acres: 45, deleted_at: null });
  });
});
