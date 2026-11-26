import { useCallback } from 'react';
import { toast } from 'sonner';
import { isPremiumRequiredError } from '@/lib/entitlements';
import { isUnknownMutationOutcome } from '@/lib/mutationOutcome';
import {
  mapCattleEventToDb, mapCattleGroupToDb, mapCattleGroupUpdateToDb, mapCattleMoveToDb, mapCattleTreatmentToDb,
} from '@/lib/mappers';
import { treatmentWithdrawalUntil } from '@/lib/cattle/health';
import { CATTLE_RPC_KEY, type CattleRpcName, cattleEnvelopeGroupIds, syncQueue } from '@/lib/syncQueue';
import { supabase } from '@/lib/supabase';
import {
  addCounts, applyEventToGroup, COUNT_CLASSES, countsFromRpc, countsTotal, diffCounts, emptyCounts,
  groupCounts, herdTypeClass, normalizeCattleGroup, resolveEventClass, sameCounts, withClassDelta,
} from '@/lib/cattle/counts';
import type {
  CattleCounts, CattleEvent, CattleGroup, CattleGroupEdit, CattleMove, CattleTreatment, CountClass,
} from '@/types/cattle';

/** What the treatment form hands over; the id, dates and withdrawal date are filled in here. */
export type NewCattleTreatment = Omit<CattleTreatment,
  'id' | 'farm_id' | 'createdAt' | 'updatedAt' | 'deleted_at' | 'withdrawalUntil'>;

/** A new herd: its counts per class; the total is their sum. */
export type NewCattleGroup = Pick<CattleGroup, 'name' | 'class' | 'counts' | 'notes'>;

/** Move head of one class from one herd to another (weaning, splitting a herd). */
export interface CattleTransferInput {
  fromGroupId: string;
  toGroupId: string;
  head: number;
  eventDate: string;
  notes?: string;
  /** Left out, the from-herd's own class moves. */
  cattleClass?: CountClass;
}

interface UseCattleArgs {
  farm_id: string | null;
  cattleGroups: CattleGroup[];
  cattleMoves: CattleMove[];
  cattleEvents: CattleEvent[];
  cattleTreatments: CattleTreatment[];
  setCattleGroups: React.Dispatch<React.SetStateAction<CattleGroup[]>>;
  setCattleMoves: React.Dispatch<React.SetStateAction<CattleMove[]>>;
  setCattleEvents: React.Dispatch<React.SetStateAction<CattleEvent[]>>;
  setCattleTreatments: React.Dispatch<React.SetStateAction<CattleTreatment[]>>;
  isOnline: boolean;
  onMutation?: () => void | Promise<void>;
}

type CattleTable = 'cattle_groups' | 'cattle_moves' | 'cattle_events' | 'cattle_treatments';
type Operation = 'insert' | 'update' | 'soft_delete';

/** Lets a form show the Pro wording when the server refuses a save for plan reasons. */
export interface CattleSaveOptions {
  onPremiumRequired?: () => void;
}

function stripIdentity(payload: Record<string, unknown>): Record<string, unknown> {
  const { id: _id, farm_id: _farmId, ...update } = payload;
  return update;
}

function newestMove(groupId: string, moves: CattleMove[]): CattleMove | undefined {
  return moves
    .filter(item => item.groupId === groupId && !item.deleted_at)
    .sort((a, b) => b.movedOn.localeCompare(a.movedOn) || b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id))[0];
}

export function useCattle({
  farm_id, cattleGroups, cattleMoves, cattleEvents, cattleTreatments,
  setCattleGroups, setCattleMoves, setCattleEvents, setCattleTreatments, isOnline, onMutation,
}: UseCattleArgs) {
  const enqueue = useCallback(async (
    table: CattleTable,
    operation: Operation,
    payload: Record<string, unknown>,
  ): Promise<boolean> => {
    if (!farm_id) return false;
    try {
      await syncQueue.enqueueMutation(table, operation, payload, farm_id);
      if (onMutation) await onMutation();
      return true;
    } catch (error) {
      console.error('Failed to queue cattle change:', error);
      return false;
    }
  }, [farm_id, onMutation]);

  const persistGroup = useCallback(async (
    operation: 'insert' | 'update',
    payload: Record<string, unknown>,
  ): Promise<boolean> => {
    if (!farm_id) return false;
    if (await syncQueue.shouldQueueWrite(isOnline, farm_id, [{ tableName: 'cattle_groups', id: payload.id }])) {
      const queued = await enqueue('cattle_groups', operation, payload);
      if (queued && isOnline) syncQueue.kickReplay(farm_id, onMutation);
      return queued;
    }
    try {
      const response = operation === 'insert'
        ? await supabase.from('cattle_groups').insert([{ ...payload, farm_id }])
        : await supabase.from('cattle_groups')
          .update(stripIdentity(payload), { count: 'exact' })
          .eq('id', payload.id)
          .eq('farm_id', farm_id);
      if (!response.error && (operation === 'insert' || response.count === 1)) return true;
      if (response.error && isUnknownMutationOutcome(response.error)) return enqueue('cattle_groups', operation, payload);
      console.error(`Failed cattle group ${operation}:`, response.error ?? 'unexpected row count');
      return false;
    } catch (error) {
      return isUnknownMutationOutcome(error)
        ? enqueue('cattle_groups', operation, payload)
        : (console.error(`Failed cattle group ${operation}:`, error), false);
    }
  }, [enqueue, farm_id, isOnline, onMutation]);

  const persistRpc = useCallback(async (
    rpc: CattleRpcName,
    args: Record<string, unknown>,
    table: CattleTable,
    operation: Operation,
    payload: Record<string, unknown>,
  ): Promise<{ ok: boolean; data: unknown; premiumRequired?: boolean }> => {
    if (!farm_id) return { ok: false, data: null };
    const queuedPayload = { ...payload, [CATTLE_RPC_KEY]: { rpc, args } };
    const recordKeys = [{ tableName: table, id: payload.id }];
    for (const groupId of cattleEnvelopeGroupIds(queuedPayload)) {
      recordKeys.push({ tableName: 'cattle_groups', id: groupId });
    }
    if (await syncQueue.shouldQueueWrite(isOnline, farm_id, recordKeys)) {
      const queued = await enqueue(table, operation, queuedPayload);
      if (queued && isOnline) syncQueue.kickReplay(farm_id, onMutation);
      return { ok: queued, data: null };
    }
    try {
      const response = await supabase.rpc(rpc, { ...args, p_farm_id: farm_id });
      if (!response.error) return { ok: true, data: response.data };
      if (isUnknownMutationOutcome(response.error)) return { ok: await enqueue(table, operation, queuedPayload), data: null };
      console.error(`Failed cattle RPC ${rpc}:`, response.error);
      return { ok: false, data: null, premiumRequired: isPremiumRequiredError(response.error) };
    } catch (error) {
      return isUnknownMutationOutcome(error)
        ? { ok: await enqueue(table, operation, queuedPayload), data: null }
        : (console.error(`Failed cattle RPC ${rpc}:`, error), { ok: false, data: null });
    }
  }, [enqueue, farm_id, isOnline, onMutation]);

  const addCattleGroup = useCallback(async (input: NewCattleGroup): Promise<boolean> => {
    if (!farm_id) { toast.error('No farm selected.'); return false; }
    if (COUNT_CLASSES.some(item => !Number.isInteger(input.counts[item]) || input.counts[item] < 0)) return false;
    const now = new Date().toISOString();
    const counts = { ...input.counts };
    const record: CattleGroup = {
      ...input, counts, headCount: countsTotal(counts),
      id: crypto.randomUUID(), farm_id, createdAt: now, updatedAt: now, deleted_at: null,
    };
    let mapped: Record<string, unknown>;
    try { mapped = mapCattleGroupToDb(record); } catch (error) { console.error(error); return false; }
    setCattleGroups(current => [...current, record]);
    const ok = await persistGroup('insert', mapped);
    if (!ok) setCattleGroups(current => current.filter(item => item.id !== record.id));
    return ok;
  }, [farm_id, persistGroup, setCattleGroups]);

  const updateCattleGroup = useCallback(async (
    id: string,
    changes: CattleGroupEdit,
  ): Promise<boolean> => {
    if (!farm_id) { toast.error('No farm selected.'); return false; }
    const previous = cattleGroups.find(item => item.id === id && !item.deleted_at);
    if (!previous) return false;
    const name = changes.name ?? previous.name;
    if (!name.trim()) return false;
    if (changes.counts && COUNT_CLASSES.some(item => !Number.isInteger(changes.counts?.[item]) || (changes.counts?.[item] ?? -1) < 0)) return false;
    // The class counts go to the server only when the caller changed one, so a
    // stale offline edit of a name or note cannot overwrite counts that an event
    // or transfer has changed since. Editing one class never clears the others.
    const previousCounts = groupCounts(previous);
    const countsChanged = changes.counts !== undefined && !sameCounts(changes.counts, previousCounts);
    const nextCounts = countsChanged && changes.counts ? { ...changes.counts } : previousCounts;
    const updatedAt = new Date().toISOString();
    const updated: CattleGroup = {
      ...previous,
      name,
      class: changes.class ?? previous.class,
      notes: 'notes' in changes ? changes.notes : previous.notes,
      counts: nextCounts,
      headCount: countsTotal(nextCounts),
      farm_id,
      updatedAt,
    };
    let mapped: Record<string, unknown>;
    try { mapped = mapCattleGroupUpdateToDb(updated, { countsChanged }); } catch (error) { console.error(error); return false; }
    setCattleGroups(current => current.map(item => item.id === id
      ? {
        ...item, name: updated.name, class: updated.class, notes: updated.notes, updatedAt,
        ...(countsChanged ? { counts: updated.counts, headCount: updated.headCount } : {}),
      }
      : item));
    const ok = await persistGroup('update', mapped);
    if (!ok) {
      // Revert only the fields this edit set.
      setCattleGroups(current => current.map(item => item.id === id
        ? {
          ...item, name: previous.name, class: previous.class, notes: previous.notes, updatedAt: previous.updatedAt,
          ...(countsChanged ? { counts: previousCounts, headCount: countsTotal(previousCounts) } : {}),
        }
        : item));
    }
    return ok;
  }, [cattleGroups, farm_id, persistGroup, setCattleGroups]);

  const moveCattleGroup = useCallback(async (
    input: Pick<CattleMove, 'groupId' | 'fieldId' | 'movedOn' | 'notes'>,
  ): Promise<boolean> => {
    if (!farm_id) { toast.error('No farm selected.'); return false; }
    const previousGroup = cattleGroups.find(item => item.id === input.groupId && !item.deleted_at);
    if (!previousGroup) return false;
    const now = new Date().toISOString();
    const move: CattleMove = {
      ...input, id: crypto.randomUUID(), farm_id, headCount: previousGroup.headCount,
      createdAt: now, updatedAt: now, deleted_at: null,
    };
    let mapped: Record<string, unknown>;
    try { mapped = mapCattleMoveToDb(move); } catch (error) { console.error(error); return false; }
    setCattleMoves(current => [...current, move]);
    if (!previousGroup.currentSince || move.movedOn >= previousGroup.currentSince) {
      setCattleGroups(current => current.map(group => group.id === move.groupId
        ? { ...group, currentFieldId: move.fieldId, currentSince: move.movedOn }
        : group));
    }
    const result = await persistRpc('move_cattle_group', {
      p_move_id: move.id, p_group_id: move.groupId, p_field_id: move.fieldId ?? null,
      p_moved_on: move.movedOn, p_notes: move.notes ?? null,
    }, 'cattle_moves', 'insert', mapped);
    // Roll back only the pasture fields this move touched, and only if they
    // still hold this move's values, so a later change is never clobbered.
    const revertPasture = () => setCattleGroups(current => current.map(group => group.id === previousGroup.id
      && group.currentSince === move.movedOn && group.currentFieldId === move.fieldId
      ? { ...group, currentFieldId: previousGroup.currentFieldId, currentSince: previousGroup.currentSince }
      : group));
    if (!result.ok) {
      setCattleMoves(current => current.filter(item => item.id !== move.id));
      revertPasture();
    } else if (result.data && typeof result.data === 'object'
      && (result.data as { current_updated?: unknown }).current_updated === false
      && (!previousGroup.currentSince || move.movedOn >= previousGroup.currentSince)) {
      revertPasture();
    }
    return result.ok;
  }, [cattleGroups, farm_id, persistRpc, setCattleGroups, setCattleMoves]);

  const logCattleEvent = useCallback(async (
    input: Omit<CattleEvent, 'id' | 'farm_id' | 'createdAt' | 'updatedAt' | 'deleted_at'>,
    options?: CattleSaveOptions,
  ): Promise<boolean> => {
    if (!farm_id) { toast.error('No farm selected.'); return false; }
    const found = cattleGroups.find(item => item.id === input.groupId && !item.deleted_at);
    if (!found) return false;
    const previousGroup = normalizeCattleGroup(found);
    // Same class the server will use, so the optimistic change and the replay agree.
    const cattleClass = resolveEventClass(input.eventType, input.headDelta, input.cattleClass, previousGroup.class);
    if (input.eventType === 'reclass') {
      if (!cattleClass || !input.toClass || cattleClass === input.toClass) return false;
      if (!input.classHead || !Number.isInteger(input.classHead) || previousGroup.counts[cattleClass] < input.classHead) return false;
    } else if (cattleClass && previousGroup.counts[cattleClass] + input.headDelta < 0) {
      return false;
    }
    const now = new Date().toISOString();
    const event: CattleEvent = {
      ...input,
      cattleClass,
      toClass: input.eventType === 'reclass' ? input.toClass : undefined,
      classHead: input.eventType === 'reclass' ? input.classHead : undefined,
      calfSex: input.eventType === 'calving' ? input.calfSex : undefined,
      ...(input.eventType === 'preg_check'
        ? {
          // Partial entries count the blanks as zero, the same as the server.
          bredCount: input.bredCount ?? 0, openCount: input.openCount ?? 0, notCheckedCount: input.notCheckedCount ?? 0,
        }
        : { bredCount: undefined, openCount: undefined, notCheckedCount: undefined }),
      exposedCount: input.eventType === 'bull_in' ? input.exposedCount : undefined,
      headWeaned: input.eventType === 'weaning' ? input.headWeaned : undefined,
      avgWeight: input.eventType === 'weaning' && input.headWeaned ? input.avgWeight : undefined,
      id: crypto.randomUUID(), farm_id, createdAt: now, updatedAt: now, deleted_at: null,
    };
    let mapped: Record<string, unknown>;
    try { mapped = mapCattleEventToDb(event); } catch (error) { console.error(error); return false; }
    setCattleEvents(current => [...current, event]);
    setCattleGroups(current => current.map(group => group.id === event.groupId
      ? applyEventToGroup(normalizeCattleGroup(group), event, 1)
      : group));
    const result = await persistRpc('log_cattle_event', {
      p_event_id: event.id, p_group_id: event.groupId, p_event_type: event.eventType,
      p_event_date: event.eventDate, p_head_delta: event.headDelta,
      p_reason: event.reason ?? null, p_notes: event.notes ?? null,
      p_class: event.cattleClass ?? null, p_to_class: event.toClass ?? null,
      p_class_head: event.classHead ?? null, p_calf_sex: event.calfSex ?? null,
      p_bred: event.bredCount ?? null, p_open: event.openCount ?? null,
      p_not_checked: event.notCheckedCount ?? null, p_exposed: event.exposedCount ?? null,
      p_head_weaned: event.headWeaned ?? null, p_avg_weight: event.avgWeight ?? null,
    }, 'cattle_events', 'insert', mapped);
    if (!result.ok) {
      if (result.premiumRequired) options?.onPremiumRequired?.();
      setCattleEvents(current => current.filter(item => item.id !== event.id));
      // Undo this event's own change rather than restoring a whole-group snapshot.
      setCattleGroups(current => current.map(group => group.id === event.groupId
        ? applyEventToGroup(normalizeCattleGroup(group), event, -1)
        : group));
    }
    const stored = result.data && typeof result.data === 'object'
      ? countsFromRpc((result.data as { counts?: unknown }).counts)
      : null;
    if (result.ok && stored) {
      setCattleGroups(current => current.map(group => group.id === event.groupId
        ? { ...group, counts: stored, headCount: countsTotal(stored) }
        : group));
    }
    return result.ok;
  }, [cattleGroups, farm_id, persistRpc, setCattleEvents, setCattleGroups]);

  const transferCattleHead = useCallback(async (
    input: CattleTransferInput,
    options?: CattleSaveOptions,
  ): Promise<boolean> => {
    if (!farm_id) { toast.error('No farm selected.'); return false; }
    const fromFound = cattleGroups.find(item => item.id === input.fromGroupId && !item.deleted_at);
    const to = cattleGroups.find(item => item.id === input.toGroupId && !item.deleted_at);
    if (!fromFound || !to || fromFound.id === to.id) return false;
    const from = normalizeCattleGroup(fromFound);
    const cattleClass = input.cattleClass ?? herdTypeClass(from.class);
    if (!Number.isInteger(input.head) || input.head <= 0 || from.counts[cattleClass] < input.head) return false;
    const now = new Date().toISOString();
    const fromId = crypto.randomUUID();
    const toId = crypto.randomUUID();
    const base = {
      farm_id, eventDate: input.eventDate, notes: input.notes, transferId: fromId, cattleClass,
      createdAt: now, updatedAt: now, deleted_at: null,
    };
    const removed: CattleEvent = {
      ...base, id: fromId, groupId: from.id, eventType: 'head_removed', headDelta: -input.head, reason: 'moved_to_another_group',
    };
    const added: CattleEvent = { ...base, id: toId, groupId: to.id, eventType: 'head_added', headDelta: input.head };
    let mapped: Record<string, unknown>;
    try { mapCattleEventToDb(added); mapped = mapCattleEventToDb(removed); } catch (error) { console.error(error); return false; }
    setCattleEvents(current => [...current, removed, added]);
    setCattleGroups(current => current.map(group => group.id === from.id
      ? withClassDelta(normalizeCattleGroup(group), cattleClass, -input.head)
      : group.id === to.id ? withClassDelta(normalizeCattleGroup(group), cattleClass, input.head) : group));
    const result = await persistRpc('transfer_cattle_head', {
      p_from_event_id: fromId, p_to_event_id: toId, p_from_group_id: from.id, p_to_group_id: to.id,
      p_head: input.head, p_event_date: input.eventDate, p_notes: input.notes ?? null, p_class: cattleClass,
    }, 'cattle_events', 'insert', mapped);
    if (!result.ok) {
      if (result.premiumRequired) options?.onPremiumRequired?.();
      setCattleEvents(current => current.filter(item => item.id !== fromId && item.id !== toId));
      setCattleGroups(current => current.map(group => group.id === from.id
        ? withClassDelta(normalizeCattleGroup(group), cattleClass, input.head)
        : group.id === to.id ? withClassDelta(normalizeCattleGroup(group), cattleClass, -input.head) : group));
      return false;
    }
    const data = result.data && typeof result.data === 'object' ? result.data as Record<string, unknown> : null;
    const fromStored = countsFromRpc(data?.from_counts);
    const toStored = countsFromRpc(data?.to_counts);
    if (fromStored && toStored) {
      setCattleGroups(current => current.map(group => group.id === from.id
        ? { ...group, counts: fromStored, headCount: countsTotal(fromStored) }
        : group.id === to.id ? { ...group, counts: toStored, headCount: countsTotal(toStored) } : group));
    }
    return true;
  }, [cattleGroups, farm_id, persistRpc, setCattleEvents, setCattleGroups]);

  const deleteCattleGroup = useCallback(async (id: string): Promise<boolean> => {
    if (!farm_id) { toast.error('No farm selected.'); return false; }
    const previousGroup = cattleGroups.find(item => item.id === id);
    if (!previousGroup) return false;
    const previousMoves = cattleMoves.filter(item => item.groupId === id);
    const previousEvents = cattleEvents.filter(item => item.groupId === id);
    const previousTreatments = cattleTreatments.filter(item => item.groupId === id);
    const deletedAt = new Date().toISOString();
    setCattleGroups(current => current.map(item => item.id === id ? { ...item, deleted_at: deletedAt } : item));
    setCattleMoves(current => current.map(item => item.groupId === id ? { ...item, deleted_at: deletedAt } : item));
    setCattleEvents(current => current.map(item => item.groupId === id ? { ...item, deleted_at: deletedAt } : item));
    setCattleTreatments(current => current.map(item => item.groupId === id ? { ...item, deleted_at: deletedAt } : item));
    const { ok } = await persistRpc('soft_delete_cattle_row', {
      p_row_type: 'group', p_row_id: id,
    }, 'cattle_groups', 'soft_delete', { id, farm_id, deleted_at: deletedAt });
    if (!ok) {
      // Revert only the deleted_at this call set, on only the ids it touched.
      setCattleGroups(current => current.map(item => item.id === id ? { ...item, deleted_at: previousGroup.deleted_at } : item));
      const movesById = new Map(previousMoves.map(item => [item.id, item.deleted_at]));
      const eventsById = new Map(previousEvents.map(item => [item.id, item.deleted_at]));
      setCattleMoves(current => current.map(item => movesById.has(item.id) ? { ...item, deleted_at: movesById.get(item.id) ?? null } : item));
      setCattleEvents(current => current.map(item => eventsById.has(item.id) ? { ...item, deleted_at: eventsById.get(item.id) ?? null } : item));
      const treatmentsById = new Map(previousTreatments.map(item => [item.id, item.deleted_at]));
      setCattleTreatments(current => current.map(item => treatmentsById.has(item.id) ? { ...item, deleted_at: treatmentsById.get(item.id) ?? null } : item));
    }
    return ok;
  }, [cattleEvents, cattleGroups, cattleMoves, cattleTreatments, farm_id, persistRpc, setCattleEvents, setCattleGroups, setCattleMoves, setCattleTreatments]);

  const logCattleTreatment = useCallback(async (
    input: NewCattleTreatment,
    options?: CattleSaveOptions,
  ): Promise<boolean> => {
    if (!farm_id) { toast.error('No farm selected.'); return false; }
    const found = cattleGroups.find(item => item.id === input.groupId && !item.deleted_at);
    if (!found) return false;
    const product = input.product.trim();
    if (!product || !Number.isInteger(input.headTreated) || input.headTreated <= 0) return false;
    if (!(input.dose > 0)) return false;
    if (!Number.isInteger(input.withdrawalDays) || input.withdrawalDays < 0 || input.withdrawalDays > 365) return false;
    const now = new Date().toISOString();
    const treatment: CattleTreatment = {
      ...input,
      product,
      lotNumber: input.lotNumber?.trim() || undefined,
      givenBy: input.givenBy?.trim() || undefined,
      notes: input.notes?.trim() || undefined,
      withdrawalUntil: treatmentWithdrawalUntil(input.treatedOn, input.withdrawalDays),
      id: crypto.randomUUID(), farm_id, createdAt: now, updatedAt: now, deleted_at: null,
    };
    let mapped: Record<string, unknown>;
    try { mapped = mapCattleTreatmentToDb(treatment); } catch (error) { console.error(error); return false; }
    setCattleTreatments(current => [...current, treatment]);
    const result = await persistRpc('log_cattle_treatment', {
      p_treatment_id: treatment.id, p_group_id: treatment.groupId, p_treated_on: treatment.treatedOn,
      p_product: treatment.product, p_kind: treatment.kind, p_head_treated: treatment.headTreated,
      p_dose: treatment.dose, p_dose_unit: treatment.doseUnit, p_route: treatment.route,
      p_withdrawal_days: treatment.withdrawalDays, p_class: treatment.cattleClass ?? null,
      p_dose_basis: treatment.doseBasis, p_lot_number: treatment.lotNumber ?? null,
      p_given_by: treatment.givenBy ?? null, p_notes: treatment.notes ?? null,
    }, 'cattle_treatments', 'insert', mapped);
    if (!result.ok) {
      if (result.premiumRequired) options?.onPremiumRequired?.();
      setCattleTreatments(current => current.filter(item => item.id !== treatment.id));
    }
    return result.ok;
  }, [cattleGroups, farm_id, persistRpc, setCattleTreatments]);

  const deleteCattleTreatment = useCallback(async (id: string): Promise<boolean> => {
    if (!farm_id) { toast.error('No farm selected.'); return false; }
    const previous = cattleTreatments.find(item => item.id === id);
    if (!previous || previous.deleted_at) return false;
    const deletedAt = new Date().toISOString();
    setCattleTreatments(current => current.map(item => item.id === id ? { ...item, deleted_at: deletedAt } : item));
    const { ok } = await persistRpc('delete_cattle_treatment', {
      p_treatment_id: id,
    }, 'cattle_treatments', 'soft_delete', { id, farm_id, group_id: previous.groupId, deleted_at: deletedAt });
    if (!ok) {
      setCattleTreatments(current => current.map(item => item.id === id ? { ...item, deleted_at: null } : item));
    }
    return ok;
  }, [cattleTreatments, farm_id, persistRpc, setCattleTreatments]);

  const deleteCattleMove = useCallback(async (id: string): Promise<boolean> => {
    if (!farm_id) { toast.error('No farm selected.'); return false; }
    const previousMove = cattleMoves.find(item => item.id === id);
    const previousGroup = previousMove && cattleGroups.find(item => item.id === previousMove.groupId);
    if (!previousMove || !previousGroup) return false;
    const deletedAt = new Date().toISOString();
    const remaining = cattleMoves.map(item => item.id === id ? { ...item, deleted_at: deletedAt } : item);
    const latest = newestMove(previousMove.groupId, remaining);
    setCattleMoves(current => current.map(item => item.id === id ? { ...item, deleted_at: deletedAt } : item));
    setCattleGroups(current => current.map(group => group.id === previousGroup.id
      ? { ...group, currentFieldId: latest?.fieldId, currentSince: latest?.movedOn }
      : group));
    const { ok } = await persistRpc('soft_delete_cattle_row', {
      p_row_type: 'move', p_row_id: id,
    }, 'cattle_moves', 'soft_delete', { id, farm_id, group_id: previousMove.groupId, deleted_at: deletedAt });
    if (!ok) {
      setCattleMoves(current => current.map(item => item.id === id ? { ...item, deleted_at: previousMove.deleted_at } : item));
      setCattleGroups(current => current.map(item => item.id === previousGroup.id
        ? { ...item, currentFieldId: previousGroup.currentFieldId, currentSince: previousGroup.currentSince }
        : item));
    }
    return ok;
  }, [cattleGroups, cattleMoves, farm_id, persistRpc, setCattleGroups, setCattleMoves]);

  const deleteCattleEvent = useCallback(async (id: string): Promise<boolean> => {
    if (!farm_id) { toast.error('No farm selected.'); return false; }
    const previousEvent = cattleEvents.find(item => item.id === id);
    if (!previousEvent || previousEvent.deleted_at) return false;
    // Deleting either half of a transfer reverses both halves. A count that was
    // edited down since is floored at zero; the delete is never refused for it.
    const halves = previousEvent.transferId
      ? cattleEvents.filter(item => item.transferId === previousEvent.transferId && !item.deleted_at)
      : [previousEvent];
    // Per class, what reversing each half changes on its group (floored at zero).
    const changeByGroup = new Map<string, CattleCounts>();
    for (const half of halves) {
      const found = cattleGroups.find(item => item.id === half.groupId && !item.deleted_at);
      if (!found) continue;
      const group = normalizeCattleGroup(found);
      const start = changeByGroup.get(group.id);
      const before = start ? addCounts(group.counts, start) : group.counts;
      const after = applyEventToGroup({ ...group, counts: before }, half, -1).counts;
      changeByGroup.set(group.id, addCounts(start ?? emptyCounts(), diffCounts(after, before)));
    }
    if (!cattleGroups.some(item => item.id === previousEvent.groupId && !item.deleted_at)) return false;
    const deletedAt = new Date().toISOString();
    const halfIds = new Set(halves.map(item => item.id));
    const shift = (sign: 1 | -1) => setCattleGroups(current => current.map(group => {
      const change = changeByGroup.get(group.id);
      if (!change) return group;
      const normal = normalizeCattleGroup(group);
      const counts = addCounts(normal.counts, sign === 1 ? change : diffCounts(emptyCounts(), change), true);
      return { ...normal, counts, headCount: countsTotal(counts) };
    }));
    setCattleEvents(current => current.map(item => halfIds.has(item.id) ? { ...item, deleted_at: deletedAt } : item));
    shift(1);
    const result = await persistRpc('soft_delete_cattle_row', {
      p_row_type: 'event', p_row_id: id,
    }, 'cattle_events', 'soft_delete', { id, farm_id, group_id: previousEvent.groupId, deleted_at: deletedAt });
    if (!result.ok) {
      setCattleEvents(current => current.map(item => halfIds.has(item.id) ? { ...item, deleted_at: null } : item));
      // Give back exactly what this delete removed.
      shift(-1);
      return false;
    }
    const stored = result.data && typeof result.data === 'object'
      ? countsFromRpc((result.data as { counts?: unknown }).counts)
      : null;
    if (stored) {
      setCattleGroups(current => current.map(group => group.id === previousEvent.groupId
        ? { ...group, counts: stored, headCount: countsTotal(stored) }
        : group));
    }
    return true;
  }, [cattleEvents, cattleGroups, farm_id, persistRpc, setCattleEvents, setCattleGroups]);

  return {
    addCattleGroup, updateCattleGroup, moveCattleGroup, logCattleEvent, transferCattleHead,
    deleteCattleGroup, deleteCattleMove, deleteCattleEvent, logCattleTreatment, deleteCattleTreatment,
  };
}
