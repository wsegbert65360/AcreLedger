import { describe, expect, it } from 'vitest';
import type { Equipment, MaintenanceLog, MaintenanceSchedule } from '@/types/equipment';
import {
  mapEquipmentFromDb,
  mapEquipmentToDb,
  mapMaintenanceLogFromDb,
  mapMaintenanceLogToDb,
  mapMaintenanceScheduleFromDb,
  mapMaintenanceScheduleToDb,
} from '../mappers';

const timestamps = { createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-02T00:00:00Z' };

describe('equipment mappers', () => {
  it('round-trips equipment numeric rows and omits untouched optional columns', () => {
    const equipment: Equipment = {
      id: 'e1', farm_id: 'f1', kind: 'tractor', meterUnit: 'hours', currentReading: 12.3,
      status: 'active', ...timestamps, deleted_at: null,
    };
    const row = mapEquipmentToDb(equipment);
    expect(row).not.toHaveProperty('make');
    expect(row).not.toHaveProperty('deleted_at');
    expect(mapEquipmentFromDb({ ...row, current_reading: '12.3' } as any)).toEqual(equipment);
  });

  it('maps schedule names and nullable baselines', () => {
    const schedule: MaintenanceSchedule = {
      id: 's1', farm_id: 'f1', equipmentId: 'e1', taskName: 'Oil', intervalDays: 365,
      ...timestamps, deleted_at: null,
    };
    const row = mapMaintenanceScheduleToDb(schedule);
    expect(row).toMatchObject({ equipment_id: 'e1', task_name: 'Oil', interval_days: 365 });
    expect(row).not.toHaveProperty('last_done_at');
    expect(mapMaintenanceScheduleFromDb(row as any)).toEqual(schedule);
  });

  it('maps log costs and omits optional nulls', () => {
    const log: MaintenanceLog = {
      id: 'l1', farm_id: 'f1', equipmentId: 'e1', kind: 'repair', performedOn: '2026-06-01',
      costParts: 12.5, ...timestamps, deleted_at: null,
    };
    const row = mapMaintenanceLogToDb(log);
    expect(row).toMatchObject({ equipment_id: 'e1', performed_on: '2026-06-01', cost_parts: 12.5 });
    expect(row).not.toHaveProperty('vendor');
    expect(mapMaintenanceLogFromDb({ ...row, cost_parts: '12.5' } as any)).toEqual(log);
  });

  it('validates required identifiers', () => {
    expect(() => mapEquipmentToDb({ id: '', farm_id: '' } as Equipment)).toThrow('mapEquipmentToDb');
    expect(() => mapMaintenanceScheduleToDb({} as MaintenanceSchedule)).toThrow('mapMaintenanceScheduleToDb');
    expect(() => mapMaintenanceLogToDb({} as MaintenanceLog)).toThrow('mapMaintenanceLogToDb');
  });
});
