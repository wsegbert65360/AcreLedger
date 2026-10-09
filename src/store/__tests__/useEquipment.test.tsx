/**
 * @vitest-environment jsdom
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, useStatefulArray } from '@/test/hookTestHarness';
import { createSupabaseMock } from '@/test/supabaseMock';
import type { Equipment, MaintenanceLog, MaintenanceSchedule } from '@/types/equipment';

const supabaseMock = createSupabaseMock();
const enqueueMutation = vi.fn();
const enqueueMutations = vi.fn();

vi.doMock('@/lib/supabase', () => ({ supabase: supabaseMock.client }));
vi.doMock('@/lib/syncQueue', async importOriginal => {
  const original = await importOriginal<typeof import('@/lib/syncQueue')>();
  return {
    ...original,
    syncQueue: { enqueueMutation, enqueueMutations },
  };
});
vi.doMock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

let useEquipment: (typeof import('../useEquipment'))['useEquipment'];

beforeAll(async () => {
  ({ useEquipment } = await import('../useEquipment'));
});

const machine: Equipment = {
  id: 'e1', farm_id: 'farm-1', kind: 'tractor', make: 'Deere', meterUnit: 'hours',
  currentReading: 1000, status: 'active', createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z', deleted_at: null,
};
const task: MaintenanceSchedule = {
  id: 's1', farm_id: 'farm-1', equipmentId: 'e1', taskName: 'Oil', intervalValue: 250,
  createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z', deleted_at: null,
};
const repair: MaintenanceLog = {
  id: 'l1', farm_id: 'farm-1', equipmentId: 'e1', kind: 'repair', performedOn: '2026-01-01',
  createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z', deleted_at: null,
};

function renderEquipmentHook(options: {
  online?: boolean;
  equipment?: Equipment[];
  schedules?: MaintenanceSchedule[];
  logs?: MaintenanceLog[];
} = {}) {
  return renderHook(() => {
    const machines = useStatefulArray(options.equipment ?? []);
    const schedules = useStatefulArray(options.schedules ?? []);
    const logs = useStatefulArray(options.logs ?? []);
    const ops = useEquipment({
      farm_id: 'farm-1',
      equipment: machines.value,
      maintenanceSchedules: schedules.value,
      maintenanceLogs: logs.value,
      setEquipment: machines.setValue,
      setMaintenanceSchedules: schedules.setValue,
      setMaintenanceLogs: logs.setValue,
      isOnline: options.online ?? false,
    });
    return { machines, schedules, logs, ops };
  });
}

beforeEach(() => {
  supabaseMock.reset();
  enqueueMutation.mockReset().mockResolvedValue(undefined);
  enqueueMutations.mockReset().mockResolvedValue(undefined);
});

describe('useEquipment', () => {
  it('optimistically creates equipment and queues the mapped insert offline', async () => {
    const { result } = renderEquipmentHook();
    await act(async () => {
      expect(await result.current.ops.addEquipment({
        kind: 'tractor', make: 'Deere', meterUnit: 'hours', currentReading: 0, status: 'active',
      })).toBe(true);
    });
    expect(result.current.machines.value).toHaveLength(1);
    expect(enqueueMutation).toHaveBeenCalledWith('equipment', 'insert', expect.objectContaining({
      farm_id: 'farm-1', kind: 'tractor', current_reading: 0,
    }), 'farm-1');
  });

  it('queues one cascade-delete RPC envelope', async () => {
    const { result } = renderEquipmentHook({ equipment: [machine], schedules: [task], logs: [repair] });
    await act(async () => {
      expect(await result.current.ops.deleteEquipment('e1')).toBe(true);
    });
    expect(enqueueMutation).toHaveBeenCalledWith(
      'equipment',
      'soft_delete',
      expect.objectContaining({
        id: 'e1',
        __equipment_rpc: expect.objectContaining({ rpc: 'soft_delete_equipment_cascade' }),
      }),
      'farm-1',
    );
    expect(result.current.machines.value[0].deleted_at).toBeTruthy();
    expect(result.current.schedules.value[0].deleted_at).toBeTruthy();
  });

  it('queues one atomic RPC replay record and updates service baselines offline', async () => {
    const { result } = renderEquipmentHook({ equipment: [machine], schedules: [task] });
    await act(async () => {
      expect(await result.current.ops.logMaintenance({
        equipmentId: 'e1', scheduleId: 's1', kind: 'service', performedOn: '2026-06-01',
        readingAtService: 1100, description: 'Oil changed',
      })).toBe(true);
    });
    expect(enqueueMutation).toHaveBeenCalledWith(
      'maintenance_logs', 'insert',
      expect.objectContaining({
        __equipment_rpc: expect.objectContaining({
          rpc: 'log_maintenance',
          args: expect.objectContaining({ p_equipment_id: 'e1' }),
        }),
      }),
      'farm-1',
    );
    expect(result.current.machines.value[0].currentReading).toBe(1100);
    expect(result.current.schedules.value[0]).toMatchObject({ lastDoneReading: 1100, lastDoneAt: '2026-06-01' });
  });

  it('requires confirmation before lowering a reading', async () => {
    const { result } = renderEquipmentHook({ equipment: [machine] });
    await act(async () => {
      expect(await result.current.ops.updateEquipmentReading('e1', 900)).toBe('warning');
    });
    expect(enqueueMutation).not.toHaveBeenCalled();
    expect(result.current.machines.value[0].currentReading).toBe(1000);
  });

  it('uses the reading RPC so the higher stored value wins', async () => {
    supabaseMock.setRpcResult({ data: { current_reading: 1300 }, error: null });
    const { result } = renderEquipmentHook({ online: true, equipment: [machine] });
    await act(async () => {
      expect(await result.current.ops.updateEquipmentReading('e1', 1200)).toBe('saved');
    });
    expect(supabaseMock.fns.rpc).toHaveBeenCalledWith('update_equipment_reading', expect.objectContaining({
      p_equipment_id: 'e1', p_reading: 1200, p_force_lower: false,
    }));
    expect(result.current.machines.value[0].currentReading).toBe(1300);
  });

  it('snapshots the current meter onto a new reading-based task', async () => {
    const { result } = renderEquipmentHook({ equipment: [machine] });
    await act(async () => {
      expect(await result.current.ops.addMaintenanceSchedule({
        equipmentId: 'e1', taskName: 'Oil change', intervalValue: 250,
      })).toBe(true);
    });
    expect(result.current.schedules.value[0].lastDoneReading).toBe(1000);
    expect(enqueueMutation).toHaveBeenCalledWith(
      'maintenance_schedules',
      'insert',
      expect.objectContaining({ last_done_reading: 1000 }),
      'farm-1',
    );
  });

  it('sends null when an optional equipment field is cleared', async () => {
    const { result } = renderEquipmentHook({ online: true, equipment: [{ ...machine, model: '8R' }] });
    await act(async () => {
      expect(await result.current.ops.updateEquipment({ ...machine, model: undefined })).toBe(true);
    });
    expect(supabaseMock.fns.update).toHaveBeenCalledWith(
      expect.objectContaining({ model: null }),
      { count: 'exact' },
    );
    expect(supabaseMock.fns.update.mock.calls[0][0]).not.toHaveProperty('farm_id');
    expect(supabaseMock.fns.update.mock.calls[0][0]).not.toHaveProperty('meter_unit');
  });

  it('changes miles to kilometres through one RPC', async () => {
    const truck: Equipment = { ...machine, id: 'e2', kind: 'truck', meterUnit: 'miles', currentReading: 10 };
    const { result } = renderEquipmentHook({
      equipment: [truck],
      schedules: [{ ...task, id: 's2', equipmentId: 'e2', intervalValue: 5000, lastDoneReading: 1000 }],
    });
    await act(async () => {
      expect(await result.current.ops.setEquipmentMeterUnit('e2', 'miles', 'km')).toBe(true);
    });
    expect(enqueueMutation).toHaveBeenCalledWith(
      'equipment',
      'update',
      expect.objectContaining({
        __equipment_rpc: expect.objectContaining({
          rpc: 'set_equipment_meter_unit',
          args: expect.objectContaining({ p_from_unit: 'miles', p_to_unit: 'km' }),
        }),
      }),
      'farm-1',
    );
    expect(result.current.machines.value[0]).toMatchObject({ meterUnit: 'km', currentReading: 16.1 });
    expect(result.current.schedules.value[0].intervalValue).toBe(8046.7);
  });

  it('snapshots the replacement reading when an hours unit change has no prior baseline', async () => {
    const { result } = renderEquipmentHook({ equipment: [machine], schedules: [task] });
    await act(async () => {
      expect(await result.current.ops.setEquipmentMeterUnit('e1', 'hours', 'miles', {
        currentReading: 10,
        schedules: [{ id: 's1', intervalValue: 50, lastDoneReading: null }],
      })).toBe(true);
    });
    expect(result.current.schedules.value[0].lastDoneReading).toBe(10);
    expect(enqueueMutation).toHaveBeenCalledWith(
      'equipment',
      'update',
      expect.objectContaining({
        __equipment_rpc: expect.objectContaining({
          args: expect.objectContaining({
            p_schedules: [{ id: 's1', interval_value: 50, last_done_reading: 10 }],
          }),
        }),
      }),
      'farm-1',
    );
  });

  it('rolls back the equipment and schedules together when unit conversion fails', async () => {
    const truck: Equipment = { ...machine, id: 'e2', kind: 'truck', meterUnit: 'miles', currentReading: 10 };
    const truckTask = { ...task, id: 's2', equipmentId: 'e2', intervalValue: 5000, lastDoneReading: 1000 };
    supabaseMock.setRpcResult({ data: null, error: { code: '23514', message: 'Invalid conversion' } });
    const { result } = renderEquipmentHook({ online: true, equipment: [truck], schedules: [truckTask] });

    await act(async () => {
      expect(await result.current.ops.setEquipmentMeterUnit('e2', 'miles', 'km')).toBe(false);
    });

    expect(result.current.machines.value[0]).toMatchObject({ meterUnit: 'miles', currentReading: 10 });
    expect(result.current.schedules.value[0]).toMatchObject({ intervalValue: 5000, lastDoneReading: 1000 });
  });

  it('records a back-dated service without lowering the meter or forcing a correction', async () => {
    const current: Equipment = { ...machine, currentReading: 3100, readingUpdatedAt: '2026-09-01T12:00:00Z' };
    const { result } = renderEquipmentHook({ equipment: [current] });
    await act(async () => {
      expect(await result.current.ops.logMaintenance({
        equipmentId: 'e1', kind: 'service', performedOn: '2026-03-15', readingAtService: 2800,
      })).toBe(true);
    });
    expect(result.current.machines.value[0].currentReading).toBe(3100);
    expect(enqueueMutation).toHaveBeenCalledWith(
      'maintenance_logs', 'insert',
      expect.objectContaining({
        __equipment_rpc: expect.objectContaining({
          args: expect.objectContaining({ p_reading: 2800, p_force_lower: false }),
        }),
      }),
      'farm-1',
    );
  });

  it('rounds readings and costs to storage precision before queueing the replay', async () => {
    const { result } = renderEquipmentHook({ equipment: [machine] });
    await act(async () => {
      expect(await result.current.ops.logMaintenance({
        equipmentId: 'e1', kind: 'repair', performedOn: '2026-06-01',
        readingAtService: 1100.46, costParts: 12.345, costLabor: 5.005,
      })).toBe(true);
    });
    expect(enqueueMutation).toHaveBeenCalledWith(
      'maintenance_logs', 'insert',
      expect.objectContaining({
        __equipment_rpc: expect.objectContaining({
          args: expect.objectContaining({ p_reading: 1100.5, p_cost_parts: 12.35, p_cost_labor: 5.01 }),
        }),
      }),
      'farm-1',
    );
  });

  it('rejects a negative cost without queueing anything', async () => {
    const { result } = renderEquipmentHook({ equipment: [machine] });
    await act(async () => {
      expect(await result.current.ops.logMaintenance({
        equipmentId: 'e1', kind: 'repair', performedOn: '2026-06-01', costParts: -4,
      })).toBe(false);
    });
    expect(enqueueMutation).not.toHaveBeenCalled();
  });

  it('keeps the stored baseline when a task edit did not change it', async () => {
    const stored: MaintenanceSchedule = { ...task, lastDoneReading: 1200, lastDoneAt: '2026-07-01' };
    const { result } = renderEquipmentHook({ online: true, equipment: [machine], schedules: [stored] });
    await act(async () => {
      expect(await result.current.ops.updateMaintenanceSchedule(
        { ...stored, lastDoneReading: 1000, lastDoneAt: '2026-05-01', taskName: 'Oil & filter' },
        { baselineEdited: false },
      )).toBe(true);
    });
    expect(result.current.schedules.value[0]).toMatchObject({
      taskName: 'Oil & filter', lastDoneReading: 1200, lastDoneAt: '2026-07-01',
    });
    const sent = supabaseMock.fns.update.mock.calls.at(-1)?.[0] as Record<string, unknown> | undefined;
    expect(sent).toMatchObject({ task_name: 'Oil & filter' });
    expect(sent).not.toHaveProperty('last_done_reading');
    expect(sent).not.toHaveProperty('last_done_at');
  });

  it('rounds new machine readings and task intervals to meter precision', async () => {
    const { result } = renderEquipmentHook({ equipment: [machine] });
    await act(async () => {
      expect(await result.current.ops.addEquipment({
        kind: 'truck', meterUnit: 'miles', currentReading: 1234.56, status: 'active',
      })).toBe(true);
      expect(await result.current.ops.addMaintenanceSchedule({
        equipmentId: 'e1', taskName: 'Grease', intervalValue: 50.25, lastDoneReading: 999.95,
      })).toBe(true);
    });
    expect(enqueueMutation).toHaveBeenCalledWith(
      'equipment', 'insert', expect.objectContaining({ current_reading: 1234.6 }), 'farm-1',
    );
    expect(enqueueMutation).toHaveBeenCalledWith(
      'maintenance_schedules', 'insert',
      expect.objectContaining({ interval_value: 50.3, last_done_reading: 1000 }),
      'farm-1',
    );
  });

  it('leaves an unadvanced task alone when a back-dated log fails', async () => {
    const stored: MaintenanceSchedule = { ...task, lastDoneReading: 1200, lastDoneAt: '2026-07-01' };
    supabaseMock.setRpcResult({ data: null, error: { code: '23514', message: 'rejected' } });
    const { result } = renderEquipmentHook({ online: true, equipment: [machine], schedules: [stored] });
    await act(async () => {
      expect(await result.current.ops.logMaintenance({
        equipmentId: 'e1', scheduleId: 's1', kind: 'service', performedOn: '2026-03-01', readingAtService: 900,
      })).toBe(false);
    });
    expect(result.current.schedules.value[0]).toMatchObject({ lastDoneReading: 1200, lastDoneAt: '2026-07-01' });
    expect(result.current.logs.value).toHaveLength(0);
  });
});
