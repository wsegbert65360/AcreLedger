import { describe, expect, it } from 'vitest';

import { mapFieldFromDb, mapFieldToDb, mapPlantFromDb, mapPlantToDb } from '../mappers';
import {
  getPropertyIdentifier,
  isValidPicFormat,
  migrateFsaToPropertyIdentifiers,
  syncFsaLegacyFields,
  upsertPropertyIdentifier,
} from '../propertyIdentifiers';

describe('migrateFsaToPropertyIdentifiers', () => {
  it('maps all three FSA numbers to us-fsa identifiers in order', () => {
    expect(
      migrateFsaToPropertyIdentifiers({ fsaFarmNumber: '1234', fsaTractNumber: '56', fsaFieldNumber: '7' }),
    ).toEqual([
      { scheme: 'us-fsa', kind: 'farm', value: '1234' },
      { scheme: 'us-fsa', kind: 'tract', value: '56' },
      { scheme: 'us-fsa', kind: 'field', value: '7' },
    ]);
  });

  it('skips empty and whitespace-only values and trims the rest', () => {
    expect(
      migrateFsaToPropertyIdentifiers({ fsaFarmNumber: ' 1234 ', fsaTractNumber: '', fsaFieldNumber: '   ' }),
    ).toEqual([{ scheme: 'us-fsa', kind: 'farm', value: '1234' }]);
    expect(migrateFsaToPropertyIdentifiers({})).toEqual([]);
    expect(
      migrateFsaToPropertyIdentifiers({ fsaFarmNumber: null, fsaTractNumber: null, fsaFieldNumber: null }),
    ).toEqual([]);
  });

  it('is idempotent: re-migrating synced fields yields the same identifiers', () => {
    const source = { fsaFarmNumber: '1234', fsaTractNumber: '56', fsaFieldNumber: '7' };
    const once = migrateFsaToPropertyIdentifiers(source);
    const synced = syncFsaLegacyFields({ ...source, propertyIdentifiers: once });
    expect(migrateFsaToPropertyIdentifiers(synced)).toEqual(once);
  });
});

describe('getPropertyIdentifier / upsertPropertyIdentifier', () => {
  const ids = migrateFsaToPropertyIdentifiers({ fsaFarmNumber: '1234', fsaTractNumber: '56' });

  it('finds values by scheme and kind', () => {
    expect(getPropertyIdentifier(ids, 'us-fsa', 'farm')).toBe('1234');
    expect(getPropertyIdentifier(ids, 'us-fsa', 'tract')).toBe('56');
    expect(getPropertyIdentifier(ids, 'us-fsa', 'field')).toBeUndefined();
    expect(getPropertyIdentifier(ids, 'au-pic', 'property')).toBeUndefined();
    expect(getPropertyIdentifier(undefined, 'us-fsa', 'farm')).toBeUndefined();
  });

  it('upserts without mutating the input', () => {
    const withPic = upsertPropertyIdentifier(ids, { scheme: 'au-pic', kind: 'property', value: 'NABC1234' });
    expect(withPic).toHaveLength(3);
    expect(getPropertyIdentifier(withPic, 'au-pic', 'property')).toBe('NABC1234');
    expect(ids).toHaveLength(2);

    const replaced = upsertPropertyIdentifier(withPic, { scheme: 'us-fsa', kind: 'farm', value: '9999' });
    expect(replaced).toHaveLength(3);
    expect(getPropertyIdentifier(replaced, 'us-fsa', 'farm')).toBe('9999');
    expect(getPropertyIdentifier(replaced, 'au-pic', 'property')).toBe('NABC1234');
  });
});

describe('syncFsaLegacyFields (read-compat shim)', () => {
  it('prefers us-fsa identifiers when present', () => {
    const synced = syncFsaLegacyFields({
      fsaFarmNumber: 'old',
      propertyIdentifiers: migrateFsaToPropertyIdentifiers({ fsaFarmNumber: '1234', fsaTractNumber: '56' }),
    });
    expect(synced).toEqual({ fsaFarmNumber: '1234', fsaTractNumber: '56', fsaFieldNumber: undefined });
  });

  it('falls back to the record fsa* fields when no identifiers exist', () => {
    expect(syncFsaLegacyFields({ fsaFarmNumber: '1234', fsaTractNumber: '  ' })).toEqual({
      fsaFarmNumber: '1234',
      fsaTractNumber: undefined,
      fsaFieldNumber: undefined,
    });
    expect(syncFsaLegacyFields({})).toEqual({
      fsaFarmNumber: undefined,
      fsaTractNumber: undefined,
      fsaFieldNumber: undefined,
    });
  });
});

describe('isValidPicFormat', () => {
  it.each(['NABC1234', 'QABC1234', 'VIC12345', 'nabc1234'])('accepts %s', pic => {
    expect(isValidPicFormat(pic)).toBe(true);
  });

  it.each(['', 'ABC', 'NABC123456789', '12345678', 'N ABC1234'])('rejects %s', pic => {
    expect(isValidPicFormat(pic)).toBe(false);
  });
});

describe('mapper property-identifier sync', () => {
  it('populates propertyIdentifiers when reading a field from the DB', () => {
    const field = mapFieldFromDb({
      id: 'f1', farm_id: 'farm-1', name: 'North 40', acreage: 40,
      lat: null, lng: null,
      fsa_farm_number: '1234', fsa_tract_number: '56', fsa_field_number: '7',
      deleted_at: null,
    } as any);

    expect(field.fsaFarmNumber).toBe('1234');
    expect(field.propertyIdentifiers).toEqual([
      { scheme: 'us-fsa', kind: 'farm', value: '1234' },
      { scheme: 'us-fsa', kind: 'tract', value: '56' },
      { scheme: 'us-fsa', kind: 'field', value: '7' },
    ]);
  });

  it('round-trips FSA numbers through propertyIdentifiers without loss', () => {
    const db = mapFieldToDb({
      id: 'f1', farm_id: 'farm-1', name: 'North 40', acreage: 40,
      lat: null, lng: null, deleted_at: null,
      propertyIdentifiers: [
        { scheme: 'us-fsa', kind: 'farm', value: '1234' },
        { scheme: 'us-fsa', kind: 'tract', value: '56' },
        { scheme: 'us-fsa', kind: 'field', value: '7' },
        { scheme: 'au-pic', kind: 'property', value: 'NABC1234' },
      ],
    });

    expect(db.fsa_farm_number).toBe('1234');
    expect(db.fsa_tract_number).toBe('56');
    expect(db.fsa_field_number).toBe('7');

    const reread = mapFieldFromDb(db as any);
    expect(reread.propertyIdentifiers).toEqual([
      { scheme: 'us-fsa', kind: 'farm', value: '1234' },
      { scheme: 'us-fsa', kind: 'tract', value: '56' },
      { scheme: 'us-fsa', kind: 'field', value: '7' },
    ]);
  });

  it('keeps the legacy fsa* write path working when identifiers are absent', () => {
    const db = mapPlantToDb({
      id: 'p1', farm_id: 'farm-1', fieldId: 'f1', fieldName: 'North 40',
      seedVariety: 'Corn', acreage: 40, timestamp: Date.now(), seasonYear: 2026,
      deleted_at: null, fsaFarmNumber: '1234',
    } as any);

    expect(db.fsa_farm_number).toBe('1234');
    const reread = mapPlantFromDb(db as any);
    expect(reread.fsaFarmNumber).toBe('1234');
    expect(getPropertyIdentifier(reread.propertyIdentifiers, 'us-fsa', 'farm')).toBe('1234');
  });
});
