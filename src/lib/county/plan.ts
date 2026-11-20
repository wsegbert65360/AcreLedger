import type { Field } from '@/types/farm';
import type { KeyedTractCollection } from '@/lib/tractLookup';
import { roundTo } from '@/utils/numbers';
import { calculateCountyAssignment, type CountyCalculation } from './calculate';
import { geometryBounds, hashGeometry, hashPoint, normalizeGeometry, padBounds, unionBounds } from './geometry';
import { cluSubjectKey, fieldSubjectKey, subjectIndexKey } from './resolve';
import type { CountyAssignment, CountyBoundary, CountyBounds, CountySubjectType } from './types';

export interface CountySubject {
  type: CountySubjectType;
  key: string;
  label: string;
  fieldId: string | null;
  tractKey: string | null;
  cluNumber: string | null;
  geometry: unknown | null;
  point: { lat: number; lng: number } | null;
  /** The app's recorded acreage for this subject. Kept apart from mapped acres. */
  recordedAcres: number;
}

export function collectCountySubjects(input: {
  fields: Field[];
  tractCollections: KeyedTractCollection[];
}): { subjects: CountySubject[]; loadedTractKeys: Set<string> } {
  const subjects: CountySubject[] = [];
  for (const field of input.fields) {
    if (field.deleted_at) continue;
    const hasPoint = typeof field.lat === 'number' && typeof field.lng === 'number'
      && Number.isFinite(field.lat) && Number.isFinite(field.lng);
    subjects.push({
      type: 'field',
      key: fieldSubjectKey(field.id),
      label: field.name,
      fieldId: field.id,
      tractKey: null,
      cluNumber: null,
      geometry: field.boundary ?? null,
      point: hasPoint ? { lat: field.lat as number, lng: field.lng as number } : null,
      recordedAcres: field.boundaryAcreage && field.boundaryAcreage > 0 ? field.boundaryAcreage : field.acreage,
    });
  }
  const loadedTractKeys = new Set<string>();
  const seen = new Set<string>();
  for (const { tractKey, collection } of input.tractCollections) {
    loadedTractKeys.add(tractKey);
    for (const feature of collection.features) {
      const clu = feature.properties?.cluNumber;
      if (!clu) continue;
      const key = cluSubjectKey(tractKey, clu);
      if (seen.has(key)) continue;
      seen.add(key);
      subjects.push({
        type: 'clu',
        key,
        label: `Tract ${tractKey} CLU ${clu}`,
        fieldId: null,
        tractKey,
        cluNumber: clu,
        geometry: feature.geometry ?? null,
        point: null,
        recordedAcres: feature.properties.acres,
      });
    }
  }
  return { subjects, loadedTractKeys };
}

/** The subject for one field, built the same way the planner builds it. */
export function fieldCountySubject(field: Field): CountySubject | null {
  return collectCountySubjects({ fields: [field], tractCollections: [] }).subjects[0] ?? null;
}

/** Subjects for the CLUs of one imported tract. */
export function tractCountySubjects(tractKey: string, collection: KeyedTractCollection['collection']): CountySubject[] {
  return collectCountySubjects({ fields: [], tractCollections: [{ tractKey, collection }] }).subjects;
}

/** Area a subject covers, for deciding which county boundaries to load. Null when it has no usable location. */
export function subjectBounds(subject: Pick<CountySubject, 'geometry' | 'point'>): CountyBounds | null {
  const normalized = normalizeGeometry(subject.geometry);
  if (normalized.ok) return geometryBounds(normalized.value.geometry);
  const point = subject.point;
  if (point && Number.isFinite(point.lat) && Number.isFinite(point.lng) && !(point.lat === 0 && point.lng === 0)) {
    return { minLng: point.lng, minLat: point.lat, maxLng: point.lng, maxLat: point.lat };
  }
  return null;
}

/** One padded box around every subject; the padding catches counties just across a boundary line. */
export function subjectsBounds(subjects: CountySubject[]): CountyBounds | null {
  const all = subjects.map(subjectBounds).filter((b): b is CountyBounds => b !== null);
  const union = unionBounds(all);
  return union ? padBounds(union, 0.01) : null;
}

/** Hash of what a subject is calculated from, or null when there is nothing usable. */
export function subjectGeometryHash(subject: Pick<CountySubject, 'geometry' | 'point'>): string | null {
  if (subject.geometry != null) {
    const normalized = normalizeGeometry(subject.geometry);
    return normalized.ok ? hashGeometry(normalized.value.geometry) : null;
  }
  if (subject.point) return hashPoint(subject.point.lat, subject.point.lng);
  return null;
}

export type IdFactory = () => string;

const defaultNewId: IdFactory = () => globalThis.crypto.randomUUID();

export type SubjectAction =
  | 'create'
  | 'update'
  | 'unchanged'
  | 'preserve-manual'
  | 'flag-review'
  | 'unresolved'
  | 'deferred'
  | 'remove';

export interface SubjectPlan {
  subject: CountySubject;
  action: SubjectAction;
  reason: string;
  calculation: CountyCalculation | null;
  upserts: CountyAssignment[];
  softDeletes: CountyAssignment[];
}

export interface CountyPlan {
  plans: SubjectPlan[];
  upserts: CountyAssignment[];
  softDeletes: CountyAssignment[];
  counts: Record<SubjectAction, number>;
}

export type PlanMode = 'sync' | 'recalculate';

export interface PlanInput {
  farmId: string;
  subjects: CountySubject[];
  existing: CountyAssignment[];
  /** Counties covering the subjects; null when boundary data cannot be reached. */
  counties: CountyBoundary[] | null;
  /** Tracts whose CLU list was fully read; rows for CLUs missing from a loaded tract are removed. */
  loadedTractKeys: Set<string>;
  /** Field ids that exist and are active; rows of any other field are removed. */
  activeFieldIds: Set<string>;
  /**
   * sync: act only on subjects with no rows or whose geometry changed (runs on import, edit, sign-in).
   * recalculate: also re-measure unchanged subjects against current boundaries (explicit action).
   */
  mode: PlanMode;
  now: string;
  /** Id source for new rows; injectable so tests are deterministic. Defaults to a random UUID. */
  newId?: IdFactory;
}

const emptyCounts = (): Record<SubjectAction, number> => ({
  create: 0, update: 0, unchanged: 0, 'preserve-manual': 0, 'flag-review': 0,
  unresolved: 0, deferred: 0, remove: 0,
});

function sameRow(a: CountyAssignment, b: CountyAssignment): boolean {
  const close = (x: number | null, y: number | null, eps: number) =>
    (x == null && y == null) || (x != null && y != null && Math.abs(x - y) <= eps);
  return a.countyFips === b.countyFips
    && a.method === b.method
    && a.reviewStatus === b.reviewStatus
    && a.reviewReason === b.reviewReason
    && a.geometryHash === b.geometryHash
    && a.datasetVersion === b.datasetVersion
    && close(a.mappedAcres, b.mappedAcres, 1e-4)
    && close(a.proportion, b.proportion, 1e-6)
    && close(a.manualAcres, b.manualAcres, 1e-4);
}

function rowKey(row: Pick<CountyAssignment, 'countyFips'>): string {
  return row.countyFips ?? 'unresolved';
}

function baseRow(subject: CountySubject, farmId: string): Pick<
  CountyAssignment,
  'id' | 'farmId' | 'subjectType' | 'subjectKey' | 'fieldId' | 'tractKey' | 'cluNumber' | 'deletedAt'
> {
  return {
    id: '',
    farmId,
    subjectType: subject.type,
    subjectKey: subject.key,
    fieldId: subject.fieldId,
    tractKey: subject.tractKey,
    cluNumber: subject.cluNumber,
    deletedAt: null,
  };
}

function rowsFromCalculation(
  subject: CountySubject,
  farmId: string,
  calc: CountyCalculation,
  now: string,
  datasetFallback: { source: string | null; version: string | null },
): CountyAssignment[] {
  if (calc.kind === 'resolved') {
    return calc.rows.map(r => ({
      ...baseRow(subject, farmId),
      countyFips: r.county.fips,
      countyName: r.county.name,
      stateAbbr: r.county.stateAbbr,
      mappedAcres: r.mappedAcres,
      proportion: r.proportion,
      manualAcres: null,
      method: calc.method,
      reviewStatus: calc.needsReview ? 'needs_review' : 'ok',
      reviewReason: calc.needsReview ? calc.reviewReason : null,
      geometryHash: calc.geometryHash,
      datasetSource: r.county.datasetSource,
      datasetVersion: r.county.datasetVersion,
      calculatedAt: now,
    }));
  }
  if (calc.kind === 'unresolved') {
    return [{
      ...baseRow(subject, farmId),
      countyFips: null,
      countyName: null,
      stateAbbr: null,
      mappedAcres: null,
      proportion: null,
      manualAcres: null,
      method: 'unresolved',
      reviewStatus: 'needs_review',
      reviewReason: calc.reason,
      geometryHash: calc.geometryHash,
      datasetSource: datasetFallback.source,
      datasetVersion: datasetFallback.version,
      calculatedAt: now,
    }];
  }
  return [];
}

function finish(
  plan: Omit<SubjectPlan, 'upserts' | 'softDeletes'> & { desired?: CountyAssignment[]; obsolete?: CountyAssignment[] },
  existing: CountyAssignment[],
  now: string,
  newId: IdFactory,
): SubjectPlan {
  const desired = plan.desired ?? [];
  const existingByKey = new Map(existing.map(r => [rowKey(r), r]));
  const desiredKeys = new Set(desired.map(rowKey));
  const upserts: CountyAssignment[] = [];
  for (const row of desired) {
    const prior = existingByKey.get(rowKey(row));
    if (prior && sameRow(prior, row)) continue;
    upserts.push({ ...row, id: prior ? prior.id : newId() });
  }
  const softDeletes = (plan.obsolete ?? existing.filter(r => !desiredKeys.has(rowKey(r))))
    .map(r => ({ ...r, deletedAt: now }));
  return { subject: plan.subject, action: plan.action, reason: plan.reason, calculation: plan.calculation, upserts, softDeletes };
}

/**
 * Decides, for every subject, what the saved county rows should become. Pure: nothing is written.
 * The same function drives automatic recalculation, the backfill preview and the backfill apply,
 * so a preview shows exactly what applying will do.
 */
export function planCountyAssignments(input: PlanInput): CountyPlan {
  const { farmId, now } = input;
  const newId = input.newId ?? defaultNewId;
  const existingBySubject = new Map<string, CountyAssignment[]>();
  for (const row of input.existing) {
    if (row.deletedAt || row.farmId !== farmId) continue;
    const key = subjectIndexKey(row.subjectType, row.subjectKey);
    const list = existingBySubject.get(key) ?? [];
    list.push(row);
    existingBySubject.set(key, list);
  }

  const plans: SubjectPlan[] = [];
  const counts = emptyCounts();
  const counties = input.counties ?? [];
  const datasetFallback = {
    source: counties[0]?.datasetSource ?? null,
    version: counties[0]?.datasetVersion ?? null,
  };
  const handled = new Set<string>();

  for (const subject of input.subjects) {
    const indexKey = subjectIndexKey(subject.type, subject.key);
    handled.add(indexKey);
    const existing = existingBySubject.get(indexKey) ?? [];
    const manual = existing.filter(r => r.method === 'manual');
    const currentHash = subjectGeometryHash(subject);

    if (manual.length > 0) {
      const correctedHash = manual[0].geometryHash;
      const changed = correctedHash !== currentHash;
      const alreadyFlagged = manual.every(r => r.reviewStatus === 'needs_review');
      if (changed && !alreadyFlagged) {
        const flagged = manual.map(r => ({
          ...r,
          reviewStatus: 'needs_review' as const,
          reviewReason: 'Boundary changed after the manual county correction',
        }));
        plans.push(finish({
          subject, action: 'flag-review', calculation: null, desired: [...flagged],
          obsolete: [], reason: 'Geometry changed after a manual correction; correction kept and flagged',
        }, existing, now, newId));
      } else {
        plans.push(finish({
          subject, action: 'preserve-manual', calculation: null, desired: [], obsolete: [],
          reason: 'Manual correction kept',
        }, existing, now, newId));
      }
      continue;
    }

    const unchangedHash = existing.length > 0 && existing.every(r => r.geometryHash === currentHash);
    if (input.mode === 'sync' && unchangedHash) {
      plans.push(finish({
        subject, action: 'unchanged', calculation: null, desired: [], obsolete: [], reason: 'Geometry unchanged',
      }, existing, now, newId));
      continue;
    }

    const calc = calculateCountyAssignment({ geometry: subject.geometry, point: subject.point, counties });
    if (calc.kind === 'deferred') {
      plans.push(finish({
        subject, action: 'deferred', calculation: calc, desired: [], obsolete: [], reason: calc.reason,
      }, existing, now, newId));
      continue;
    }
    const desired = rowsFromCalculation(subject, farmId, calc, now, datasetFallback);
    const plan = finish({
      subject, action: 'unchanged', calculation: calc, desired, reason: '',
    }, existing, now, newId);
    if (plan.upserts.length === 0 && plan.softDeletes.length === 0) {
      plan.action = 'unchanged';
      plan.reason = 'Already up to date';
    } else if (calc.kind === 'unresolved') {
      plan.action = 'unresolved';
      plan.reason = calc.reason;
    } else {
      plan.action = existing.length === 0 ? 'create' : 'update';
      plan.reason = existing.length === 0 ? 'New county assignment' : 'Recalculated';
    }
    plans.push(plan);
  }

  // Rows whose subject is gone: a deleted field, or a CLU missing from a tract that was read in full.
  for (const [indexKey, rows] of existingBySubject) {
    if (handled.has(indexKey)) continue;
    const sample = rows[0];
    const gone = sample.subjectType === 'field'
      ? !input.activeFieldIds.has(sample.subjectKey)
      : !!sample.tractKey && input.loadedTractKeys.has(sample.tractKey);
    if (!gone) continue;
    plans.push({
      subject: {
        type: sample.subjectType, key: sample.subjectKey, label: sample.subjectKey,
        fieldId: sample.fieldId, tractKey: sample.tractKey, cluNumber: sample.cluNumber,
        geometry: null, point: null, recordedAcres: 0,
      },
      action: 'remove',
      reason: sample.subjectType === 'field' ? 'Field no longer active' : 'CLU no longer in the tract',
      calculation: null,
      upserts: [],
      softDeletes: rows.map(r => ({ ...r, deletedAt: now })),
    });
  }

  for (const plan of plans) counts[plan.action] += 1;
  return {
    plans,
    upserts: plans.flatMap(p => p.upserts),
    softDeletes: plans.flatMap(p => p.softDeletes),
    counts,
  };
}

export function planHasChanges(plan: CountyPlan): boolean {
  return plan.upserts.length > 0 || plan.softDeletes.length > 0;
}

/** A manual correction: set the county split for one subject. Replaces its automatic rows. */
export function buildManualRows(input: {
  farmId: string;
  subject: CountySubject;
  split: { county: Pick<CountyBoundary, 'fips' | 'name' | 'stateAbbr' | 'datasetSource' | 'datasetVersion'>; acres: number }[];
  existing: CountyAssignment[];
  now: string;
  newId?: IdFactory;
}): { upserts: CountyAssignment[]; softDeletes: CountyAssignment[] } {
  const total = input.split.reduce((sum, s) => sum + s.acres, 0);
  const geometryHash = subjectGeometryHash(input.subject);
  const newId = input.newId ?? defaultNewId;
  const priorByKey = new Map(input.existing.filter(r => !r.deletedAt).map(r => [rowKey(r), r]));
  const rows: CountyAssignment[] = input.split.map(s => ({
    ...baseRow(input.subject, input.farmId),
    id: priorByKey.get(s.county.fips)?.id ?? newId(),
    countyFips: s.county.fips,
    countyName: s.county.name,
    stateAbbr: s.county.stateAbbr,
    mappedAcres: null,
    proportion: total > 0 ? roundTo(s.acres / total, 6) : null,
    manualAcres: roundTo(s.acres, 2),
    method: 'manual',
    reviewStatus: 'ok',
    reviewReason: null,
    geometryHash,
    datasetSource: s.county.datasetSource,
    datasetVersion: s.county.datasetVersion,
    calculatedAt: input.now,
  }));
  const keep = new Set(rows.map(rowKey));
  const active = input.existing.filter(r => !r.deletedAt);
  return {
    upserts: rows,
    softDeletes: active.filter(r => !keep.has(rowKey(r))).map(r => ({ ...r, deletedAt: input.now })),
  };
}

/** Restore automatic calculation: drop the manual rows so the next plan recalculates this subject. */
export function buildRestoreAutomatic(existing: CountyAssignment[], now: string): CountyAssignment[] {
  return existing
    .filter(r => !r.deletedAt)
    .map(r => ({ ...r, deletedAt: now }));
}

/** Acknowledge a flagged assignment: record that it was reviewed against the current geometry. */
export function buildMarkReviewed(subject: CountySubject, existing: CountyAssignment[]): CountyAssignment[] {
  const geometryHash = subjectGeometryHash(subject);
  return existing.filter(r => !r.deletedAt).map(r => ({
    ...r,
    reviewStatus: 'reviewed' as const,
    reviewReason: null,
    geometryHash: r.method === 'manual' ? geometryHash : r.geometryHash,
  }));
}

export interface NotesCountyHint {
  countyName: string;
  acres: number;
  /** Matched from a bare "45 ac Henry" form; only trusted when the name is a county the farm already has. */
  loose?: boolean;
}

/**
 * Pulls "about 45 acres in Henry County" style statements out of free-form notes.
 * These are a review reference only: they never create or change an assignment.
 */
export function parseNotesCountyHints(notes: string | null | undefined): NotesCountyHint[] {
  if (!notes) return [];
  const hints = new Map<string, NotesCountyHint>();
  const patterns = [
    /(\d+(?:\.\d+)?)\s*(?:acres?|ac)\b\s+(?:in|within|of)\s+([A-Za-z][A-Za-z.'\- ]*?)\s+County\b/gi,
    /([A-Za-z][A-Za-z.'\- ]*?)\s+County\s*[:\-–]\s*(?:approx(?:imately)?\.?\s*|about\s*|~\s*)?(\d+(?:\.\d+)?)\s*(?:acres?|ac)\b/gi,
  ];
  patterns.forEach((pattern, i) => {
    for (const match of notes.matchAll(pattern)) {
      const acres = Number(i === 0 ? match[1] : match[2]);
      const name = (i === 0 ? match[2] : match[1]).trim().replace(/^(?:and|in|the)\s+/i, '');
      if (!Number.isFinite(acres) || acres <= 0 || !name) continue;
      hints.set(name.toLowerCase(), { countyName: name, acres });
    }
  });
  // "about 10 ac Benton, 45 ac Henry": a capitalised name straight after the acres, no word "County".
  for (const match of notes.matchAll(/(\d+(?:\.\d+)?)\s*(?:[Aa]cres?|[Aa]c)\.?\s+([A-Z][A-Za-z.'-]+)\b(?!\s+County)/g)) {
    const acres = Number(match[1]);
    const name = match[2];
    if (!Number.isFinite(acres) || acres <= 0 || hints.has(name.toLowerCase())) continue;
    hints.set(name.toLowerCase(), { countyName: name, acres, loose: true });
  }
  return [...hints.values()];
}

export interface NotesComparison {
  differences: string[];
}

/**
 * Compares measured county acres with what the notes say. Notes are approximate, so only a
 * missing county or a gap beyond max(2 ac, 20%) is raised.
 */
export function compareCountyToNotes(
  hints: NotesCountyHint[],
  measured: { countyName: string | null; acres: number }[],
  knownCountyNames: string[] = [],
): NotesComparison {
  const differences: string[] = [];
  const byName = new Map(measured.filter(m => m.countyName).map(m => [m.countyName!.toLowerCase(), m.acres]));
  const known = new Set([...knownCountyNames, ...measured.map(m => m.countyName ?? '')].filter(Boolean).map(n => n.toLowerCase()));
  // A loose match ("10 ac Corn") is ignored unless it names a county this farm actually has.
  hints = hints.filter(h => !h.loose || known.has(h.countyName.toLowerCase()));
  for (const hint of hints) {
    const acres = byName.get(hint.countyName.toLowerCase());
    if (acres == null) {
      differences.push(`Notes mention ${hint.countyName} County (${hint.acres} ac), but no ${hint.countyName} County acreage was measured`);
      continue;
    }
    const gap = Math.abs(acres - hint.acres);
    if (gap > Math.max(2, hint.acres * 0.2)) {
      differences.push(`${hint.countyName} County: notes say about ${hint.acres} ac, geometry measures ${roundTo(acres, 1)} ac`);
    }
  }
  const hinted = new Set(hints.map(h => h.countyName.toLowerCase()));
  if (hints.length > 0) {
    for (const m of measured) {
      if (m.countyName && !hinted.has(m.countyName.toLowerCase()) && m.acres > 2) {
        differences.push(`Geometry puts ${roundTo(m.acres, 1)} ac in ${m.countyName} County, which the notes do not mention`);
      }
    }
  }
  return { differences };
}
