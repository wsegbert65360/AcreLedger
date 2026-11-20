import { describe, expect, it } from 'vitest';
import type { Field } from '@/types/farm';
import type { FieldCluAssignment } from '@/types/fsaTract';
import { collectCountySubjects, planCountyAssignments, buildManualRows, buildRestoreAutomatic, planHasChanges, subjectGeometryHash, type CountySubject } from '../plan';
import { buildCountyIndex, cluSubjectKey, resolveFieldCountyShares } from '../resolve';
import type { CountyAssignment } from '../types';
import { ACROSS_LINE, BENTON, COUNTIES, HENRY, IN_BENTON, IN_HENRY, row } from './fixtures';

const NOW = '2026-11-19T00:00:00.000Z';
const mkIds = () => { let n = 0; return () => `id-${++n}`; };

const field = (over: Partial<Field> = {}): Field => ({
  id: 'field-1', name: 'Home', acreage: 10, lat: null, lng: null, farm_id: 'farm-a', boundary: IN_HENRY, ...over,
} as Field);

function plan(subjects: CountySubject[], existing: CountyAssignment[] = [], over: Partial<Parameters<typeof planCountyAssignments>[0]> = {}) {
  return planCountyAssignments({
    farmId: 'farm-a', subjects, existing, counties: COUNTIES,
    loadedTractKeys: new Set(), activeFieldIds: new Set(subjects.filter(s => s.type === 'field').map(s => s.key)),
    mode: 'sync', now: NOW, newId: mkIds(), ...over,
  });
}

const subjectsOf = (fields: Field[]) => collectCountySubjects({ fields, tractCollections: [] }).subjects;

function apply(existing: CountyAssignment[], p: ReturnType<typeof plan>): CountyAssignment[] {
  const byId = new Map(existing.map(r => [r.id, r]));
  for (const r of p.softDeletes) byId.set(r.id, r);
  for (const r of p.upserts) byId.set(r.id, r);
  return [...byId.values()];
}

describe('planCountyAssignments', () => {
  it('creates one row for a field inside a single county', () => {
    const p = plan(subjectsOf([field()]));
    expect(p.upserts).toHaveLength(1);
    expect(p.upserts[0]).toMatchObject({ countyFips: '29083', method: 'geometry', reviewStatus: 'ok', manualAcres: null });
    expect(p.counts.create).toBe(1);
  });

  it('splits a field that crosses a county line, proportions summing to 1', () => {
    const p = plan(subjectsOf([field({ boundary: ACROSS_LINE, acreage: 55 })]));
    expect(p.upserts.map(r => r.countyFips).sort()).toEqual(['29015', '29083']);
    expect(p.upserts.reduce((s, r) => s + (r.proportion ?? 0), 0)).toBeCloseTo(1, 6);
    const henry = p.upserts.find(r => r.countyFips === '29083')!;
    expect(henry.proportion).toBeGreaterThan(0.7);
  });

  it('is repeatable: applying twice creates no duplicates and no further changes', () => {
    const subjects = subjectsOf([field({ boundary: ACROSS_LINE })]);
    const first = plan(subjects);
    const rows = apply([], first);
    const second = plan(subjects, rows);
    expect(planHasChanges(second)).toBe(false);
    expect(second.counts.unchanged).toBe(1);
    const recalc = plan(subjects, rows, { mode: 'recalculate' });
    expect(planHasChanges(recalc)).toBe(false);
    expect(apply(rows, recalc).filter(r => !r.deletedAt)).toHaveLength(2);
  });

  it('keeps the same row ids when a recalculation changes the numbers', () => {
    const subjects = subjectsOf([field({ boundary: ACROSS_LINE })]);
    const rows = apply([], plan(subjects));
    const stale = rows.map(r => ({ ...r, mappedAcres: 1, datasetVersion: 'old' }));
    const p = plan(subjects, stale, { mode: 'recalculate' });
    expect(p.upserts.map(r => r.id).sort()).toEqual(rows.map(r => r.id).sort());
  });

  it('marks missing, invalid and unusable geometry unresolved instead of guessing', () => {
    const none = plan(subjectsOf([field({ boundary: undefined })]));
    expect(none.counts.unresolved).toBe(1);
    expect(none.upserts[0]).toMatchObject({ method: 'unresolved', countyFips: null, reviewStatus: 'needs_review' });
    const bad = plan(subjectsOf([field({ boundary: { type: 'Polygon', coordinates: [[[0, 0], [1, 1]]] } as Field['boundary'] })]));
    expect(bad.upserts[0].method).toBe('unresolved');
  });

  it('uses a location point only provisionally and flags it for review', () => {
    const p = plan(subjectsOf([field({ boundary: undefined, lat: 38.40, lng: -93.70 })]));
    expect(p.upserts[0]).toMatchObject({ method: 'centroid', countyFips: '29083', reviewStatus: 'needs_review' });
  });

  it('defers instead of writing when boundary data is unavailable', () => {
    const p = plan(subjectsOf([field()]), [], { counties: null });
    expect(p.counts.deferred).toBe(1);
    expect(p.upserts).toHaveLength(0);
  });

  it('keeps a manual correction through recalculation', () => {
    const subjects = subjectsOf([field({ boundary: ACROSS_LINE, acreage: 55 })]);
    const manual = buildManualRows({
      farmId: 'farm-a', subject: subjects[0], now: NOW, newId: mkIds(), existing: [],
      split: [{ county: HENRY, acres: 10 }, { county: BENTON, acres: 45 }],
    });
    const rows = apply([], { ...plan([]), upserts: manual.upserts, softDeletes: manual.softDeletes });
    const p = plan(subjects, rows, { mode: 'recalculate' });
    expect(p.counts['preserve-manual']).toBe(1);
    expect(planHasChanges(p)).toBe(false);
  });

  it('flags a manual correction for review when the geometry changes, without replacing it', () => {
    const original = subjectsOf([field({ boundary: ACROSS_LINE, acreage: 55 })]);
    const manual = buildManualRows({
      farmId: 'farm-a', subject: original[0], now: NOW, newId: mkIds(), existing: [],
      split: [{ county: HENRY, acres: 10 }, { county: BENTON, acres: 45 }],
    });
    const edited = subjectsOf([field({ boundary: IN_HENRY, acreage: 10 })]);
    const p = plan(edited, manual.upserts);
    expect(p.counts['flag-review']).toBe(1);
    expect(p.upserts.every(r => r.method === 'manual' && r.reviewStatus === 'needs_review' && r.manualAcres != null)).toBe(true);
    expect(p.softDeletes).toHaveLength(0);
    // Flagging is stable: a second pass changes nothing.
    const again = plan(edited, apply(manual.upserts, p));
    expect(planHasChanges(again)).toBe(false);
  });

  it('restores automatic by retiring manual rows, after which the planner recalculates', () => {
    const subjects = subjectsOf([field({ boundary: ACROSS_LINE, acreage: 55 })]);
    const manual = buildManualRows({
      farmId: 'farm-a', subject: subjects[0], now: NOW, newId: mkIds(), existing: [],
      split: [{ county: HENRY, acres: 10 }, { county: BENTON, acres: 45 }],
    });
    const retired = buildRestoreAutomatic(manual.upserts, NOW);
    expect(retired.every(r => r.deletedAt === NOW)).toBe(true);
    const state = [...retired];
    const p = plan(subjects, state);
    expect(p.upserts.every(r => r.method === 'geometry')).toBe(true);
    expect(p.upserts).toHaveLength(2);
  });

  it('retires rows for a field that is no longer active and for a CLU missing from a loaded tract', () => {
    const fieldRow = row({ id: 'r-field', subjectKey: 'gone', fieldId: 'gone' });
    const cluRow = row({ id: 'r-clu', subjectType: 'clu', subjectKey: '1:9', fieldId: null, tractKey: '1', cluNumber: '9' });
    const p = plan([], [fieldRow, cluRow], { loadedTractKeys: new Set(['1']), activeFieldIds: new Set() });
    expect(p.counts.remove).toBe(2);
    expect(p.softDeletes.map(r => r.id).sort()).toEqual(['r-clu', 'r-field']);
  });

  it('does not retire CLU rows of a tract that was not loaded', () => {
    const cluRow = row({ id: 'r-clu', subjectType: 'clu', subjectKey: '1:9', fieldId: null, tractKey: '1', cluNumber: '9' });
    const p = plan([], [cluRow]);
    expect(p.softDeletes).toHaveLength(0);
  });

  it('never touches another farm\'s rows', () => {
    const other = row({ id: 'other', farmId: 'farm-b', subjectKey: 'field-1' });
    const p = plan(subjectsOf([field()]), [other]);
    expect(p.softDeletes).toHaveLength(0);
    expect(p.upserts).toHaveLength(1);
    expect(p.upserts[0].farmId).toBe('farm-a');
    expect(p.upserts[0].id).not.toBe('other');
  });

  it('handles several tracts and CLUs, deduplicating a CLU repeated across collections', () => {
    const feature = (clu: string, coords: number[][][]) => ({
      type: 'Feature' as const, properties: { cluNumber: clu, acres: 10 }, geometry: { type: 'Polygon' as const, coordinates: coords },
    });
    const { subjects, loadedTractKeys } = collectCountySubjects({
      fields: [],
      tractCollections: [
        { tractKey: '100', collection: { type: 'FeatureCollection', features: [feature('1', IN_HENRY.coordinates), feature('1', IN_HENRY.coordinates), feature('2', IN_BENTON.coordinates)] } },
        { tractKey: '200', collection: { type: 'FeatureCollection', features: [feature('1', ACROSS_LINE.coordinates)] } },
      ],
    } as never);
    expect(subjects.map(s => s.key)).toEqual(['100:1', '100:2', '200:1']);
    expect([...loadedTractKeys]).toEqual(['100', '200']);
    const p = plan(subjects, [], { loadedTractKeys });
    expect(p.upserts.filter(r => r.subjectKey === '200:1')).toHaveLength(2);
    expect(p.upserts.filter(r => r.subjectKey === '100:2')[0].countyFips).toBe('29015');
  });

  it('hashes geometry stably and returns null for nothing usable', () => {
    expect(subjectGeometryHash(subjectsOf([field()])[0])).toBe(subjectGeometryHash(subjectsOf([field()])[0]));
    expect(subjectGeometryHash(subjectsOf([field({ boundary: undefined })])[0])).toBeNull();
  });
});

describe('resolveFieldCountyShares', () => {
  const clu = (tractKey: string, cluNumber: string, acres: number, fieldId = 'field-1'): FieldCluAssignment => ({
    id: `${tractKey}-${cluNumber}`, farmId: 'farm-a', fieldId, tractKey, cluNumber, acres,
    landUse: 'cropland', assignedAt: NOW, deletedAt: null,
  });
  const f = { id: 'field-1', acreage: 55, boundaryAcreage: undefined };

  it('prefers the field boundary over its tract\'s county split', () => {
    const rows = [
      row({ id: 'a', subjectKey: 'field-1', countyFips: '29083', mappedAcres: 55, proportion: 1 }),
      row({ id: 'b', subjectType: 'clu', subjectKey: '100:1', fieldId: null, tractKey: '100', cluNumber: '1', countyFips: '29083', proportion: 0.5, mappedAcres: 20 }),
      row({ id: 'c', subjectType: 'clu', subjectKey: '100:1', fieldId: null, tractKey: '100', cluNumber: '1', countyFips: '29015', proportion: 0.5, mappedAcres: 20 }),
    ];
    const shares = resolveFieldCountyShares(f, [clu('100', '1', 55)], buildCountyIndex(rows));
    expect(shares.basis).toBe('field-geometry');
    expect(shares.shares).toHaveLength(1);
    expect(shares.estimated).toBe(false);
  });

  it('uses CLU geometry weighted by assigned acres when the field has no boundary', () => {
    const rows = [
      row({ id: 'a', subjectType: 'clu', subjectKey: '100:1', fieldId: null, tractKey: '100', cluNumber: '1', countyFips: '29083', mappedAcres: 30, proportion: 1 }),
      row({ id: 'b', subjectType: 'clu', subjectKey: '100:2', fieldId: null, tractKey: '100', cluNumber: '2', countyFips: '29015', mappedAcres: 10, proportion: 1 }),
    ];
    const out = resolveFieldCountyShares(f, [clu('100', '1', 30), clu('100', '2', 10)], buildCountyIndex(rows));
    expect(out.basis).toBe('clu-geometry');
    expect(out.shares.map(s => [s.countyFips, Math.round(s.fraction * 100)])).toEqual([['29083', 75], ['29015', 25]]);
    expect(out.shares.reduce((s, x) => s + x.fraction, 0)).toBeCloseTo(1, 9);
  });

  it('lets a manual field correction override geometry', () => {
    const rows = [
      row({ id: 'a', subjectKey: 'field-1', countyFips: '29083', method: 'manual', manualAcres: 10, proportion: 10 / 55, mappedAcres: null }),
      row({ id: 'b', subjectKey: 'field-1', countyFips: '29015', countyName: 'Benton', method: 'manual', manualAcres: 45, proportion: 45 / 55, mappedAcres: null }),
    ];
    const out = resolveFieldCountyShares(f, [], buildCountyIndex(rows));
    expect(out.basis).toBe('manual');
    expect(out.shares.map(s => s.countyFips).sort()).toEqual(['29015', '29083']);
  });

  it('falls back to County unknown with no data', () => {
    const out = resolveFieldCountyShares(f, [], buildCountyIndex([]));
    expect(out.basis).toBe('unresolved');
    expect(out.shares).toEqual([{ countyFips: null, countyName: null, stateAbbr: null, fraction: 1 }]);
  });

  it('ignores retired rows and unassigned CLUs of other fields', () => {
    const rows = [row({ id: 'a', subjectType: 'clu', subjectKey: '100:1', fieldId: null, tractKey: '100', cluNumber: '1', deletedAt: NOW })];
    const out = resolveFieldCountyShares(f, [clu('100', '1', 30), clu('100', '2', 10, 'other')], buildCountyIndex(rows));
    expect(out.basis).toBe('unresolved');
    expect(cluSubjectKey('100', '1')).toBe('100:1');
  });
});

import { compareCountyToNotes, parseNotesCountyHints } from '../plan';

describe('notes are a review reference only', () => {
  const egbert = 'Behind Mefford on corner. About 10 ac Benton, 45 ac Henry';

  it('reads both note styles', () => {
    expect(parseNotesCountyHints(egbert).map(h => [h.countyName, h.acres])).toEqual([['Benton', 10], ['Henry', 45]]);
    expect(parseNotesCountyHints('10 ac in Benton County and 45 acres in Henry County')).toHaveLength(2);
  });

  it('flags a difference between the notes and the measured split, and accepts agreement', () => {
    const hints = parseNotesCountyHints(egbert);
    expect(compareCountyToNotes(hints, [{ countyName: 'Henry', acres: 54 }, { countyName: 'Benton', acres: 1 }]).differences.length).toBeGreaterThan(0);
    expect(compareCountyToNotes(hints, [{ countyName: 'Henry', acres: 44 }, { countyName: 'Benton', acres: 10.5 }]).differences).toEqual([]);
  });

  it('ignores a loose match that is not a county the farm has', () => {
    const hints = parseNotesCountyHints('Seeded 20 ac Corn last year');
    expect(compareCountyToNotes(hints, [{ countyName: 'Henry', acres: 20 }]).differences).toEqual([]);
  });

  it('never creates or changes an assignment', () => {
    const subjects = subjectsOf([field({ notes: egbert, boundary: IN_HENRY } as Partial<Field>)]);
    const p = plan(subjects);
    expect(p.upserts.map(r => r.countyFips)).toEqual(['29083']);
  });
});
