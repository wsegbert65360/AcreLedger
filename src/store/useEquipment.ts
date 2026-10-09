import { useCallback } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { isUnknownMutationOutcome } from '@/lib/mutationOutcome';
import {
  mapEquipmentToDb,
  mapEquipmentUpdateToDb,
  mapMaintenanceLogToDb,
  mapMaintenanceLogUpdateToDb,
  mapMaintenanceScheduleToDb,
  mapMaintenanceScheduleUpdateToDb,
} from '@/lib/mappers';
import {
  EQUIPMENT_RPC_KEY,
  type EquipmentRpcName,
  syncQueue,
} from '@/lib/syncQueue';
import { applyReadingUpdate, convertMeterUnit } from '@/lib/equipment';
import type { Equipment, MaintenanceLog, MaintenanceSchedule, MeterUnit } from '@/types/equipment';

interface UseEquipmentArgs {
  farm_id: string | null;
  equipment: Equipment[];
  maintenanceSchedules: MaintenanceSchedule[];
  maintenanceLogs: MaintenanceLog[];
  setEquipment: React.Dispatch<React.SetStateAction<Equipment[]>>;
  setMaintenanceSchedules: React.Dispatch<React.SetStateAction<MaintenanceSchedule[]>>;
  setMaintenanceLogs: React.Dispatch<React.SetStateAction<MaintenanceLog[]>>;
  isOnline: boolean;
  onMutation?: () => void | Promise<void>;
}

type TableName = 'equipment' | 'maintenance_schedules' | 'maintenance_logs';
type Operation = 'insert' | 'update' | 'soft_delete';

export interface MeterUnitChangeOptions {
  currentReading?: number;
  schedules?: Array<{ id: string; intervalValue: number; lastDoneReading: number | null }>;
}

function stripUpdateIdentity(payload: Record<string, unknown>): Record<string, unknown> {
  const { id: _id, farm_id: _farmId, ...update } = payload;
  return update;
}

function readingFromRpc(data: unknown): number | null {
  if (!data || typeof data !== 'object') return null;
  const value = Number((data as { current_reading?: unknown }).current_reading);
  return Number.isFinite(value) ? value : null;
}

function roundTo(value: number, places: number): number {
  const factor = 10 ** places;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

/** Meter columns are NUMERIC(10,1). Rounding before the write keeps the queued
 * payload equal to the stored row, which offline replay reconciliation compares. */
function roundReading<T extends number | undefined>(value: T): T {
  return (value == null ? value : roundTo(value, 1)) as T;
}

/** Returns null when a reading or cost is not a finite, non-negative number. */
function normalizeLogAmounts<T extends Pick<MaintenanceLog, 'readingAtService' | 'costParts' | 'costLabor'>>(
  input: T,
): T | null {
  const nonNegative = (value: number | undefined): boolean => value == null || (Number.isFinite(value) && value >= 0);
  if (!nonNegative(input.readingAtService) || !nonNegative(input.costParts) || !nonNegative(input.costLabor)) {
    return null;
  }
  return {
    ...input,
    readingAtService: input.readingAtService == null ? undefined : roundTo(input.readingAtService, 1),
    costParts: input.costParts == null ? undefined : roundTo(input.costParts, 2),
    costLabor: input.costLabor == null ? undefined : roundTo(input.costLabor, 2),
  };
}

export function useEquipment({
  farm_id,
  equipment,
  maintenanceSchedules,
  maintenanceLogs,
  setEquipment,
  setMaintenanceSchedules,
  setMaintenanceLogs,
  isOnline,
  onMutation,
}: UseEquipmentArgs) {
  const persist = useCallback(async (
    table: TableName,
    operation: Operation,
    payload: Record<string, unknown>,
  ): Promise<boolean> => {
    if (!farm_id) return false;
    if (!isOnline) {
      await syncQueue.enqueueMutation(table, operation, payload, farm_id);
      if (onMutation) await onMutation();
      return true;
    }

    try {
      let response;
      if (operation === 'insert') {
        response = await supabase.from(table).insert([{ ...payload, farm_id }]);
      } else if (operation === 'update') {
        response = await supabase.from(table)
          .update(stripUpdateIdentity(payload), { count: 'exact' })
          .eq('id', payload.id)
          .eq('farm_id', farm_id);
      } else {
        response = await supabase.from(table)
          .update({ deleted_at: payload.deleted_at }, { count: 'exact' })
          .eq('id', payload.id)
          .eq('farm_id', farm_id);
      }

      if (!response.error && (operation === 'insert' || response.count === 1)) return true;
      if (response.error && isUnknownMutationOutcome(response.error)) {
        await syncQueue.enqueueMutation(table, operation, payload, farm_id);
        if (onMutation) await onMutation();
        return true;
      }
      console.error(`Failed to ${operation} ${table}:`, response.error ?? 'unexpected row count');
      return false;
    } catch (error) {
      if (isUnknownMutationOutcome(error)) {
        await syncQueue.enqueueMutation(table, operation, payload, farm_id);
        if (onMutation) await onMutation();
        return true;
      }
      console.error(`Failed to ${operation} ${table}:`, error);
      return false;
    }
  }, [farm_id, isOnline, onMutation]);

  const persistRpc = useCallback(async (
    rpc: EquipmentRpcName,
    args: Record<string, unknown>,
    queue: { table: TableName; operation: Operation; payload: Record<string, unknown> },
  ): Promise<{ ok: boolean; data: unknown }> => {
    if (!farm_id) return { ok: false, data: null };
    const payload = { ...queue.payload, [EQUIPMENT_RPC_KEY]: { rpc, args } };
    if (!isOnline) {
      await syncQueue.enqueueMutation(queue.table, queue.operation, payload, farm_id);
      if (onMutation) await onMutation();
      return { ok: true, data: null };
    }
    try {
      const response = await supabase.rpc(rpc, { ...args, p_farm_id: farm_id });
      if (!response.error) return { ok: true, data: response.data };
      if (isUnknownMutationOutcome(response.error)) {
        await syncQueue.enqueueMutation(queue.table, queue.operation, payload, farm_id);
        if (onMutation) await onMutation();
        return { ok: true, data: null };
      }
      console.error(`Failed equipment RPC ${rpc}:`, response.error);
      return { ok: false, data: null };
    } catch (error) {
      if (isUnknownMutationOutcome(error)) {
        await syncQueue.enqueueMutation(queue.table, queue.operation, payload, farm_id);
        if (onMutation) await onMutation();
        return { ok: true, data: null };
      }
      console.error(`Failed equipment RPC ${rpc}:`, error);
      return { ok: false, data: null };
    }
  }, [farm_id, isOnline, onMutation]);

  const addEquipment = useCallback(async (
    input: Omit<Equipment, 'id' | 'farm_id' | 'createdAt' | 'updatedAt' | 'deleted_at'>,
  ): Promise<boolean> => {
    if (!farm_id) {
      toast.error('No farm selected.');
      return false;
    }
    const now = new Date().toISOString();
    const record: Equipment = {
      ...input,
      currentReading: roundReading(input.currentReading),
      id: crypto.randomUUID(),
      farm_id,
      createdAt: now,
      updatedAt: now,
      deleted_at: null,
    };
    const mapped = mapEquipmentToDb(record);
    setEquipment(current => [...current, record]);
    const ok = await persist('equipment', 'insert', mapped);
    if (!ok) setEquipment(current => current.filter(item => item.id !== record.id));
    toast[ok ? 'success' : 'error'](ok ? 'Equipment added.' : 'Failed to add equipment.');
    return ok;
  }, [farm_id, persist, setEquipment]);

  const updateEquipment = useCallback(async (record: Equipment): Promise<boolean> => {
    if (!farm_id) {
      toast.error('No farm selected.');
      return false;
    }
    const previous = equipment.find(item => item.id === record.id);
    const updated = { ...record, farm_id, updatedAt: new Date().toISOString() };
    const mapped = mapEquipmentUpdateToDb(updated);
    setEquipment(current => current.map(item => item.id === updated.id ? updated : item));
    const ok = await persist('equipment', 'update', mapped);
    if (!ok && previous) setEquipment(current => current.map(item => item.id === previous.id ? previous : item));
    toast[ok ? 'success' : 'error'](ok ? 'Equipment updated.' : 'Failed to update equipment.');
    return ok;
  }, [equipment, farm_id, persist, setEquipment]);

  const updateEquipmentReading = useCallback(async (
    id: string,
    reading: number,
    force = false,
  ): Promise<'saved' | 'warning' | 'failed'> => {
    if (!farm_id) {
      toast.error('No farm selected.');
      return 'failed';
    }
    const previous = equipment.find(item => item.id === id);
    if (!previous) return 'failed';
    const result = applyReadingUpdate(previous, reading, { force });
    if (result.status === 'warning') return 'warning';
    if (result.status === 'invalid') return 'failed';

    const updated = { ...result.equipment, updatedAt: new Date().toISOString() };
    setEquipment(current => current.map(item => item.id === id ? updated : item));
    const { ok, data } = await persistRpc('update_equipment_reading', {
      p_farm_id: farm_id,
      p_equipment_id: id,
      p_reading: updated.currentReading,
      p_force_lower: force,
    }, {
      table: 'equipment',
      operation: 'update',
      payload: { id },
    });
    if (!ok) {
      setEquipment(current => current.map(item => item.id === id ? previous : item));
      return 'failed';
    }
    const stored = readingFromRpc(data);
    if (stored != null) {
      setEquipment(current => current.map(item => item.id === id ? { ...item, currentReading: stored } : item));
    }
    return 'saved';
  }, [equipment, farm_id, persistRpc, setEquipment]);

  const setEquipmentMeterUnit = useCallback(async (
    id: string,
    fromUnit: MeterUnit,
    toUnit: MeterUnit,
    options: MeterUnitChangeOptions = {},
  ): Promise<boolean> => {
    if (!farm_id) {
      toast.error('No farm selected.');
      return false;
    }
    const previous = equipment.find(item => item.id === id);
    if (!previous) return false;
    if (previous.meterUnit === toUnit) return true;

    const previousSchedules = maintenanceSchedules;
    const now = new Date().toISOString();
    const hoursInvolved = previous.meterUnit === 'hours' || toUnit === 'hours';
    const convertedReading = roundReading(hoursInvolved
      ? options.currentReading
      : convertMeterUnit(previous.currentReading, previous.meterUnit, toUnit) ?? options.currentReading);
    const suppliedSchedules = options.schedules?.map(item => ({
      ...item,
      intervalValue: roundReading(item.intervalValue),
      lastDoneReading: item.lastDoneReading == null ? null : roundReading(item.lastDoneReading),
    }));
    if (convertedReading == null || convertedReading < 0) {
      toast.error('Enter a meter reading for the new unit.');
      return false;
    }

    const nextSchedules = maintenanceSchedules.map(schedule => {
      if (schedule.equipmentId !== id || schedule.deleted_at || schedule.intervalValue == null) return schedule;
      const supplied = suppliedSchedules?.find(item => item.id === schedule.id);
      if (hoursInvolved) {
        return {
          ...schedule,
          intervalValue: supplied?.intervalValue ?? schedule.intervalValue,
          lastDoneReading: supplied?.lastDoneReading ?? convertedReading,
          updatedAt: now,
        };
      }
      return {
        ...schedule,
        intervalValue: convertMeterUnit(schedule.intervalValue, previous.meterUnit, toUnit) ?? schedule.intervalValue,
        lastDoneReading: schedule.lastDoneReading == null
          ? undefined
          : convertMeterUnit(schedule.lastDoneReading, previous.meterUnit, toUnit) ?? undefined,
        updatedAt: now,
      };
    });

    setEquipment(current => current.map(item => item.id === id
      ? { ...item, meterUnit: toUnit, currentReading: convertedReading, readingUpdatedAt: now, updatedAt: now }
      : item));
    setMaintenanceSchedules(nextSchedules);

    const { ok, data } = await persistRpc('set_equipment_meter_unit', {
      p_farm_id: farm_id,
      p_equipment_id: id,
      p_from_unit: fromUnit,
      p_to_unit: toUnit,
      p_current_reading: hoursInvolved ? convertedReading : null,
      p_schedules: hoursInvolved
        ? (suppliedSchedules ?? []).map(item => ({
          id: item.id,
          interval_value: item.intervalValue,
          last_done_reading: item.lastDoneReading ?? convertedReading,
        }))
        : null,
    }, {
      table: 'equipment',
      operation: 'update',
      payload: { id },
    });
    if (!ok) {
      setEquipment(current => current.map(item => item.id === id ? previous : item));
      setMaintenanceSchedules(previousSchedules);
      toast.error('Failed to change the meter unit.');
      return false;
    }
    const stored = readingFromRpc(data);
    if (stored != null) {
      setEquipment(current => current.map(item => item.id === id ? { ...item, currentReading: stored } : item));
    }
    return true;
  }, [equipment, farm_id, maintenanceSchedules, persistRpc, setEquipment, setMaintenanceSchedules]);

  const deleteEquipment = useCallback(async (id: string): Promise<boolean> => {
    if (!farm_id) {
      toast.error('No farm selected.');
      return false;
    }
    const deletedAt = new Date().toISOString();
    const previousEquipment = equipment;
    const previousSchedules = maintenanceSchedules;
    const previousLogs = maintenanceLogs;
    setEquipment(current => current.map(item => item.id === id ? { ...item, deleted_at: deletedAt } : item));
    setMaintenanceSchedules(current => current.map(item => item.equipmentId === id ? { ...item, deleted_at: deletedAt } : item));
    setMaintenanceLogs(current => current.map(item => item.equipmentId === id ? { ...item, deleted_at: deletedAt } : item));

    const { ok } = await persistRpc('soft_delete_equipment_cascade', {
      p_farm_id: farm_id,
      p_equipment_id: id,
    }, {
      table: 'equipment',
      operation: 'soft_delete',
      payload: { id, deleted_at: deletedAt },
    });
    if (!ok) {
      setEquipment(previousEquipment);
      setMaintenanceSchedules(previousSchedules);
      setMaintenanceLogs(previousLogs);
      return false;
    }
    return true;
  }, [equipment, farm_id, maintenanceLogs, maintenanceSchedules, persistRpc, setEquipment, setMaintenanceLogs, setMaintenanceSchedules]);

  const addMaintenanceSchedule = useCallback(async (
    input: Omit<MaintenanceSchedule, 'id' | 'farm_id' | 'createdAt' | 'updatedAt' | 'deleted_at'>,
  ): Promise<boolean> => {
    if (!farm_id) { toast.error('No farm selected.'); return false; }
    const machine = equipment.find(item => item.id === input.equipmentId);
    const duplicate = maintenanceSchedules.some(item =>
      item.equipmentId === input.equipmentId
      && !item.deleted_at
      && item.taskName.trim().toLowerCase() === input.taskName.trim().toLowerCase(),
    );
    if (duplicate) {
      toast.error('That task name is already used on this machine.');
      return false;
    }
    const now = new Date().toISOString();
    const lastDoneReading = roundReading(input.lastDoneReading ?? (
      input.intervalValue != null && machine ? machine.currentReading : undefined
    ));
    const record: MaintenanceSchedule = {
      ...input,
      intervalValue: roundReading(input.intervalValue),
      lastDoneReading,
      id: crypto.randomUUID(),
      farm_id,
      createdAt: now,
      updatedAt: now,
      deleted_at: null,
    };
    const mapped = mapMaintenanceScheduleToDb(record);
    setMaintenanceSchedules(current => [...current, record]);
    const ok = await persist('maintenance_schedules', 'insert', mapped);
    if (!ok) setMaintenanceSchedules(current => current.filter(item => item.id !== record.id));
    return ok;
  }, [equipment, farm_id, maintenanceSchedules, persist, setMaintenanceSchedules]);

  const updateMaintenanceSchedule = useCallback(async (
    record: MaintenanceSchedule,
    options: { baselineEdited?: boolean } = {},
  ): Promise<boolean> => {
    if (!farm_id) { toast.error('No farm selected.'); return false; }
    const previous = maintenanceSchedules.find(item => item.id === record.id);
    // The form was opened from a possibly stale copy. Unless the user edited the
    // last-done baseline, keep the stored baseline so a newer log from another
    // device or an earlier queued log is not overwritten.
    const baselineEdited = options.baselineEdited ?? true;
    const keepBaseline = !baselineEdited && previous
      ? { lastDoneReading: previous.lastDoneReading, lastDoneAt: previous.lastDoneAt }
      : {};
    const updated = {
      ...record,
      intervalValue: roundReading(record.intervalValue),
      lastDoneReading: roundReading(record.lastDoneReading),
      ...keepBaseline,
      farm_id,
      updatedAt: new Date().toISOString(),
    };
    setMaintenanceSchedules(current => current.map(item => item.id === record.id ? updated : item));
    const payload = mapMaintenanceScheduleUpdateToDb(updated);
    if (!baselineEdited) {
      delete payload.last_done_reading;
      delete payload.last_done_at;
    }
    const ok = await persist('maintenance_schedules', 'update', payload);
    if (!ok && previous) setMaintenanceSchedules(current => current.map(item => item.id === record.id ? previous : item));
    return ok;
  }, [farm_id, maintenanceSchedules, persist, setMaintenanceSchedules]);

  const deleteMaintenanceSchedule = useCallback(async (id: string): Promise<boolean> => {
    if (!farm_id) { toast.error('No farm selected.'); return false; }
    const previous = maintenanceSchedules.find(item => item.id === id);
    const deletedAt = new Date().toISOString();
    setMaintenanceSchedules(current => current.map(item => item.id === id ? { ...item, deleted_at: deletedAt } : item));
    const ok = await persist('maintenance_schedules', 'soft_delete', { id, deleted_at: deletedAt });
    if (!ok && previous) setMaintenanceSchedules(current => current.map(item => item.id === id ? previous : item));
    return ok;
  }, [farm_id, maintenanceSchedules, persist, setMaintenanceSchedules]);

  const logMaintenance = useCallback(async (
    rawInput: Omit<MaintenanceLog, 'id' | 'farm_id' | 'createdAt' | 'updatedAt' | 'deleted_at'>,
    forceLower = false,
  ): Promise<boolean> => {
    if (!farm_id) { toast.error('No farm selected.'); return false; }
    const machine = equipment.find(item => item.id === rawInput.equipmentId);
    if (!machine) return false;
    // Money and meters are stored at 0.01 / 0.1 precision. Normalize before the
    // optimistic update and the RPC so a replay compares identical values.
    const input = normalizeLogAmounts(rawInput);
    if (!input) {
      toast.error('Enter a valid reading and non-negative costs.');
      return false;
    }
    // A back-dated service is a historical fact. It must not move the meter
    // backwards; the RPC keeps the higher reading unless forceLower is set.
    const readingMoves = input.readingAtService != null && (
      forceLower
        ? input.readingAtService !== machine.currentReading
        : input.readingAtService > machine.currentReading
    );
    const now = new Date().toISOString();
    const record: MaintenanceLog = { ...input, id: crypto.randomUUID(), farm_id, createdAt: now, updatedAt: now, deleted_at: null };
    const mapped = mapMaintenanceLogToDb(record);
    const priorMachine = machine;
    const priorSchedule = input.scheduleId
      ? maintenanceSchedules.find(item => item.id === input.scheduleId)
      : undefined;
    setMaintenanceLogs(current => [...current, record]);
    if (readingMoves) {
      setEquipment(current => current.map(item => item.id === input.equipmentId ? {
        ...item,
        currentReading: input.readingAtService!,
        readingUpdatedAt: now,
      } : item));
    }
    const scheduleAdvances = Boolean(priorSchedule && (
      !priorSchedule.lastDoneAt || input.performedOn >= priorSchedule.lastDoneAt
    ));
    if (input.scheduleId && scheduleAdvances) {
      setMaintenanceSchedules(current => current.map(item => item.id === input.scheduleId ? {
        ...item,
        lastDoneReading: input.readingAtService ?? item.lastDoneReading,
        lastDoneAt: input.performedOn,
        updatedAt: now,
      } : item));
    }

    const rpcArgs = {
      p_farm_id: farm_id, p_log_id: record.id, p_equipment_id: record.equipmentId,
      p_schedule_id: record.scheduleId ?? null, p_kind: record.kind,
      p_performed_on: record.performedOn, p_reading: record.readingAtService ?? null,
      p_description: record.description ?? null, p_performed_by: record.performedBy ?? null,
      p_vendor: record.vendor ?? null, p_cost_parts: record.costParts ?? null,
      p_cost_labor: record.costLabor ?? null, p_force_lower: forceLower,
    };
    const { ok, data } = await persistRpc('log_maintenance', rpcArgs, {
      table: 'maintenance_logs',
      operation: 'insert',
      payload: mapped,
    });
    if (!ok) {
      // Revert only what this call touched so concurrent edits survive.
      setMaintenanceLogs(current => current.filter(item => item.id !== record.id));
      if (readingMoves) {
        setEquipment(current => current.map(item => item.id === priorMachine.id ? priorMachine : item));
      }
      if (scheduleAdvances && priorSchedule) {
        setMaintenanceSchedules(current => current.map(item => item.id === priorSchedule.id ? priorSchedule : item));
      }
      return false;
    }
    const stored = readingFromRpc(data);
    if (stored != null) {
      setEquipment(current => current.map(item => item.id === input.equipmentId ? { ...item, currentReading: stored } : item));
    }
    return true;
  }, [equipment, farm_id, maintenanceSchedules, persistRpc, setEquipment, setMaintenanceLogs, setMaintenanceSchedules]);

  const updateMaintenanceLog = useCallback(async (record: MaintenanceLog): Promise<boolean> => {
    if (!farm_id) { toast.error('No farm selected.'); return false; }
    const previous = maintenanceLogs.find(item => item.id === record.id);
    const updated = { ...record, farm_id, updatedAt: new Date().toISOString() };
    setMaintenanceLogs(current => current.map(item => item.id === record.id ? updated : item));
    const ok = await persist('maintenance_logs', 'update', mapMaintenanceLogUpdateToDb(updated));
    if (!ok && previous) setMaintenanceLogs(current => current.map(item => item.id === record.id ? previous : item));
    return ok;
  }, [farm_id, maintenanceLogs, persist, setMaintenanceLogs]);

  const deleteMaintenanceLog = useCallback(async (id: string): Promise<boolean> => {
    if (!farm_id) { toast.error('No farm selected.'); return false; }
    const previous = maintenanceLogs.find(item => item.id === id);
    const deletedAt = new Date().toISOString();
    setMaintenanceLogs(current => current.map(item => item.id === id ? { ...item, deleted_at: deletedAt } : item));
    const ok = await persist('maintenance_logs', 'soft_delete', { id, deleted_at: deletedAt });
    if (!ok && previous) setMaintenanceLogs(current => current.map(item => item.id === id ? previous : item));
    return ok;
  }, [farm_id, maintenanceLogs, persist, setMaintenanceLogs]);

  return {
    addEquipment,
    updateEquipment,
    updateEquipmentReading,
    setEquipmentMeterUnit,
    deleteEquipment,
    addMaintenanceSchedule,
    updateMaintenanceSchedule,
    deleteMaintenanceSchedule,
    logMaintenance,
    updateMaintenanceLog,
    deleteMaintenanceLog,
  };
}
