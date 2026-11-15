import { useCallback } from 'react';
import { toast } from 'sonner';
import { isUnknownMutationOutcome } from '@/lib/mutationOutcome';
import {
  mapCattleEventToDb, mapCattleGroupToDb, mapCattleGroupUpdateToDb, mapCattleMoveToDb,
} from '@/lib/mappers';
import { CATTLE_RPC_KEY, type CattleRpcName, syncQueue } from '@/lib/syncQueue';
import { supabase } from '@/lib/supabase';
import type { CattleEvent, CattleGroup, CattleMove } from '@/types/cattle';

interface UseCattleArgs {
  farm_id: string | null;
  cattleGroups: CattleGroup[];
  cattleMoves: CattleMove[];
  cattleEvents: CattleEvent[];
  setCattleGroups: React.Dispatch<React.SetStateAction<CattleGroup[]>>;
  setCattleMoves: React.Dispatch<React.SetStateAction<CattleMove[]>>;
  setCattleEvents: React.Dispatch<React.SetStateAction<CattleEvent[]>>;
  isOnline: boolean;
  onMutation?: () => void | Promise<void>;
}

type CattleTable = 'cattle_groups' | 'cattle_moves' | 'cattle_events';
type Operation = 'insert' | 'update' | 'soft_delete';

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
  farm_id, cattleGroups, cattleMoves, cattleEvents,
  setCattleGroups, setCattleMoves, setCattleEvents, isOnline, onMutation,
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
  ): Promise<{ ok: boolean; data: unknown }> => {
    if (!farm_id) return { ok: false, data: null };
    const queuedPayload = { ...payload, [CATTLE_RPC_KEY]: { rpc, args } };
    const recordKeys = [{ tableName: table, id: payload.id }];
    if (typeof args.p_group_id === 'string') recordKeys.push({ tableName: 'cattle_groups', id: args.p_group_id });
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
      return { ok: false, data: null };
    } catch (error) {
      return isUnknownMutationOutcome(error)
        ? { ok: await enqueue(table, operation, queuedPayload), data: null }
        : (console.error(`Failed cattle RPC ${rpc}:`, error), { ok: false, data: null });
    }
  }, [enqueue, farm_id, isOnline, onMutation]);

  const addCattleGroup = useCallback(async (
    input: Omit<CattleGroup, 'id' | 'farm_id' | 'createdAt' | 'updatedAt' | 'deleted_at' | 'currentFieldId' | 'currentSince'>,
  ): Promise<boolean> => {
    if (!farm_id) { toast.error('No farm selected.'); return false; }
    const now = new Date().toISOString();
    const record: CattleGroup = {
      ...input, id: crypto.randomUUID(), farm_id, createdAt: now, updatedAt: now, deleted_at: null,
    };
    let mapped: Record<string, unknown>;
    try { mapped = mapCattleGroupToDb(record); } catch (error) { console.error(error); return false; }
    setCattleGroups(current => [...current, record]);
    const ok = await persistGroup('insert', mapped);
    if (!ok) setCattleGroups(current => current.filter(item => item.id !== record.id));
    return ok;
  }, [farm_id, persistGroup, setCattleGroups]);

  const updateCattleGroup = useCallback(async (record: CattleGroup): Promise<boolean> => {
    if (!farm_id) { toast.error('No farm selected.'); return false; }
    const previous = cattleGroups.find(item => item.id === record.id);
    if (!previous) return false;
    const updated = { ...record, farm_id, updatedAt: new Date().toISOString() };
    let mapped: Record<string, unknown>;
    try { mapped = mapCattleGroupUpdateToDb(updated); } catch (error) { console.error(error); return false; }
    setCattleGroups(current => current.map(item => item.id === updated.id ? updated : item));
    const ok = await persistGroup('update', mapped);
    if (!ok) setCattleGroups(current => current.map(item => item.id === previous.id ? previous : item));
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
    if (!result.ok) {
      setCattleMoves(current => current.filter(item => item.id !== move.id));
      setCattleGroups(current => current.map(group => group.id === previousGroup.id ? previousGroup : group));
    }
    if (result.data && typeof result.data === 'object'
      && (result.data as { current_updated?: unknown }).current_updated === false
      && (!previousGroup.currentSince || move.movedOn >= previousGroup.currentSince)) {
      setCattleGroups(current => current.map(group => group.id === previousGroup.id ? previousGroup : group));
    }
    return result.ok;
  }, [cattleGroups, farm_id, persistRpc, setCattleGroups, setCattleMoves]);

  const logCattleEvent = useCallback(async (
    input: Omit<CattleEvent, 'id' | 'farm_id' | 'createdAt' | 'updatedAt' | 'deleted_at'>,
  ): Promise<boolean> => {
    if (!farm_id) { toast.error('No farm selected.'); return false; }
    const previousGroup = cattleGroups.find(item => item.id === input.groupId && !item.deleted_at);
    if (!previousGroup || previousGroup.headCount + input.headDelta < 0) return false;
    const now = new Date().toISOString();
    const event: CattleEvent = {
      ...input, id: crypto.randomUUID(), farm_id, createdAt: now, updatedAt: now, deleted_at: null,
    };
    let mapped: Record<string, unknown>;
    try { mapped = mapCattleEventToDb(event); } catch (error) { console.error(error); return false; }
    setCattleEvents(current => [...current, event]);
    setCattleGroups(current => current.map(group => group.id === event.groupId
      ? { ...group, headCount: group.headCount + event.headDelta }
      : group));
    const result = await persistRpc('log_cattle_event', {
      p_event_id: event.id, p_group_id: event.groupId, p_event_type: event.eventType,
      p_event_date: event.eventDate, p_head_delta: event.headDelta,
      p_reason: event.reason ?? null, p_notes: event.notes ?? null,
    }, 'cattle_events', 'insert', mapped);
    if (!result.ok) {
      setCattleEvents(current => current.filter(item => item.id !== event.id));
      setCattleGroups(current => current.map(group => group.id === previousGroup.id ? previousGroup : group));
    }
    const storedHeadCount = result.data && typeof result.data === 'object'
      ? Number((result.data as { head_count?: unknown }).head_count)
      : Number.NaN;
    if (result.ok && Number.isInteger(storedHeadCount)) {
      setCattleGroups(current => current.map(group => group.id === event.groupId
        ? { ...group, headCount: storedHeadCount }
        : group));
    }
    return result.ok;
  }, [cattleGroups, farm_id, persistRpc, setCattleEvents, setCattleGroups]);

  const deleteCattleGroup = useCallback(async (id: string): Promise<boolean> => {
    if (!farm_id) { toast.error('No farm selected.'); return false; }
    const previousGroup = cattleGroups.find(item => item.id === id);
    if (!previousGroup) return false;
    const previousMoves = cattleMoves.filter(item => item.groupId === id);
    const previousEvents = cattleEvents.filter(item => item.groupId === id);
    const deletedAt = new Date().toISOString();
    setCattleGroups(current => current.map(item => item.id === id ? { ...item, deleted_at: deletedAt } : item));
    setCattleMoves(current => current.map(item => item.groupId === id ? { ...item, deleted_at: deletedAt } : item));
    setCattleEvents(current => current.map(item => item.groupId === id ? { ...item, deleted_at: deletedAt } : item));
    const { ok } = await persistRpc('soft_delete_cattle_row', {
      p_row_type: 'group', p_row_id: id,
    }, 'cattle_groups', 'soft_delete', { id, farm_id, deleted_at: deletedAt });
    if (!ok) {
      setCattleGroups(current => current.map(item => item.id === id ? previousGroup : item));
      const movesById = new Map(previousMoves.map(item => [item.id, item]));
      const eventsById = new Map(previousEvents.map(item => [item.id, item]));
      setCattleMoves(current => current.map(item => movesById.get(item.id) ?? item));
      setCattleEvents(current => current.map(item => eventsById.get(item.id) ?? item));
    }
    return ok;
  }, [cattleEvents, cattleGroups, cattleMoves, farm_id, persistRpc, setCattleEvents, setCattleGroups, setCattleMoves]);

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
    }, 'cattle_moves', 'soft_delete', { id, farm_id, deleted_at: deletedAt });
    if (!ok) {
      setCattleMoves(current => current.map(item => item.id === id ? previousMove : item));
      setCattleGroups(current => current.map(item => item.id === previousGroup.id ? previousGroup : item));
    }
    return ok;
  }, [cattleGroups, cattleMoves, farm_id, persistRpc, setCattleGroups, setCattleMoves]);

  const deleteCattleEvent = useCallback(async (id: string): Promise<boolean> => {
    if (!farm_id) { toast.error('No farm selected.'); return false; }
    const previousEvent = cattleEvents.find(item => item.id === id);
    const previousGroup = previousEvent && cattleGroups.find(item => item.id === previousEvent.groupId);
    if (!previousEvent || !previousGroup || previousGroup.headCount - previousEvent.headDelta < 0) return false;
    const deletedAt = new Date().toISOString();
    setCattleEvents(current => current.map(item => item.id === id ? { ...item, deleted_at: deletedAt } : item));
    setCattleGroups(current => current.map(group => group.id === previousGroup.id
      ? { ...group, headCount: group.headCount - previousEvent.headDelta }
      : group));
    const result = await persistRpc('soft_delete_cattle_row', {
      p_row_type: 'event', p_row_id: id,
    }, 'cattle_events', 'soft_delete', { id, farm_id, deleted_at: deletedAt });
    if (!result.ok) {
      setCattleEvents(current => current.map(item => item.id === id ? previousEvent : item));
      setCattleGroups(current => current.map(item => item.id === previousGroup.id ? previousGroup : item));
    }
    const storedHeadCount = result.data && typeof result.data === 'object'
      ? Number((result.data as { head_count?: unknown }).head_count)
      : Number.NaN;
    if (result.ok && Number.isInteger(storedHeadCount)) {
      setCattleGroups(current => current.map(group => group.id === previousGroup.id
        ? { ...group, headCount: storedHeadCount }
        : group));
    }
    return result.ok;
  }, [cattleEvents, cattleGroups, farm_id, persistRpc, setCattleEvents, setCattleGroups]);

  return {
    addCattleGroup, updateCattleGroup, moveCattleGroup, logCattleEvent,
    deleteCattleGroup, deleteCattleMove, deleteCattleEvent,
  };
}
