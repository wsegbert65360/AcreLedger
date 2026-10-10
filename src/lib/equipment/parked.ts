import {
  mapEquipmentFromDb,
  mapEquipmentToDb,
  mapMaintenanceLogFromDb,
  mapMaintenanceLogToDb,
  mapMaintenanceScheduleFromDb,
  mapMaintenanceScheduleToDb,
} from '@/lib/mappers';
import { MAX_SYNC_RETRIES, readEquipmentRpcEnvelope, type QueuedMutation } from '@/lib/syncQueue';
import type {
  Equipment,
  EquipmentRow,
  MaintenanceLog,
  MaintenanceLogRow,
  MaintenanceSchedule,
  MaintenanceScheduleRow,
} from '@/types/equipment';

const EQUIPMENT_TABLES = new Set(['equipment', 'maintenance_schedules', 'maintenance_logs']);

function upsert<T extends { id: string }>(list: T[], item: T): T[] {
  const index = list.findIndex(entry => entry.id === item.id);
  if (index === -1) return [...list, item];
  const next = list.slice();
  next[index] = item;
  return next;
}

function overlayEquipment(current: Equipment[], payload: Record<string, unknown>): Equipment[] {
  const id = String(payload.id ?? '');
  if (!id) return current;
  const existing = current.find(item => item.id === id);
  const row = {
    ...(existing ? mapEquipmentToDb(existing) : {}),
    ...payload,
    id,
  } as EquipmentRow;
  try {
    return upsert(current, mapEquipmentFromDb(row));
  } catch {
    return current;
  }
}

function overlaySchedule(current: MaintenanceSchedule[], payload: Record<string, unknown>): MaintenanceSchedule[] {
  const id = String(payload.id ?? '');
  if (!id) return current;
  const existing = current.find(item => item.id === id);
  const row = {
    ...(existing ? mapMaintenanceScheduleToDb(existing) : {}),
    ...payload,
    id,
  } as MaintenanceScheduleRow;
  try {
    return upsert(current, mapMaintenanceScheduleFromDb(row));
  } catch {
    return current;
  }
}

function overlayLog(current: MaintenanceLog[], payload: Record<string, unknown>): MaintenanceLog[] {
  const id = String(payload.id ?? '');
  if (!id) return current;
  const existing = current.find(item => item.id === id);
  const row = {
    ...(existing ? mapMaintenanceLogToDb(existing) : {}),
    ...payload,
    id,
  } as MaintenanceLogRow;
  try {
    return upsert(current, mapMaintenanceLogFromDb(row));
  } catch {
    return current;
  }
}

function markDeleted<T extends { id: string; deleted_at: string | null }>(
  list: T[],
  id: string,
  deletedAt: string,
): T[] {
  return list.map(item => item.id === id ? { ...item, deleted_at: deletedAt } : item);
}

/**
 * Re-apply parked equipment queue items onto a cloud snapshot so a failed
 * local insert/update stays visible after fetchData(). Other tables keep the
 * existing cloud-snapshot behavior.
 */
export function applyParkedEquipmentMutations(
  equipment: Equipment[],
  schedules: MaintenanceSchedule[],
  logs: MaintenanceLog[],
  parked: QueuedMutation[],
): { equipment: Equipment[]; schedules: MaintenanceSchedule[]; logs: MaintenanceLog[] } {
  let nextEquipment = equipment;
  let nextSchedules = schedules;
  let nextLogs = logs;
  const relevant = parked.filter(item =>
    item.retry_count >= MAX_SYNC_RETRIES && EQUIPMENT_TABLES.has(item.table_name),
  );

  for (const mutation of relevant) {
    const payload = (mutation.payload && typeof mutation.payload === 'object')
      ? mutation.payload as Record<string, unknown>
      : {};
    const rpc = readEquipmentRpcEnvelope(payload);
    const deletedAt = typeof payload.deleted_at === 'string'
      ? payload.deleted_at
      : new Date().toISOString();

    if (rpc?.rpc === 'soft_delete_equipment_cascade') {
      const equipmentId = String(rpc.args.p_equipment_id ?? payload.id ?? '');
      if (!equipmentId) continue;
      nextEquipment = nextEquipment.map(item => item.id === equipmentId ? { ...item, deleted_at: deletedAt } : item);
      nextSchedules = nextSchedules.map(item => item.equipmentId === equipmentId ? { ...item, deleted_at: deletedAt } : item);
      nextLogs = nextLogs.map(item => item.equipmentId === equipmentId ? { ...item, deleted_at: deletedAt } : item);
      continue;
    }

    if (rpc?.rpc === 'update_equipment_reading') {
      const equipmentId = String(rpc.args.p_equipment_id ?? payload.id ?? '');
      const reading = Number(rpc.args.p_reading);
      if (!equipmentId || !Number.isFinite(reading)) continue;
      nextEquipment = nextEquipment.map(item => item.id === equipmentId
        ? { ...item, currentReading: reading }
        : item);
      continue;
    }

    if (rpc?.rpc === 'set_equipment_meter_unit') {
      const equipmentId = String(rpc.args.p_equipment_id ?? payload.id ?? '');
      const toUnit = rpc.args.p_to_unit;
      if (!equipmentId || (toUnit !== 'hours' && toUnit !== 'miles' && toUnit !== 'km')) continue;
      const reading = rpc.args.p_current_reading == null ? undefined : Number(rpc.args.p_current_reading);
      nextEquipment = nextEquipment.map(item => item.id === equipmentId
        ? {
          ...item,
          meterUnit: toUnit,
          currentReading: Number.isFinite(reading) ? reading as number : item.currentReading,
        }
        : item);
      continue;
    }

    if (rpc?.rpc === 'log_maintenance') {
      nextLogs = overlayLog(nextLogs, { ...payload, id: rpc.args.p_log_id ?? payload.id });
      continue;
    }

    if (mutation.table_name === 'equipment') {
      if (mutation.operation === 'soft_delete') {
        nextEquipment = markDeleted(nextEquipment, String(payload.id ?? ''), deletedAt);
      } else {
        nextEquipment = overlayEquipment(nextEquipment, payload);
      }
    } else if (mutation.table_name === 'maintenance_schedules') {
      if (mutation.operation === 'soft_delete') {
        nextSchedules = markDeleted(nextSchedules, String(payload.id ?? ''), deletedAt);
      } else {
        nextSchedules = overlaySchedule(nextSchedules, payload);
      }
    } else if (mutation.table_name === 'maintenance_logs') {
      if (mutation.operation === 'soft_delete') {
        nextLogs = markDeleted(nextLogs, String(payload.id ?? ''), deletedAt);
      } else {
        nextLogs = overlayLog(nextLogs, payload);
      }
    }
  }

  return { equipment: nextEquipment, schedules: nextSchedules, logs: nextLogs };
}
