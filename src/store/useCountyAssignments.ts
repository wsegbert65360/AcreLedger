import { useCallback, useEffect, useRef } from 'react';
import { toast } from 'sonner';

import { loadCountiesFor } from '@/lib/county/boundaryProvider';
import { validateManualSplit } from '@/lib/county/allocation';
import {
  buildManualRows, buildMarkReviewed, buildRestoreAutomatic, collectCountySubjects,
  planCountyAssignments, planHasChanges, subjectGeometryHash, subjectsBounds,
  type CountyPlan, type CountySubject, type PlanMode,
} from '@/lib/county/plan';
import type { CountyAssignment, CountyBoundary } from '@/lib/county/types';
import { mapCountyAssignmentToDb } from '@/lib/mappers';
import { syncQueue } from '@/lib/syncQueue';
import type { Field } from '@/types/farm';
import type { FieldCluAssignment, FsaTractImport } from '@/types/fsaTract';

interface UseCountyAssignmentsArgs {
  farm_id: string | null;
  userId: string | null;
  fields: Field[];
  fsaTracts: FsaTractImport[];
  cluAssignments: FieldCluAssignment[];
  countyAssignments: CountyAssignment[];
  setCountyAssignments: React.Dispatch<React.SetStateAction<CountyAssignment[]>>;
  isOnline: boolean;
  /** True once saved and server data have been read, so a half-loaded store is never planned from. */
  ready: boolean;
  onMutation: () => void | Promise<void>;
}

export interface CountyPlanResult {
  plan: CountyPlan | null;
  /** Set when boundary data was unavailable and nothing could be planned. */
  unavailableReason: string | null;
}

export interface ManualSplitInput {
  subject: CountySubject;
  split: { county: Pick<CountyBoundary, 'fips' | 'name' | 'stateAbbr' | 'datasetSource' | 'datasetVersion'>; acres: number }[];
}

/**
 * Saved physical county assignments for fields and CLUs.
 *
 * Every change is one atomic enqueue (retire rows first, then update, then insert), so a crash
 * cannot leave half a recalculation, and the same path serves online and offline use.
 */
export function useCountyAssignments({
  farm_id, userId, fields, fsaTracts, cluAssignments, countyAssignments, setCountyAssignments,
  isOnline, ready, onMutation,
}: UseCountyAssignmentsArgs) {
  const busy = useRef(false);
  const latest = useRef({ fields, fsaTracts, cluAssignments, countyAssignments });
  latest.current = { fields, fsaTracts, cluAssignments, countyAssignments };
  const lastAutoSignature = useRef<string | null>(null);

  const subjectsNow = useCallback(() => {
    const { fields: f, fsaTracts: t } = latest.current;
    return collectCountySubjects({
      fields: f.filter(field => !field.deleted_at),
      tractCollections: t.filter(tract => !tract.deletedAt).map(tract => ({ tractKey: tract.tractKey, collection: tract.geojson })),
    });
  }, []);

  const buildPlan = useCallback(async (mode: PlanMode): Promise<CountyPlanResult> => {
    if (!farm_id) return { plan: null, unavailableReason: 'No farm selected' };
    const { subjects, loadedTractKeys } = subjectsNow();
    const bounds = subjectsBounds(subjects);
    const boundaries = await loadCountiesFor(bounds, { userId, isOnline });
    const { fields: f, countyAssignments: existing } = latest.current;
    const plan = planCountyAssignments({
      farmId: farm_id,
      subjects,
      existing: existing.filter(r => r.farmId === farm_id),
      counties: boundaries.counties,
      loadedTractKeys,
      activeFieldIds: new Set(f.filter(field => !field.deleted_at).map(field => field.id)),
      mode,
      now: new Date().toISOString(),
    });
    return { plan, unavailableReason: boundaries.reason };
  }, [farm_id, userId, isOnline, subjectsNow]);

  /** Writes retire → update → insert as one durable batch and mirrors it into local state. */
  const commit = useCallback(async (upserts: CountyAssignment[], softDeletes: CountyAssignment[]): Promise<boolean> => {
    if (!farm_id) return false;
    if (upserts.length === 0 && softDeletes.length === 0) return true;
    const known = new Set(latest.current.countyAssignments.map(r => r.id));
    const deletedIds = new Set(softDeletes.map(r => r.id));
    const live = upserts.filter(r => !deletedIds.has(r.id));
    try {
      await syncQueue.enqueueMutations([
        ...softDeletes.map(r => ({
          tableName: 'county_assignments', operation: 'soft_delete' as const,
          payload: { id: r.id, deleted_at: r.deletedAt }, farmId: farm_id,
        })),
        ...live.filter(r => known.has(r.id)).map(r => ({
          tableName: 'county_assignments', operation: 'update' as const,
          payload: mapCountyAssignmentToDb(r), farmId: farm_id,
        })),
        ...live.filter(r => !known.has(r.id)).map(r => ({
          tableName: 'county_assignments', operation: 'insert' as const,
          payload: mapCountyAssignmentToDb(r), farmId: farm_id,
        })),
      ]);
    } catch (error) {
      console.error('Failed to save county assignments:', error);
      toast.error('Could not save county assignments');
      return false;
    }
    setCountyAssignments(prev => {
      const byId = new Map(prev.map(r => [r.id, r]));
      for (const r of softDeletes) byId.delete(r.id);
      for (const r of live) byId.set(r.id, r);
      return [...byId.values()];
    });
    if (isOnline) {
      try { await syncQueue.replayQueue(farm_id); } catch (error) {
        console.error('County assignments remain queued for sync:', error);
      }
    }
    await onMutation();
    return true;
  }, [farm_id, isOnline, setCountyAssignments, onMutation]);

  /** Backfill preview: the same planner as apply, nothing written. */
  const previewCounties = useCallback((mode: PlanMode = 'recalculate') => buildPlan(mode), [buildPlan]);

  const applyCountyPlan = useCallback(async (plan: CountyPlan): Promise<boolean> => {
    if (busy.current) return false;
    busy.current = true;
    try {
      return await commit(plan.upserts, plan.softDeletes);
    } finally {
      busy.current = false;
    }
  }, [commit]);

  /** Recomputes from current boundaries. `recalculate` also re-measures unchanged subjects. */
  const recalculateCounties = useCallback(async (mode: PlanMode = 'sync'): Promise<CountyPlanResult & { applied: boolean }> => {
    if (busy.current) return { plan: null, unavailableReason: null, applied: false };
    busy.current = true;
    try {
      const result = await buildPlan(mode);
      if (!result.plan || !planHasChanges(result.plan)) return { ...result, applied: false };
      const applied = await commit(result.plan.upserts, result.plan.softDeletes);
      return { ...result, applied };
    } finally {
      busy.current = false;
    }
  }, [buildPlan, commit]);

  const saveManualSplit = useCallback(async ({ subject, split }: ManualSplitInput): Promise<{ ok: boolean; errors: string[] }> => {
    if (!farm_id) return { ok: false, errors: ['No farm selected'] };
    const check = validateManualSplit(
      split.map(s => ({ countyFips: s.county.fips, acres: s.acres })),
      subject.recordedAcres,
    );
    if (!check.valid) return { ok: false, errors: check.errors };
    if (busy.current) return { ok: false, errors: ['Another county change is in progress'] };
    busy.current = true;
    try {
      const existing = latest.current.countyAssignments.filter(r =>
        r.farmId === farm_id && r.subjectType === subject.type && r.subjectKey === subject.key && !r.deletedAt);
      const { upserts, softDeletes } = buildManualRows({
        farmId: farm_id, subject, split, existing, now: new Date().toISOString(),
      });
      const ok = await commit(upserts, softDeletes);
      return { ok, errors: ok ? [] : ['Could not save the correction'] };
    } finally {
      busy.current = false;
    }
  }, [farm_id, commit]);

  const restoreAutomatic = useCallback(async (subject: CountySubject): Promise<boolean> => {
    if (!farm_id || busy.current) return false;
    busy.current = true;
    try {
      const existing = latest.current.countyAssignments.filter(r =>
        r.farmId === farm_id && r.subjectType === subject.type && r.subjectKey === subject.key && !r.deletedAt);
      const retired = buildRestoreAutomatic(existing, new Date().toISOString());
      if (!(await commit([], retired))) return false;
      // Recalculate just this subject now that the manual rows are gone.
      const bounds = subjectsBounds([subject]);
      const boundaries = await loadCountiesFor(bounds, { userId, isOnline });
      const stillThere = latest.current.countyAssignments.filter(r =>
        r.farmId === farm_id && !(r.subjectType === subject.type && r.subjectKey === subject.key && retired.some(x => x.id === r.id)));
      const plan = planCountyAssignments({
        farmId: farm_id, subjects: [subject], existing: stillThere, counties: boundaries.counties,
        loadedTractKeys: new Set(), activeFieldIds: new Set(subject.fieldId ? [subject.fieldId] : []),
        mode: 'recalculate', now: new Date().toISOString(),
      });
      return await commit(plan.upserts, plan.softDeletes);
    } finally {
      busy.current = false;
    }
  }, [farm_id, userId, isOnline, commit]);

  const markReviewed = useCallback(async (subject: CountySubject): Promise<boolean> => {
    if (!farm_id || busy.current) return false;
    busy.current = true;
    try {
      const existing = latest.current.countyAssignments.filter(r =>
        r.farmId === farm_id && r.subjectType === subject.type && r.subjectKey === subject.key && !r.deletedAt);
      return await commit(buildMarkReviewed(subject, existing), []);
    } finally {
      busy.current = false;
    }
  }, [farm_id, commit]);

  // Automatic sync: only subjects that are new or whose geometry changed. The signature guard stops
  // a loop (an applied plan changes countyAssignments, which would otherwise retrigger this).
  useEffect(() => {
    if (!ready || !farm_id) return;
    // Existing farms are filled in only by the reviewed backfill (preview, then apply). Once a farm
    // has county rows, new or edited fields and CLUs keep themselves current here.
    if (!latest.current.countyAssignments.some(r => r.farmId === farm_id)) return;
    const { subjects } = subjectsNow();
    const signature = `${farm_id}|${isOnline}|${subjects.map(s => `${s.type}:${s.key}:${subjectGeometryHash(s) ?? '-'}`).join(',')}`;
    if (lastAutoSignature.current === signature) return;
    lastAutoSignature.current = signature;
    void recalculateCounties('sync').then(result => {
      // A failed or deferred run must be retried on the next change, not skipped by the guard.
      if (result.unavailableReason || (result.plan?.counts.deferred ?? 0) > 0) lastAutoSignature.current = null;
    });
  }, [ready, farm_id, isOnline, fields, fsaTracts, cluAssignments, subjectsNow, recalculateCounties]);

  return { previewCounties, applyCountyPlan, recalculateCounties, saveManualSplit, restoreAutomatic, markReviewed };
}
