import { describe, it, expect } from 'vitest';

import {
  buildFieldActivityStatusMap,
  parseSearchQuery,
  fieldMatchesQuery,
  type FieldActivityStatus,
  type ActivityRecords,
} from '../fieldSearch';
import type { Field } from '@/types/farm';

const makeFields = (ids: string[]): Pick<Field, 'id'>[] => ids.map(id => ({ id }));

const emptyStatus: FieldActivityStatus = {
  planted: false,
  sprayed: 0,
  fertilized: 0,
  harvested: 0,
  hayed: 0,
};

const makeRecords = (overrides: Partial<ActivityRecords> = {}): ActivityRecords => ({
  plantRecords: [],
  sprayRecords: [],
  fertilizerApplications: [],
  harvestRecords: [],
  hayHarvestRecords: [],
  ...overrides,
});

describe('buildFieldActivityStatusMap', () => {
  it('returns an empty map for no fields', () => {
    const map = buildFieldActivityStatusMap([], makeRecords(), 2026);
    expect(map.size).toBe(0);
  });

  it('initializes every field with zeroed status', () => {
    const map = buildFieldActivityStatusMap(makeFields(['a', 'b']), makeRecords(), 2026);
    expect(map.get('a')).toEqual(emptyStatus);
    expect(map.get('b')).toEqual(emptyStatus);
  });

  it('counts only records matching the viewing season', () => {
    const map = buildFieldActivityStatusMap(
      makeFields(['a']),
      makeRecords({
        plantRecords: [
          { fieldId: 'a', seasonYear: 2026 },
          { fieldId: 'a', seasonYear: 2025 },
        ],
        sprayRecords: [
          { fieldId: 'a', seasonYear: 2026 },
          { fieldId: 'a', seasonYear: 2026 },
        ],
      }),
      2026,
    );
    expect(map.get('a')).toEqual({ ...emptyStatus, planted: true, sprayed: 2 });
  });

  it('ignores records for unknown field ids', () => {
    const map = buildFieldActivityStatusMap(
      makeFields(['a']),
      makeRecords({ sprayRecords: [{ fieldId: 'unknown', seasonYear: 2026 }] }),
      2026,
    );
    expect(map.get('a')).toEqual(emptyStatus);
  });
});

describe('parseSearchQuery', () => {
  it('returns empty terms and statuses for blank input', () => {
    expect(parseSearchQuery('')).toEqual({ nameTerms: [], statuses: [] });
    expect(parseSearchQuery('   ')).toEqual({ nameTerms: [], statuses: [] });
  });

  it('treats unrecognized tokens as name terms', () => {
    expect(parseSearchQuery('north 40')).toEqual({ nameTerms: ['north', '40'], statuses: [] });
  });

  it('recognizes single-word status keywords', () => {
    expect(parseSearchQuery('planted')).toEqual({ nameTerms: [], statuses: ['planted'] });
    expect(parseSearchQuery('sprayed')).toEqual({ nameTerms: [], statuses: ['sprayed'] });
    expect(parseSearchQuery('fertilized')).toEqual({ nameTerms: [], statuses: ['fertilized'] });
    expect(parseSearchQuery('harvested')).toEqual({ nameTerms: [], statuses: ['harvested'] });
    expect(parseSearchQuery('hayed')).toEqual({ nameTerms: [], statuses: ['hayed'] });
  });

  it('recognizes "not" + status as a negation', () => {
    expect(parseSearchQuery('not planted')).toEqual({ nameTerms: [], statuses: ['not-planted'] });
    expect(parseSearchQuery('not sprayed')).toEqual({ nameTerms: [], statuses: ['not-sprayed'] });
  });

  it('recognizes the "un" prefix antonyms', () => {
    expect(parseSearchQuery('unplanted')).toEqual({ nameTerms: [], statuses: ['not-planted'] });
    expect(parseSearchQuery('unsprayed')).toEqual({ nameTerms: [], statuses: ['not-sprayed'] });
  });

  it('splits mixed name fragments and status keywords', () => {
    expect(parseSearchQuery('north not planted')).toEqual({
      nameTerms: ['north'],
      statuses: ['not-planted'],
    });
  });

  it('strips common punctuation', () => {
    expect(parseSearchQuery('north, planted; sprayed. fertilized:')).toEqual({
      nameTerms: ['north'],
      statuses: ['planted', 'sprayed', 'fertilized'],
    });
  });

  it('treats "not" without a recognizable next word as a name fragment', () => {
    expect(parseSearchQuery('not a field')).toEqual({
      nameTerms: ['not', 'a', 'field'],
      statuses: [],
    });
  });
});

describe('fieldMatchesQuery', () => {
  it('returns true for an empty query', () => {
    expect(fieldMatchesQuery('North 40', emptyStatus, { nameTerms: [], statuses: [] })).toBe(true);
  });

  it('matches when all name terms appear in the field name', () => {
    const query = parseSearchQuery('north');
    expect(fieldMatchesQuery('North 40', emptyStatus, query)).toBe(true);
    expect(fieldMatchesQuery('South 40', emptyStatus, query)).toBe(false);
  });

  it('requires every name term to be present', () => {
    const query = parseSearchQuery('north 40');
    expect(fieldMatchesQuery('North 40', emptyStatus, query)).toBe(true);
    expect(fieldMatchesQuery('North 80', emptyStatus, query)).toBe(false);
  });

  it('matches status filters against the activity status', () => {
    const query = parseSearchQuery('planted');
    expect(fieldMatchesQuery('Any', { ...emptyStatus, planted: true }, query)).toBe(true);
    expect(fieldMatchesQuery('Any', emptyStatus, query)).toBe(false);
  });

  it('matches negated status filters', () => {
    const query = parseSearchQuery('not sprayed');
    expect(fieldMatchesQuery('Any', emptyStatus, query)).toBe(true);
    expect(fieldMatchesQuery('Any', { ...emptyStatus, sprayed: 2 }, query)).toBe(false);
  });

  it('combines name and status filters', () => {
    const query = parseSearchQuery('north not planted');
    expect(fieldMatchesQuery('North 40', emptyStatus, query)).toBe(true);
    expect(fieldMatchesQuery('North 40', { ...emptyStatus, planted: true }, query)).toBe(false);
    expect(fieldMatchesQuery('South 40', emptyStatus, query)).toBe(false);
  });

  it('returns false for positive status filters when no status is provided', () => {
    const query = parseSearchQuery('planted');
    expect(fieldMatchesQuery('Any', undefined, query)).toBe(false);
  });

  it('returns true for negated status filters when no status is provided', () => {
    const query = parseSearchQuery('not planted');
    expect(fieldMatchesQuery('Any', undefined, query)).toBe(true);
  });
});
