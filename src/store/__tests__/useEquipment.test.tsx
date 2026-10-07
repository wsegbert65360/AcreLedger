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

  it('queues child-first soft deletes before equipment', async () => {
    const { result } = renderEquipmentHook({ equipment: [machine], schedules: [task], logs: [repair] });
    await act(async () => {
      expect(await result.current.ops.deleteEquipment('e1')).toBe(true);
    });
    expect(enqueueMutations).toHaveBeenCalledWith([
      expect.objectContaining({ tableName: 'maintenance_logs' }),
      expect.objectContaining({ tableName: 'maintenance_schedules' }),
      expect.objectContaining({ tableName: 'equipment' }),
    ]);
    expect(result.current.machines.value[0].deleted_at).toBeTruthy();
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
      expect.objectContaining({ __maintenance_rpc: expect.objectContaining({ p_equipment_id: 'e1' }) }),
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

  it('uses a conditional cloud write so the higher reading wins', async () => {
    const { result } = renderEquipmentHook({ online: true, equipment: [machine] });
    await act(async () => {
      expect(await result.current.ops.updateEquipmentReading('e1', 1200)).toBe('saved');
    });
    expect(supabaseMock.fns.lte).toHaveBeenCalledWith('current_reading', 1200);
    expect(result.current.machines.value[0].currentReading).toBe(1200);
  });
});
