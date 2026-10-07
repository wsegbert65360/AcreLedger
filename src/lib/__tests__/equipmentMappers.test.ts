import { describe, expect, it } from 'vitest';
import type { Equipment, MaintenanceLog, MaintenanceSchedule } from '@/types/equipment';
import {
  mapEquipmentFromDb,
  mapEquipmentToDb,
  mapEquipmentUpdateToDb,
  mapMaintenanceLogFromDb,
  mapMaintenanceLogToDb,
  mapMaintenanceLogUpdateToDb,
  mapMaintenanceScheduleFromDb,
  mapMaintenanceScheduleToDb,
  mapMaintenanceScheduleUpdateToDb,
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

  it('clears optional update fields with null and never emits meter columns', () => {
    const equipment: Equipment = {
      id: 'e1', farm_id: 'f1', kind: 'tractor', meterUnit: 'hours', currentReading: 12.3,
      status: 'active', make: '', model: undefined, serialNumber: '', notes: '',
      ...timestamps, deleted_at: null,
    };
    const row = mapEquipmentUpdateToDb(equipment);
    expect(row).toMatchObject({
      make: null, model: null, serial_number: null, notes: null, year: null,
    });
    expect(row).not.toHaveProperty('farm_id');
    expect(row).not.toHaveProperty('current_reading');
    expect(row).not.toHaveProperty('reading_updated_at');
    expect(row).not.toHaveProperty('meter_unit');
  });

  it('clears schedule intervals and log vendor on update', () => {
    const schedule: MaintenanceSchedule = {
      id: 's1', farm_id: 'f1', equipmentId: 'e1', taskName: 'Oil',
      intervalValue: undefined, intervalDays: 30, lastDoneReading: undefined,
      ...timestamps, deleted_at: null,
    };
    expect(mapMaintenanceScheduleUpdateToDb(schedule)).toMatchObject({
      interval_value: null, last_done_reading: null, interval_days: 30,
    });
    expect(mapMaintenanceScheduleUpdateToDb(schedule)).not.toHaveProperty('farm_id');

    const log: MaintenanceLog = {
      id: 'l1', farm_id: 'f1', equipmentId: 'e1', kind: 'repair', performedOn: '2026-06-01',
      vendor: '', description: undefined, ...timestamps, deleted_at: null,
    };
    expect(mapMaintenanceLogUpdateToDb(log)).toMatchObject({ vendor: null, description: null });
    expect(mapMaintenanceLogUpdateToDb(log)).not.toHaveProperty('farm_id');
  });
});
