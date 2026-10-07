import { useCallback } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { isUnknownMutationOutcome } from '@/lib/mutationOutcome';
import {
  mapEquipmentToDb,
  mapMaintenanceLogToDb,
  mapMaintenanceScheduleToDb,
} from '@/lib/mappers';
import { MAINTENANCE_RPC_KEY, READING_FORCE_KEY, syncQueue } from '@/lib/syncQueue';
import { applyReadingUpdate } from '@/lib/equipment';
import type { Equipment, MaintenanceLog, MaintenanceSchedule } from '@/types/equipment';

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

function stripUpdateIdentity(payload: Record<string, unknown>): Record<string, unknown> {
  const { id: _id, farm_id: _farmId, ...update } = payload;
  return update;
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
    const mapped = mapEquipmentToDb(updated);
    // Meter writes use updateEquipmentReading so stale edit forms cannot lower
    // a reading written by another device.
    delete mapped.current_reading;
    delete mapped.reading_updated_at;
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
    const payload = {
      id,
      current_reading: updated.currentReading,
      reading_updated_at: updated.readingUpdatedAt,
      [READING_FORCE_KEY]: force,
    };
    setEquipment(current => current.map(item => item.id === id ? updated : item));

    if (!isOnline) {
      try {
        await syncQueue.enqueueMutation('equipment', 'update', payload, farm_id);
        if (onMutation) await onMutation();
        return 'saved';
      } catch (error) {
        console.error('Failed to queue equipment reading:', error);
        setEquipment(current => current.map(item => item.id === id ? previous : item));
        return 'failed';
      }
    }

    try {
      let query = supabase.from('equipment')
        .update({
          current_reading: updated.currentReading,
          reading_updated_at: updated.readingUpdatedAt,
        }, { count: 'exact' })
        .eq('id', id)
        .eq('farm_id', farm_id);
      if (!force) query = query.lte('current_reading', updated.currentReading);
      const response = await query;
      if (!response.error && response.count === 1) return 'saved';
      if (!response.error && response.count === 0 && !force) {
        const { data } = await supabase.from('equipment')
          .select('current_reading, reading_updated_at')
          .eq('id', id)
          .eq('farm_id', farm_id)
          .maybeSingle();
        const cloudReading = Number(data?.current_reading);
        if (Number.isFinite(cloudReading) && cloudReading >= updated.currentReading) {
          setEquipment(current => current.map(item => item.id === id ? {
            ...item,
            currentReading: cloudReading,
            readingUpdatedAt: data?.reading_updated_at ?? item.readingUpdatedAt,
          } : item));
          return 'saved';
        }
      }
      if (response.error && isUnknownMutationOutcome(response.error)) {
        await syncQueue.enqueueMutation('equipment', 'update', payload, farm_id);
        if (onMutation) await onMutation();
        return 'saved';
      }
      setEquipment(current => current.map(item => item.id === id ? previous : item));
      return 'failed';
    } catch (error) {
      if (isUnknownMutationOutcome(error)) {
        try {
          await syncQueue.enqueueMutation('equipment', 'update', payload, farm_id);
          if (onMutation) await onMutation();
          return 'saved';
        } catch (queueError) {
          console.error('Failed to queue uncertain equipment reading:', queueError);
        }
      }
      setEquipment(current => current.map(item => item.id === id ? previous : item));
      return 'failed';
    }
  }, [equipment, farm_id, isOnline, onMutation, setEquipment]);

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

    const items = [
      ...maintenanceLogs.filter(item => item.equipmentId === id && !item.deleted_at).map(item => ({
        tableName: 'maintenance_logs', operation: 'soft_delete' as const,
        payload: { id: item.id, deleted_at: deletedAt }, farmId: farm_id,
      })),
      ...maintenanceSchedules.filter(item => item.equipmentId === id && !item.deleted_at).map(item => ({
        tableName: 'maintenance_schedules', operation: 'soft_delete' as const,
        payload: { id: item.id, deleted_at: deletedAt }, farmId: farm_id,
      })),
      { tableName: 'equipment', operation: 'soft_delete' as const, payload: { id, deleted_at: deletedAt }, farmId: farm_id },
    ];

    try {
      if (!isOnline) {
        await syncQueue.enqueueMutations(items);
        if (onMutation) await onMutation();
        return true;
      }
      // Child-first soft deletes keep active children from referencing a hidden
      // parent if a later request fails.
      for (const item of items) {
        const response = await supabase.from(item.tableName)
          .update({ deleted_at: deletedAt }, { count: 'exact' })
          .eq('id', item.payload.id)
          .eq('farm_id', farm_id);
        if (response.error || response.count !== 1) throw response.error ?? new Error('Unexpected row count');
      }
      return true;
    } catch (error) {
      console.error('Failed to delete equipment:', error);
      setEquipment(previousEquipment);
      setMaintenanceSchedules(previousSchedules);
      setMaintenanceLogs(previousLogs);
      return false;
    }
  }, [equipment, farm_id, isOnline, maintenanceLogs, maintenanceSchedules, onMutation, setEquipment, setMaintenanceLogs, setMaintenanceSchedules]);

  const addMaintenanceSchedule = useCallback(async (
    input: Omit<MaintenanceSchedule, 'id' | 'farm_id' | 'createdAt' | 'updatedAt' | 'deleted_at'>,
  ): Promise<boolean> => {
    if (!farm_id) { toast.error('No farm selected.'); return false; }
    const now = new Date().toISOString();
    const record: MaintenanceSchedule = { ...input, id: crypto.randomUUID(), farm_id, createdAt: now, updatedAt: now, deleted_at: null };
    const mapped = mapMaintenanceScheduleToDb(record);
    setMaintenanceSchedules(current => [...current, record]);
    const ok = await persist('maintenance_schedules', 'insert', mapped);
    if (!ok) setMaintenanceSchedules(current => current.filter(item => item.id !== record.id));
    return ok;
  }, [farm_id, persist, setMaintenanceSchedules]);

  const updateMaintenanceSchedule = useCallback(async (record: MaintenanceSchedule): Promise<boolean> => {
    if (!farm_id) { toast.error('No farm selected.'); return false; }
    const previous = maintenanceSchedules.find(item => item.id === record.id);
    const updated = { ...record, farm_id, updatedAt: new Date().toISOString() };
    setMaintenanceSchedules(current => current.map(item => item.id === record.id ? updated : item));
    const ok = await persist('maintenance_schedules', 'update', mapMaintenanceScheduleToDb(updated));
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
      setMaintenanceSchedules(current => current.map(item => item.id === input.scheduleId ? {
        ...item,
        lastDoneReading: input.readingAtService,
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
    try {
      if (!isOnline) {
        await syncQueue.enqueueMutation('maintenance_logs', 'insert', { ...mapped, [MAINTENANCE_RPC_KEY]: rpcArgs }, farm_id);
        if (onMutation) await onMutation();
        return true;
      }
      const { error } = await supabase.rpc('log_maintenance', rpcArgs);
      if (!error) return true;
      if (isUnknownMutationOutcome(error)) {
        await syncQueue.enqueueMutation('maintenance_logs', 'insert', { ...mapped, [MAINTENANCE_RPC_KEY]: rpcArgs }, farm_id);
        if (onMutation) await onMutation();
        return true;
      }
      throw error;
    } catch (error) {
      console.error('Failed to log maintenance:', error);
      setMaintenanceLogs(current => current.filter(item => item.id !== record.id));
      setMaintenanceSchedules(priorSchedules);
      setEquipment(priorEquipment);
      return false;
    }
  }, [equipment, farm_id, isOnline, maintenanceSchedules, onMutation, setEquipment, setMaintenanceLogs, setMaintenanceSchedules]);

  const updateMaintenanceLog = useCallback(async (record: MaintenanceLog): Promise<boolean> => {
    if (!farm_id) { toast.error('No farm selected.'); return false; }
    const previous = maintenanceLogs.find(item => item.id === record.id);
    const updated = { ...record, farm_id, updatedAt: new Date().toISOString() };
    setMaintenanceLogs(current => current.map(item => item.id === record.id ? updated : item));
    const ok = await persist('maintenance_logs', 'update', mapMaintenanceLogToDb(updated));
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
    deleteEquipment,
    addMaintenanceSchedule,
    updateMaintenanceSchedule,
    deleteMaintenanceSchedule,
    logMaintenance,
    updateMaintenanceLog,
    deleteMaintenanceLog,
  };
}
