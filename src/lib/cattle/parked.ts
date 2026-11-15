import {
  mapCattleEventFromDb, mapCattleEventToDb, mapCattleGroupFromDb, mapCattleGroupToDb,
  mapCattleMoveFromDb, mapCattleMoveToDb,
} from '@/lib/mappers';
import { MAX_SYNC_RETRIES, readCattleRpcEnvelope, type QueuedMutation } from '@/lib/syncQueue';
import type {
  CattleEvent, CattleEventRow, CattleGroup, CattleGroupRow, CattleMove, CattleMoveRow,
} from '@/types/cattle';

function upsert<T extends { id: string }>(rows: T[], row: T): T[] {
  const index = rows.findIndex(item => item.id === row.id);
  return index === -1
    ? [...rows, row]
    : rows.map(item => item.id === row.id ? row : item);
}

function overlayGroup(rows: CattleGroup[], payload: Record<string, unknown>): CattleGroup[] {
  const id = String(payload.id ?? '');
  if (!id) return rows;
  const current = rows.find(item => item.id === id);
  try {
    return upsert(rows, mapCattleGroupFromDb({ ...(current ? mapCattleGroupToDb(current) : {}), ...payload, id } as CattleGroupRow));
  } catch { return rows; }
}

function overlayMove(rows: CattleMove[], payload: Record<string, unknown>): CattleMove[] {
  const id = String(payload.id ?? '');
  if (!id) return rows;
  const current = rows.find(item => item.id === id);
  try {
    return upsert(rows, mapCattleMoveFromDb({ ...(current ? mapCattleMoveToDb(current) : {}), ...payload, id } as CattleMoveRow));
  } catch { return rows; }
}

function overlayEvent(rows: CattleEvent[], payload: Record<string, unknown>): CattleEvent[] {
  const id = String(payload.id ?? '');
  if (!id) return rows;
  const current = rows.find(item => item.id === id);
  try {
    return upsert(rows, mapCattleEventFromDb({ ...(current ? mapCattleEventToDb(current) : {}), ...payload, id } as CattleEventRow));
  } catch { return rows; }
}

function latestMove(groupId: string, moves: CattleMove[]): CattleMove | undefined {
  return moves
    .filter(item => item.groupId === groupId && !item.deleted_at)
    .sort((a, b) => b.movedOn.localeCompare(a.movedOn) || b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id))[0];
}

/** Re-applies pending/parked RPC side effects to a server snapshot. */
export function applyParkedCattleMutations(
  groups: CattleGroup[],
  moves: CattleMove[],
  events: CattleEvent[],
  queue: QueuedMutation[],
  includePending = false,
): { groups: CattleGroup[]; moves: CattleMove[]; events: CattleEvent[] } {
  let nextGroups = groups;
  let nextMoves = moves;
  let nextEvents = events;
  const relevant = queue.filter(item =>
    (includePending || item.retry_count >= MAX_SYNC_RETRIES)
    && ['cattle_groups', 'cattle_moves', 'cattle_events'].includes(item.table_name));

  for (const mutation of relevant) {
    const payload = mutation.payload && typeof mutation.payload === 'object'
      ? mutation.payload as Record<string, unknown>
      : {};
    const rpc = readCattleRpcEnvelope(payload);
    const deletedAt = typeof payload.deleted_at === 'string' ? payload.deleted_at : new Date().toISOString();

    if (rpc?.rpc === 'move_cattle_group') {
      nextMoves = overlayMove(nextMoves, payload);
      const groupId = String(rpc.args.p_group_id ?? '');
      const movedOn = String(rpc.args.p_moved_on ?? '');
      nextGroups = nextGroups.map(group => group.id === groupId
        && (!group.currentSince || movedOn >= group.currentSince)
        ? { ...group, currentFieldId: typeof rpc.args.p_field_id === 'string' ? rpc.args.p_field_id : undefined, currentSince: movedOn }
        : group);
      continue;
    }

    if (rpc?.rpc === 'log_cattle_event') {
      const alreadyPresent = nextEvents.some(item => item.id === payload.id && !item.deleted_at);
      nextEvents = overlayEvent(nextEvents, payload);
      const groupId = String(rpc.args.p_group_id ?? '');
      const delta = Number(rpc.args.p_head_delta);
      if (!alreadyPresent && Number.isInteger(delta)) {
        nextGroups = nextGroups.map(group => group.id === groupId ? { ...group, headCount: group.headCount + delta } : group);
      }
      continue;
    }

    if (rpc?.rpc === 'transfer_cattle_head') {
      const fromId = String(rpc.args.p_from_event_id ?? '');
      const toId = String(rpc.args.p_to_event_id ?? '');
      const head = Number(rpc.args.p_head);
      if (!fromId || !toId || !Number.isInteger(head) || head <= 0) continue;
      const alreadyPresent = nextEvents.some(item => item.id === fromId && !item.deleted_at);
      const stamp = typeof payload.created_at === 'string' ? payload.created_at : new Date().toISOString();
      const notes = typeof rpc.args.p_notes === 'string' ? rpc.args.p_notes : null;
      nextEvents = overlayEvent(nextEvents, payload);
      nextEvents = overlayEvent(nextEvents, {
        id: toId, farm_id: payload.farm_id, group_id: rpc.args.p_to_group_id, event_type: 'head_added',
        event_date: rpc.args.p_event_date, head_delta: head, reason: null, notes, transfer_id: fromId,
        created_at: stamp, updated_at: stamp, deleted_at: null,
      });
      if (!alreadyPresent) {
        nextGroups = nextGroups.map(group => group.id === rpc.args.p_from_group_id
          ? { ...group, headCount: Math.max(0, group.headCount - head) }
          : group.id === rpc.args.p_to_group_id ? { ...group, headCount: group.headCount + head } : group);
      }
      continue;
    }

    if (rpc?.rpc === 'soft_delete_cattle_row') {
      const rowType = rpc.args.p_row_type;
      const rowId = String(rpc.args.p_row_id ?? payload.id ?? '');
      if (rowType === 'group') {
        nextGroups = nextGroups.map(item => item.id === rowId ? { ...item, deleted_at: item.deleted_at ?? deletedAt } : item);
        nextMoves = nextMoves.map(item => item.groupId === rowId ? { ...item, deleted_at: item.deleted_at ?? deletedAt } : item);
        nextEvents = nextEvents.map(item => item.groupId === rowId ? { ...item, deleted_at: item.deleted_at ?? deletedAt } : item);
      } else if (rowType === 'move') {
        const move = nextMoves.find(item => item.id === rowId);
        nextMoves = nextMoves.map(item => item.id === rowId ? { ...item, deleted_at: item.deleted_at ?? deletedAt } : item);
        if (move) {
          const latest = latestMove(move.groupId, nextMoves);
          nextGroups = nextGroups.map(group => group.id === move.groupId
            ? { ...group, currentFieldId: latest?.fieldId, currentSince: latest?.movedOn }
            : group);
        }
      } else if (rowType === 'event') {
        const event = nextEvents.find(item => item.id === rowId);
        if (event && !event.deleted_at) {
          // Either half of a transfer takes both halves with it; counts floor at zero.
          const halves = event.transferId
            ? nextEvents.filter(item => item.transferId === event.transferId && !item.deleted_at)
            : [event];
          const halfIds = new Set(halves.map(item => item.id));
          nextEvents = nextEvents.map(item => halfIds.has(item.id) ? { ...item, deleted_at: deletedAt } : item);
          nextGroups = nextGroups.map(group => {
            const delta = halves.filter(item => item.groupId === group.id).reduce((sum, item) => sum + item.headDelta, 0);
            return delta === 0 ? group : { ...group, headCount: Math.max(0, group.headCount - delta) };
          });
        }
      }
      continue;
    }

    if (mutation.table_name === 'cattle_groups') nextGroups = overlayGroup(nextGroups, payload);
  }
  return { groups: nextGroups, moves: nextMoves, events: nextEvents };
}
