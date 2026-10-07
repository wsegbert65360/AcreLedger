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
    const convertedReading = hoursInvolved
      ? options.currentReading
      : convertMeterUnit(previous.currentReading, previous.meterUnit, toUnit) ?? options.currentReading;
    if (convertedReading == null || convertedReading < 0) {
      toast.error('Enter a meter reading for the new unit.');
      return false;
    }

    const nextSchedules = maintenanceSchedules.map(schedule => {
      if (schedule.equipmentId !== id || schedule.deleted_at || schedule.intervalValue == null) return schedule;
      const supplied = options.schedules?.find(item => item.id === schedule.id);
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
        ? (options.schedules ?? []).map(item => ({
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
    const lastDoneReading = input.lastDoneReading ?? (
      input.intervalValue != null && machine ? machine.currentReading : undefined
    );
    const record: MaintenanceSchedule = {
      ...input,
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

  const updateMaintenanceSchedule = useCallback(async (record: MaintenanceSchedule): Promise<boolean> => {
    if (!farm_id) { toast.error('No farm selected.'); return false; }
    const previous = maintenanceSchedules.find(item => item.id === record.id);
    const updated = { ...record, farm_id, updatedAt: new Date().toISOString() };
    setMaintenanceSchedules(current => current.map(item => item.id === record.id ? updated : item));
    const ok = await persist('maintenance_schedules', 'update', mapMaintenanceScheduleUpdateToDb(updated));
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
    input: Omit<MaintenanceLog, 'id' | 'farm_id' | 'createdAt' | 'updatedAt' | 'deleted_at'>,
    forceLower = false,
  ): Promise<boolean> => {
    if (!farm_id) { toast.error('No farm selected.'); return false; }
    const machine = equipment.find(item => item.id === input.equipmentId);
    if (!machine) return false;
    if (input.readingAtService != null) {
      const readingResult = applyReadingUpdate(machine, input.readingAtService, { force: forceLower });
      if (readingResult.status !== 'applied') return false;
    }
    const now = new Date().toISOString();
    const record: MaintenanceLog = { ...input, id: crypto.randomUUID(), farm_id, createdAt: now, updatedAt: now, deleted_at: null };
    const mapped = mapMaintenanceLogToDb(record);
    const priorSchedules = maintenanceSchedules;
    const priorEquipment = equipment;
    setMaintenanceLogs(current => [...current, record]);
    if (input.readingAtService != null) {
      setEquipment(current => current.map(item => item.id === input.equipmentId ? {
        ...item,
        currentReading: forceLower ? input.readingAtService! : Math.max(item.currentReading, input.readingAtService!),
        readingUpdatedAt: now,
      } : item));
    }
    if (input.scheduleId) {
      setMaintenanceSchedules(current => current.map(item => {
        if (item.id !== input.scheduleId) return item;
        const shouldAdvance = !item.lastDoneAt || input.performedOn >= item.lastDoneAt;
        if (!shouldAdvance) return item;
        return {
          ...item,
          lastDoneReading: input.readingAtService ?? item.lastDoneReading,
          lastDoneAt: input.performedOn,
          updatedAt: now,
        };
      }));
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
      setMaintenanceLogs(current => current.filter(item => item.id !== record.id));
      setMaintenanceSchedules(priorSchedules);
      setEquipment(priorEquipment);
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
